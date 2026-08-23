import { strict as assert } from "node:assert"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { test } from "node:test"
import { convertTagTree, eventToPointerSet, type ConversionAudit } from "./convert-tag-schema"

function json(file: string, value: any): void {
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`)
}

function fixture(): { root: string; input: string; output: string; audit: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "tag-converter-"))
  const input = path.join(root, "input")
  const output = path.join(root, "staging")
  const audit = path.join(root, "audit.json")
  json(path.join(input, "main", "conf.json"), { tags: { main: { startDate: "2025-01-01" } } })
  json(path.join(input, "main", "events.json"), { updated: "same", events: [
    { id: "shared", title: "Base", recurrence: { daysOfWeek: ["monday"] } },
    { id: "base-only", title: "Base only" },
  ] })
  json(path.join(input, "season", "conf.json"), { parent: "main", tags: { season: { startDate: "2025-06-01" } } })
  json(path.join(input, "season", "events.json"), { events: [
    { id: "shared", title: "Season", nested: { enabled: true }, list: [1, 2] },
    { id: "base-only", deleted: true },
    { id: "season-owned", title: "Season owned" },
  ] })
  json(path.join(input, "local", "conf.json"), { parent: "season", storage: { tipsSuffix: "keep" }, tags: { local: { startDate: "2025-07-01" } } })
  json(path.join(input, "local", "events.json"), { events: [{ id: "shared", description: "Local" }] })
  fs.writeFileSync(path.join(input, "local", "favicon.ico"), "asset")
  fs.writeFileSync(path.join(input, "servers.json"), "{}\n")
  return { root, input, output, audit }
}

test("pointer sets escape keys, flatten objects, and keep arrays atomic", () => {
  assert.deepEqual(eventToPointerSet({ id: "x", "a/b": { "c~d": 1 }, rows: [{ value: 2 }], empty: {} }), {
    "/a~1b/c~0d": 1,
    "/empty": {},
    "/rows": [{ value: 2 }],
  })
})

test("dry run is deterministic and never creates staging", (t) => {
  const f = fixture()
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }))
  const options = { inputDir: f.input, outputDir: f.output, auditPath: f.audit, eventsSuffix: "v3" }
  const first = convertTagTree(options)
  const firstBytes = fs.readFileSync(f.audit, "utf8")
  const second = convertTagTree(options)
  assert.deepEqual(second, first)
  assert.equal(fs.readFileSync(f.audit, "utf8"), firstBytes)
  assert.equal(fs.existsSync(f.output), false)
  assert.deepEqual(first.candidates.map((item) => `${item.tag}/${item.id}`), ["main/base-only", "main/shared", "season/season-owned"])
})

test("write requires audit acceptance and converts lineage, operations, suffix, and assets", (t) => {
  const f = fixture()
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }))
  convertTagTree({ inputDir: f.input, outputDir: f.output, auditPath: f.audit, eventsSuffix: "v3" })
  const review = JSON.parse(fs.readFileSync(f.audit, "utf8")) as ConversionAudit
  for (const candidate of review.candidates) candidate.classification = "owned"
  json(f.audit, review)
  convertTagTree({ inputDir: f.input, outputDir: f.output, auditPath: path.join(f.root, "final-audit.json"), classificationsPath: f.audit, eventsSuffix: "v3", write: true })

  const conf = JSON.parse(fs.readFileSync(path.join(f.output, "local", "conf.json"), "utf8"))
  assert.deepEqual(conf.parents, ["season", "main"])
  assert.equal(conf.parent, undefined)
  assert.deepEqual(conf.storage, { tipsSuffix: "keep", eventsSuffix: "v3" })
  const season = JSON.parse(fs.readFileSync(path.join(f.output, "season", "events.json"), "utf8"))
  assert.deepEqual(season.operations, [
    { kind: "override", id: "shared", set: { "/list": [1, 2], "/nested/enabled": true, "/title": "Season" } },
    { kind: "delete", id: "base-only" },
    { kind: "owned", event: { id: "season-owned", title: "Season owned" } },
  ])
  assert.equal(fs.readFileSync(path.join(f.output, "local", "favicon.ico"), "utf8"), "asset")
  assert.equal(fs.readFileSync(path.join(f.output, "servers.json"), "utf8"), "{}\n")
})

test("classification can preserve an absent stale record as a dormant override", (t) => {
  const f = fixture()
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }))
  const dry = convertTagTree({ inputDir: f.input, outputDir: f.output, auditPath: f.audit, eventsSuffix: "v3" })
  for (const candidate of dry.candidates) candidate.classification = candidate.id === "season-owned" ? "override" : "owned"
  json(f.audit, dry)
  convertTagTree({ inputDir: f.input, outputDir: f.output, auditPath: path.join(f.root, "final.json"), classificationsPath: f.audit, eventsSuffix: "v3", write: true })
  const events = JSON.parse(fs.readFileSync(path.join(f.output, "season", "events.json"), "utf8"))
  assert.deepEqual(events.operations[2], { kind: "override", id: "season-owned", set: { "/title": "Season owned" } })
})

test("rejects unresolved candidates, missing parents, cycles, inconsistent explicit suffixes, and missing anchors", (t) => {
  const cases: Array<(f: ReturnType<typeof fixture>) => void> = [
    (f) => assert.throws(() => convertTagTree({ inputDir: f.input, outputDir: f.output, auditPath: f.audit, eventsSuffix: "v3", write: true }), /reviewed classification audit/),
    (f) => { const file = path.join(f.input, "season", "conf.json"); const conf = JSON.parse(fs.readFileSync(file, "utf8")); conf.parent = "missing"; json(file, conf); assert.throws(() => convertTagTree({ inputDir: f.input, outputDir: f.output, auditPath: f.audit, eventsSuffix: "v3" }), /missing/) },
    (f) => { const file = path.join(f.input, "main", "conf.json"); const conf = JSON.parse(fs.readFileSync(file, "utf8")); conf.parent = "local"; json(file, conf); assert.throws(() => convertTagTree({ inputDir: f.input, outputDir: f.output, auditPath: f.audit, eventsSuffix: "v3" }), /cycle/) },
    (f) => { const file = path.join(f.input, "local", "conf.json"); const conf = JSON.parse(fs.readFileSync(file, "utf8")); delete conf.parent; conf.parents = ["season"]; json(file, conf); assert.throws(() => convertTagTree({ inputDir: f.input, outputDir: f.output, auditPath: f.audit, eventsSuffix: "v3" }), /Inconsistent lineage suffix/) },
    (f) => { const file = path.join(f.input, "local", "conf.json"); const conf = JSON.parse(fs.readFileSync(file, "utf8")); delete conf.tags.local.startDate; json(file, conf); assert.throws(() => convertTagTree({ inputDir: f.input, outputDir: f.output, auditPath: f.audit, eventsSuffix: "v3" }), /required valid self startDate/) },
  ]
  for (const run of cases) {
    const f = fixture()
    run(f)
    fs.rmSync(f.root, { recursive: true, force: true })
  }
  t.after(() => undefined)
})

test("v2 input is idempotent and preserves its suffix", (t) => {
  const f = fixture()
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }))
  convertTagTree({ inputDir: f.input, outputDir: f.output, auditPath: f.audit, eventsSuffix: "v3" })
  convertTagTree({ inputDir: f.input, outputDir: f.output, auditPath: f.audit, eventsSuffix: "v3", acceptOwned: true, write: true })
  const second = path.join(f.root, "second")
  const result = convertTagTree({ inputDir: f.output, outputDir: second, auditPath: path.join(f.root, "v2-audit.json"), write: true })
  assert.equal(result.candidates.length, 0)
  assert.equal(fs.readFileSync(path.join(second, "local", "events.json"), "utf8"), fs.readFileSync(path.join(f.output, "local", "events.json"), "utf8"))
  assert.equal(JSON.parse(fs.readFileSync(path.join(second, "local", "conf.json"), "utf8")).storage.eventsSuffix, "v3")
})

test("source fingerprint prevents applying stale classifications", (t) => {
  const f = fixture()
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }))
  const dry = convertTagTree({ inputDir: f.input, outputDir: f.output, auditPath: f.audit, eventsSuffix: "v3" })
  for (const candidate of dry.candidates) candidate.classification = "owned"
  json(f.audit, dry)
  const eventsFile = path.join(f.input, "local", "events.json")
  const events = JSON.parse(fs.readFileSync(eventsFile, "utf8")); events.events[0].description = "changed"; json(eventsFile, events)
  assert.throws(() => convertTagTree({ inputDir: f.input, outputDir: f.output, auditPath: path.join(f.root, "new.json"), classificationsPath: f.audit, eventsSuffix: "v3", write: true }), /fingerprint/)
})

test("requires a new consistent suffix and keeps all audit writes outside input", (t) => {
  const f = fixture()
  t.after(() => fs.rmSync(f.root, { recursive: true, force: true }))
  const confFile = path.join(f.input, "main", "conf.json")
  const conf = JSON.parse(fs.readFileSync(confFile, "utf8")); conf.storage = { eventsSuffix: "old" }; json(confFile, conf)
  assert.throws(() => convertTagTree({ inputDir: f.input, outputDir: f.output, auditPath: f.audit }), /explicit --events-suffix/)
  assert.throws(() => convertTagTree({ inputDir: f.input, outputDir: f.output, auditPath: f.audit, eventsSuffix: "old" }), /requires a new/)
  assert.throws(() => convertTagTree({ inputDir: f.input, outputDir: f.output, auditPath: path.join(f.input, "audit.json"), eventsSuffix: "new" }), /outside the immutable input tree/)
  assert.equal(fs.existsSync(path.join(f.input, "audit.json")), false)
})

import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"
import { composeEventsForDate, type ConfigurationLayer } from "./composition"
import { normalizeEventOperations } from "./event-operations"

const operations = (items: unknown[]) => normalizeEventOperations({ schemaVersion: 2, operations: items })

const layers: ConfigurationLayer[] = [
  {
    tag: "main",
    config: { tags: { main: { startDate: "2024-01-01" } }, brand: { root: true } },
    eventOperations: operations([
      { kind: "owned", event: { id: "shared", title: "Main", description: "Main description" } },
      { kind: "owned", event: { id: "returning", title: "Returning" } },
    ]),
  },
  {
    tag: "s4",
    config: { tags: { s4: { startDate: "2025-12-15" } }, brand: { season: 4 } },
    eventOperations: operations([
      { kind: "override", id: "shared", set: { "/title": "Season 4", "/seasonOnly": true }, remove: ["/description"] },
      { kind: "owned", event: { id: "s4-only", title: "S4 only" } },
      { kind: "delete", id: "returning" },
    ]),
  },
  {
    tag: "s5_preview",
    config: { tags: { s5_preview: { startDate: "2026-01-02" } }, brand: { season: 5 } },
    eventOperations: operations([
      { kind: "override", id: "shared", set: { "/title": "Preview" } },
      { kind: "owned", event: { id: "preview-only", title: "Preview only" } },
    ]),
  },
  {
    tag: "996",
    config: {
      tags: {
        "996": { startDate: "2024-10-10" },
        s4: { startDate: "2025-12-22", endDate: "2026-01-01" },
      },
      brand: { local: true },
    },
    eventOperations: operations([
      { kind: "override", id: "shared", set: { "/local": true } },
      { kind: "override", id: "s4-only", set: { "/title": "Locally edited S4" } },
      { kind: "delete", id: "preview-only" },
      { kind: "owned", event: { id: "local-only", title: "Local only" } },
    ]),
  },
]

const byId = (events: Record<string, unknown>[]) => Object.fromEntries(events.map((event) => [event.id, event]))

test("date-aware composition honors inclusive parent windows and keeps config from inactive layers", () => {
  const before = composeEventsForDate({ layers, localTag: "996", date: "2025-12-21" })
  assert.deepEqual(before.activeSourceTags, ["main", "996"])
  assert.deepEqual(Object.keys(byId(before.events)).sort(), ["local-only", "returning", "shared"])
  assert.deepEqual(before.tagConfig.brand, { root: true, season: 5, local: true })

  const lastS4 = composeEventsForDate({ layers, localTag: "996", date: "2026-01-01" })
  assert.deepEqual(lastS4.activeSourceTags, ["main", "s4", "996"])
  assert.deepEqual(byId(lastS4.events).shared, { id: "shared", title: "Season 4", seasonOnly: true, local: true })
  assert.equal(byId(lastS4.events)["s4-only"].title, "Locally edited S4")
  assert.equal(byId(lastS4.events).returning, undefined)

  const firstPreview = composeEventsForDate({ layers, localTag: "996", date: "2026-01-02" })
  assert.deepEqual(firstPreview.activeSourceTags, ["main", "s5_preview", "996"])
  assert.deepEqual(byId(firstPreview.events).shared, {
    id: "shared", title: "Preview", description: "Main description", local: true,
  })
  assert.equal(byId(firstPreview.events)["s4-only"], undefined, "dormant local override must not resurrect an expired event")
  assert.equal(byId(firstPreview.events)["preview-only"], undefined, "local delete applies only when the inherited ID exists")
  assert.equal(byId(firstPreview.events).returning.title, "Returning", "expired parent delete is no longer applied")
  assert.deepEqual(firstPreview.localOwnedIds, ["local-only"])
  assert.equal(firstPreview.sourceTagById.shared, "main", "overrides do not change ownership provenance")
})

test("owned events survive without a lower event while overrides and deletes remain dormant", () => {
  const composition = composeEventsForDate({
    date: "2026-01-01",
    layers: [{
      tag: "leaf",
      config: { tags: { leaf: { startDate: "2027-01-01" } } },
      eventOperations: operations([
        { kind: "owned", event: { id: "owned", title: "Owned" } },
        { kind: "override", id: "absent", set: { "/title": "No" } },
        { kind: "delete", id: "also-absent" },
      ]),
    }],
  })
  assert.deepEqual(composition.events, [{ id: "owned", title: "Owned" }])
})

test("contextual bounds validate strictly and null endDate removes an inherited upper bound", () => {
  const unbounded = structuredClone(layers)
  ;(unbounded[3].config!.tags.s4 as any).endDate = null
  assert.ok(composeEventsForDate({ layers: unbounded, date: "2026-02-01" }).activeSourceTags.includes("s4"))

  const invalidDate = structuredClone(layers)
  ;(invalidDate[3].config!.tags.s4 as any).endDate = "2025-01-01"
  assert.throws(() => composeEventsForDate({ layers: invalidDate, date: "2026-01-01" }), /precedes/)

  const nullStart = structuredClone(layers)
  ;(nullStart[3].config!.tags.s4 as any).startDate = null
  assert.throws(() => composeEventsForDate({ layers: nullStart, date: "2026-01-01" }), /cannot be null/)

  assert.throws(() => composeEventsForDate({ layers, date: "2026-02-30" }), /Invalid date/)
  assert.throws(() => composeEventsForDate({ layers: [...layers, layers[3]], date: "2026-01-01", localTag: "996" }), /Duplicate/)
})

test("shared cross-runtime golden fixture matches all boundary cases", () => {
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/date-scoped-parent-chain-v1.json", import.meta.url), "utf8"))
  const fixtureLayers = fixture.layers.map((layer: any) => ({
    tag: layer.tag,
    config: layer.config,
    eventOperations: normalizeEventOperations(layer.eventDocument),
  }))
  for (const expected of fixture.cases) {
    const result = composeEventsForDate({ layers: fixtureLayers, localTag: fixture.localTag, date: expected.date })
    assert.deepEqual(result.activeSourceTags, expected.activeSourceTags)
    assert.deepEqual(result.events.map((event) => event.id).sort(), expected.eventIds)
  }
})

test("date composition enforces ancestry and operation bounds", () => {
  const tooDeep: ConfigurationLayer[] = Array.from({ length: 34 }, (_, index) => ({
    tag: `tag-${index}`,
    config: { tags: { [`tag-${index}`]: { startDate: "2025-01-01" } } },
    eventOperations: operations([]),
  }))
  assert.throws(() => composeEventsForDate({ layers: tooDeep, date: "2026-01-01" }), /32 parents/)

  const deleted = Array.from({ length: 10_001 }, (_, index) => `event-${index}`)
  assert.throws(() => composeEventsForDate({
    date: "2026-01-01",
    layers: [{
      tag: "leaf",
      config: { tags: { leaf: { startDate: "2025-01-01" } } },
      eventOperations: { ownedEventsById: {}, inheritedOverridesById: {}, inheritedDeletedIds: deleted },
    }],
  }), /10000/)

  assert.throws(() => composeEventsForDate({
    date: "2026-01-01",
    layers: [{
      tag: "leaf",
      config: { tags: { leaf: { startDate: "2025-01-01" } } },
      eventOperations: {
        ownedEventsById: { x: { id: "x", title: "X" } },
        inheritedOverridesById: {},
        inheritedDeletedIds: ["x"],
      },
    }],
  }), /more than one operation/)
})

import { strict as assert } from "node:assert"
import { after, test } from "node:test"

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

const localStorage = new MemoryStorage()
let payloads: Record<string, unknown> = {}

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage,
    location: { hostname: "example.test", pathname: "/", search: "?tag=leaf" },
  },
})

Object.defineProperty(globalThis, "fetch", {
  configurable: true,
  value: async (input: string | URL | Request) => {
    const url = new URL(String(input), "https://example.test")
    const key = url.pathname.replace(/^\/conf\//, "")
    const payload = payloads[key]
    return new Response(payload === undefined ? null : JSON.stringify(payload), {
      status: payload === undefined ? 404 : 200,
      headers: payload === undefined ? {} : { "content-type": "application/json" },
    })
  },
})

const doc = (operations: unknown[]) => ({ schemaVersion: 2, operations })
const owned = (id: string, title: string, extra: Record<string, unknown> = {}) => ({
  kind: "owned", event: { id, title, ...extra },
})

const resetPayloads = () => {
  payloads = {
    "default.json": { defaultTag: "leaf" },
    "leaf/conf.json": {
      parents: ["middle", "main"],
      tags: { leaf: { startDate: "2025-01-01" }, middle: { startDate: "2025-06-01", endDate: "2025-12-31" } },
    },
    "leaf/events.json": doc([]),
    "leaf/tips.json": { tips: [] },
    "middle/conf.json": { parents: ["main"], tags: { middle: { startDate: "2025-06-01" } } },
    "middle/events.json": doc([{ kind: "override", id: "event-1", set: { "/title": "Middle title" } }]),
    "middle/tips.json": { tips: [{ id: "tip-1", title: "Middle tip" }] },
    "main/conf.json": { parents: [], tags: { main: { startDate: "2024-01-01" } } },
    "main/events.json": doc([owned("event-1", "JSON title", { description: "Keep this field" })]),
    "main/tips.json": { tips: [{ id: "tip-1", title: "Main tip", content: "Inherited" }] },
  }
  localStorage.clear()
}

resetPayloads()
const modulePromise = import("./config-fetcher")

test("event bundles use date-aware explicit lineage and ancestor stored v2 operations", async () => {
  resetPayloads()
  localStorage.setItem("lw-tools:leaf:adminMode", "true")
  localStorage.setItem("lw-tools:main:hasAdminAccess", "true")
  localStorage.setItem("lw-tools:main:events", JSON.stringify({
    state: {
      eventOperations: {
        ownedEventsById: { "event-1": { id: "event-1", title: "Local title", description: "Keep this field" } },
        inheritedOverridesById: {}, inheritedDeletedIds: [], suppressedPublishedOwnedIds: [],
      },
    },
    version: 2,
  }))

  const { clearConfigCache, fetchComposedForTag } = await modulePromise
  clearConfigCache()
  const remote = await fetchComposedForTag("leaf")
  const local = await fetchComposedForTag("leaf", false, {
    includeAncestorLocalOverrides: true,
    currentTag: "leaf",
  })
  assert.equal(remote.events[0].title, "JSON title", "middle is inactive on the UTC-2 current date")
  assert.deepEqual(local.events[0], { id: "event-1", title: "Local title", description: "Keep this field" })
  assert.deepEqual(local.tips, [{ id: "tip-1", title: "Middle tip", content: "Inherited" }])
})

test("fetchEventsForDate exposes boundary-specific DateComposition", async () => {
  resetPayloads()
  const { fetchEventsForDate } = await modulePromise
  const active = await fetchEventsForDate("leaf", "2025-12-31")
  assert.deepEqual(active.activeSourceTags, ["main", "middle", "leaf"])
  assert.equal(active.events[0].title, "Middle title")
  const expired = await fetchEventsForDate("leaf", "2026-01-01")
  assert.deepEqual(expired.activeSourceTags, ["main", "leaf"])
  assert.equal(expired.events[0].title, "JSON title")
})

test("legacy event documents are fatal through the date-aware API", async () => {
  resetPayloads()
  payloads["middle/events.json"] = { events: [] }
  const { fetchEventsForDate } = await modulePromise
  await assert.rejects(fetchEventsForDate("leaf", "2025-12-31"), /schemaVersion 2/)
})

test("buildChildDeltaFiles exports merged leaf operations as schema version 2", async () => {
  resetPayloads()
  payloads["leaf/events.json"] = doc([{ kind: "override", id: "event-1", set: { "/title": "Published leaf" } }])
  localStorage.setItem("lw-tools:leaf:events", JSON.stringify({
    state: {
      eventOperations: {
        ownedEventsById: {},
        inheritedOverridesById: { "event-1": { set: { "/title": "Stored leaf" }, remove: ["/description"] } },
        inheritedDeletedIds: [], suppressedPublishedOwnedIds: [],
      },
    },
    version: 2,
  }))
  const { buildChildDeltaFiles, clearConfigCache } = await modulePromise
  clearConfigCache()
  const output = await buildChildDeltaFiles([], [], "leaf")
  assert.equal(output.events.schemaVersion, 2)
  assert.deepEqual(output.events.operations, [{
    kind: "override", id: "event-1", set: { "/title": "Stored leaf" }, remove: ["/description"],
  }])
  assert.deepEqual(output.config.parents, ["middle", "main"])
})

after(async () => {
  await new Promise((resolve) => setTimeout(resolve, 150))
  Reflect.deleteProperty(globalThis, "window")
  Reflect.deleteProperty(globalThis, "fetch")
})

import assert from "node:assert/strict"
import test from "node:test"
import {
  loadDateScopedConfiguration,
  mergeStoredEventOperations,
  validateExplicitParents,
} from "./date-scoped-config"
import { normalizeEventOperations } from "./serenity-engine/event-operations"
import type { StoredEventOperations } from "./scoped-storage"

type MockValue = unknown | { status: number; body?: unknown; contentType?: string }

const mockFetch = (values: Record<string, MockValue>, calls: string[] = []): typeof fetch => (async (input: string | URL | Request) => {
  const url = String(input)
  const path = url.replace(/^https?:\/\/[^/]+/, "").replace(/^\/conf\//, "").split("?")[0]
  calls.push(path)
  if (!(path in values)) return new Response("", { status: 404 })
  const configured = values[path]
  if (configured && typeof configured === "object" && "status" in configured) {
    const response = configured as { status: number; body?: unknown; contentType?: string }
    return new Response(response.body === undefined ? "" : JSON.stringify(response.body), {
      status: response.status,
      headers: response.contentType === undefined ? { "content-type": "application/json" } : { "content-type": response.contentType },
    })
  }
  return Response.json(configured)
}) as typeof fetch

const owned = (id: string, title: string) => ({ kind: "owned", event: { id, title } })
const document = (operations: unknown[]) => ({ schemaVersion: 2, operations })

const baseResponses = (): Record<string, MockValue> => ({
  "996/conf.json": {
    parents: ["s4", "main"],
    tags: { "996": { startDate: "2025-01-01" }, s4: { startDate: "2025-12-01", endDate: "2026-01-01" } },
  },
  "s4/conf.json": { parents: ["main"], tags: { s4: { startDate: "2025-12-01" } } },
  "main/conf.json": { parents: [], tags: { main: { startDate: "2024-01-01" } } },
  "main/events.json": document([owned("shared", "Main")]),
  "s4/events.json": document([
    { kind: "override", id: "shared", set: { "/title": "S4" } },
    owned("seasonal", "Seasonal"),
  ]),
  "996/events.json": document([
    { kind: "override", id: "shared", set: { "/description": "Local" } },
    owned("local", "Local"),
  ]),
})

test("loader resolves explicit nearest-to-root parents into root-to-leaf raw layers", async () => {
  const calls: string[] = []
  const loaded = await loadDateScopedConfiguration("996", { fetchImpl: mockFetch(baseResponses(), calls) })
  assert.deepEqual(loaded.parents, ["s4", "main"])
  assert.deepEqual(loaded.layers.map((layer) => layer.tag), ["main", "s4", "996"])
  assert.equal(calls[0], "996/conf.json", "leaf configuration must be loaded before its explicit parents")

  const active = loaded.composeForDate("2026-01-01")
  assert.deepEqual(active.activeSourceTags, ["main", "s4", "996"])
  assert.deepEqual(active.events.find((event) => event.id === "shared"), {
    id: "shared", title: "S4", description: "Local",
  })
  const after = loaded.composeForDate("2026-01-02")
  assert.deepEqual(after.activeSourceTags, ["main", "996"])
  assert.equal(after.events.some((event) => event.id === "seasonal"), false)

  const lower = loaded.composeLowerStackForDate("2026-01-01")
  assert.equal(lower.events.some((event) => event.id === "local"), false)
  assert.deepEqual(lower.events.find((event) => event.id === "shared"), { id: "shared", title: "S4" })
})

test("leaf lineage is authoritative and parent declarations are not recursively appended", async () => {
  const responses = baseResponses()
  responses["s4/conf.json"] = { parents: ["not-in-leaf-lineage"], tags: { s4: { startDate: "2025-12-01" } } }
  const calls: string[] = []
  const loaded = await loadDateScopedConfiguration("996", { fetchImpl: mockFetch(responses, calls) })
  assert.deepEqual(loaded.layers.map((layer) => layer.tag), ["main", "s4", "996"])
  assert.equal(calls.some((path) => path.startsWith("not-in-leaf-lineage/")), false)
})

test("404 event documents become empty layers while other failures and malformed v2 documents are fatal", async () => {
  const missing = baseResponses()
  missing["s4/events.json"] = { status: 404 }
  const loaded = await loadDateScopedConfiguration("996", { fetchImpl: mockFetch(missing) })
  assert.equal(loaded.composeForDate("2026-01-01").events.some((event) => event.id === "seasonal"), false)

  const serverError = baseResponses()
  serverError["s4/events.json"] = { status: 500 }
  await assert.rejects(loadDateScopedConfiguration("996", { fetchImpl: mockFetch(serverError) }), /HTTP 500/)

  const malformed = baseResponses()
  malformed["s4/events.json"] = { events: [] }
  await assert.rejects(loadDateScopedConfiguration("996", { fetchImpl: mockFetch(malformed) }), /schemaVersion 2/)

  const wrongType = baseResponses()
  wrongType["main/events.json"] = { status: 200, body: document([]), contentType: "text/html" }
  await assert.rejects(loadDateScopedConfiguration("996", { fetchImpl: mockFetch(wrongType) }), /application\/json/)
})

test("configuration validation rejects legacy, missing, duplicate, unsafe, self, and oversized parent declarations", () => {
  assert.throws(() => validateExplicitParents({ parent: "main", parents: [] }, "leaf"), /legacy parent/)
  assert.throws(() => validateExplicitParents({}, "leaf"), /explicit parents array/)
  assert.throws(() => validateExplicitParents({ parents: ["main", "main"] }, "leaf"), /Duplicate/)
  assert.throws(() => validateExplicitParents({ parents: ["../main"] }, "leaf"), /Unsafe/)
  assert.throws(() => validateExplicitParents({ parents: ["leaf"] }, "leaf"), /own parent/)
  assert.throws(() => validateExplicitParents({ parents: Array.from({ length: 33 }, (_, index) => `p${index}`) }, "leaf"), /32/)
})

test("stored operations replace published operations without changing ownership semantics", async () => {
  const storedByTag: Record<string, StoredEventOperations> = {
    main: {
      ownedEventsById: { shared: { id: "shared", title: "Stored Main" } },
      inheritedOverridesById: {}, inheritedDeletedIds: [], suppressedPublishedOwnedIds: [],
    },
    s4: {
      ownedEventsById: {},
      inheritedOverridesById: { shared: { set: { "/title": "Stored S4" } } },
      inheritedDeletedIds: [], suppressedPublishedOwnedIds: ["seasonal"],
    },
    "996": {
      ownedEventsById: {},
      inheritedOverridesById: { shared: { set: { "/description": "Stored leaf" }, remove: [] } },
      inheritedDeletedIds: [], suppressedPublishedOwnedIds: [],
    },
  }
  const loaded = await loadDateScopedConfiguration("996", {
    fetchImpl: mockFetch(baseResponses()),
    includeStoredOperations: true,
    readStoredOperations: (tag) => storedByTag[tag] ?? null,
  })
  const composed = loaded.composeForDate("2026-01-01")
  assert.deepEqual(composed.events.find((event) => event.id === "shared"), {
    id: "shared", title: "Stored S4", description: "Stored leaf",
  })
  assert.equal(composed.events.some((event) => event.id === "seasonal"), false)
  assert.equal(composed.sourceTagById.shared, "main")

  const leafOnly = await loadDateScopedConfiguration("996", {
    fetchImpl: mockFetch(baseResponses()),
    includeStoredOperations: true,
    includeAncestorStoredOperations: false,
    readStoredOperations: (tag) => storedByTag[tag] ?? null,
  })
  assert.equal(leafOnly.composeForDate("2026-01-01").events.find((event) => event.id === "shared")?.title, "S4")
})

test("stored suppression can reveal a lower event and optionally hide it with a conditional delete", () => {
  const published = normalizeEventOperations(document([owned("same", "Published copy")]))
  const reveal = mergeStoredEventOperations(published, {
    ownedEventsById: {}, inheritedOverridesById: {}, inheritedDeletedIds: [], suppressedPublishedOwnedIds: ["same"],
  })
  assert.deepEqual(Object.keys(reveal.ownedEventsById), [])
  const hide = mergeStoredEventOperations(published, {
    ownedEventsById: {}, inheritedOverridesById: {}, inheritedDeletedIds: ["same"], suppressedPublishedOwnedIds: ["same"],
  })
  assert.deepEqual(hide.inheritedDeletedIds, ["same"])
})

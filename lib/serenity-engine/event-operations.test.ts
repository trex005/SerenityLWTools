import assert from "node:assert/strict"
import test from "node:test"
import {
  applyJsonPointerOverride,
  normalizeEventOperations,
  removeByJsonPointer,
  setByJsonPointer,
} from "./event-operations"

test("version 2 operations normalize explicit ownership and conditional operations", () => {
  const result = normalizeEventOperations({
    schemaVersion: 2,
    operations: [
      { kind: "owned", event: { id: "local", title: "Local" } },
      { kind: "override", id: "inherited", set: { "/title": "Changed" }, remove: ["/description"] },
      { kind: "delete", id: "hidden" },
    ],
  })
  assert.deepEqual({ ...result.ownedEventsById }, { local: { id: "local", title: "Local" } })
  assert.deepEqual({ ...result.inheritedOverridesById }, {
    inherited: { setByPointer: { "/title": "Changed" }, removePointers: ["/description"] },
  })
  assert.deepEqual(result.inheritedDeletedIds, ["hidden"])
})

test("JSON Pointer changes support escaping, nested creation, arrays, and idempotent removal", () => {
  const event: Record<string, unknown> = { id: "event", title: "Before", recurrence: { daysOfWeek: ["monday"] } }
  setByJsonPointer(event, "/metadata/a~1b~0c", 4)
  setByJsonPointer(event, "/recurrence/daysOfWeek/0", "friday")
  removeByJsonPointer(event, "/missing/value")
  assert.deepEqual(event, {
    id: "event",
    title: "Before",
    metadata: { "a/b~c": 4 },
    recurrence: { daysOfWeek: ["friday"] },
  })
  assert.deepEqual(applyJsonPointerOverride(event, {
    setByPointer: { "/title": "After" },
    removePointers: ["/metadata"],
  }), { id: "event", title: "After", recurrence: { daysOfWeek: ["friday"] } })
})

test("operation validation rejects legacy, conflicts, unsafe paths, root/id edits and invalid records", () => {
  const invalid: unknown[] = [
    { events: [] },
    { schemaVersion: 1, operations: [] },
    { schemaVersion: 2, events: [], operations: [] },
    { schemaVersion: 2, operations: [{ kind: "owned", event: { id: "x" } }] },
    { schemaVersion: 2, operations: [{ kind: "owned", event: { id: "x", title: "X" } }, { kind: "delete", id: "x" }] },
    { schemaVersion: 2, operations: [{ kind: "override", id: "x", set: { "": 1 } }] },
    { schemaVersion: 2, operations: [{ kind: "override", id: "x", set: { "/id": "y" } }] },
    { schemaVersion: 2, operations: [{ kind: "override", id: "x", set: { "/a": 1, "/a/b": 2 } }] },
    { schemaVersion: 2, operations: [{ kind: "override", id: "x", set: { "/__proto__/polluted": true } }] },
    { schemaVersion: 2, operations: [{ kind: "override", id: "x", set: { "/a~2b": true } }] },
  ]
  for (const document of invalid) assert.throws(() => normalizeEventOperations(document))
  assert.equal(({} as any).polluted, undefined)
})

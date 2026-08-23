import { strict as assert } from "node:assert"
import { test } from "node:test"

import { diffEventToJsonPointers } from "./event-operation-diff"

test("event diffs use JSON Pointers and replace arrays as complete values", () => {
  const result = diffEventToJsonPointers(
    {
      id: "event",
      title: "Parent",
      description: "Remove me",
      recurrence: { startOffset: 1, daysOfWeek: ["monday"] },
    },
    {
      id: "event",
      title: "Local",
      recurrence: { startOffset: 2, daysOfWeek: ["tuesday", "friday"] },
    },
  )

  assert.deepEqual(result, {
    set: {
      "/recurrence/daysOfWeek": ["tuesday", "friday"],
      "/recurrence/startOffset": 2,
      "/title": "Local",
    },
    remove: ["/description"],
  })
})

test("event diffs escape JSON Pointer segments", () => {
  const result = diffEventToJsonPointers(
    { id: "event", variations: {} },
    { id: "event", variations: { "a/b~c": { description: "Changed" } } },
  )

  assert.deepEqual(result, {
    set: { "/variations/a~1b~0c": { description: "Changed" } },
    remove: [],
  })
})

test("event diffs return null for an unchanged event and reject mismatched IDs", () => {
  assert.equal(diffEventToJsonPointers({ id: "event", title: "Same" }, { id: "event", title: "Same" }), null)
  assert.throws(
    () => diffEventToJsonPointers({ id: "one" }, { id: "two" }),
    /IDs must match/,
  )
})


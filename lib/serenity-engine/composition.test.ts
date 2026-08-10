import assert from "node:assert/strict"
import test from "node:test"
import { composeConfiguration } from "./composition"

test("composition applies ancestor overrides before child deltas and tombstones", () => {
  const result = composeConfiguration([
    {
      tag: "main",
      config: { tags: { s4: { startDate: "2026-01-01" } }, nested: { parent: true } },
      events: [{ id: "event", title: "Parent", description: "Original", recurrence: { daysOfWeek: ["monday"] } }],
      eventOverrides: { overridesById: { event: { description: "Local parent" } } },
      tips: [{ id: "removed", title: "Remove me" }],
    },
    {
      tag: "996",
      config: { nested: { child: true } },
      events: [{ id: "event", title: "Child", recurrence: { daysOfWeek: ["friday"] } }],
      tipTombstones: ["removed"],
    },
  ])
  assert.deepEqual(result.tagConfig.nested, { parent: true, child: true })
  assert.deepEqual(result.events, [{
    id: "event",
    title: "Child",
    description: "Local parent",
    recurrence: { daysOfWeek: ["friday"] },
  }])
  assert.deepEqual(result.tips, [])
})

test("partial child records cannot create anonymous events", () => {
  assert.deepEqual(composeConfiguration([{ tag: "leaf", events: [{ id: "missing", archived: true }] }]).events, [])
})

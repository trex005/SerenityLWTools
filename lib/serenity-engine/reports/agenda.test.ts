import assert from "node:assert/strict"
import test from "node:test"
import { normalizeEventOperations } from "../event-operations"
import { generateAgenda, generateAgendaFromLayers } from "./agenda"

test("agenda renders an inclusive deterministic range", () => {
  const recurrence = { type: "days" as const, startTag: "s4", startOffset: 0, onPeriods: 1, offPeriods: 0, daysOfWeek: [] }
  const result = generateAgenda({
    startDate: "2026-08-10",
    endDate: "2026-08-11",
    referenceDate: "2026-08-10",
    tagConfig: { tags: { s4: { startDate: "2026-08-01" } } },
    events: [{ id: "canyon", title: "Canyon", startTime: "18:00", endTime: "19:00", description: "Prepare\nSquads", recurrence }],
  })
  assert.equal(result.content, "Schedule for August 10 - August 11, 2026\n\nToday: Monday, August 10\n- 18:00 - 19:00: Canyon\n  Prepare\n  Squads\n\nTomorrow: Tuesday, August 11\n- 18:00 - 19:00: Canyon\n\n")
  assert.equal(result.eventCount, 2)
})

test("agenda composes parent layers independently across a boundary", () => {
  const recurrence = { type: "days", startTag: "main", startOffset: 0, onPeriods: 1, offPeriods: 0, daysOfWeek: [] }
  const result = generateAgendaFromLayers({
    startDate: "2026-01-01",
    endDate: "2026-01-02",
    layers: [
      {
        tag: "main",
        config: { tags: { main: { startDate: "2025-01-01" } } },
        eventOperations: normalizeEventOperations({ schemaVersion: 2, operations: [
          { kind: "owned", event: { id: "event", title: "Main", recurrence } },
        ] }),
      },
      {
        tag: "s4",
        config: { tags: { s4: { startDate: "2025-01-01", endDate: "2026-01-01" } } },
        eventOperations: normalizeEventOperations({ schemaVersion: 2, operations: [
          { kind: "override", id: "event", set: { "/title": "Season 4" } },
        ] }),
      },
      {
        tag: "leaf",
        config: { tags: { leaf: { startDate: "2025-01-01" } } },
        eventOperations: normalizeEventOperations({ schemaVersion: 2, operations: [] }),
      },
    ],
  })
  assert.match(result.content, /Thursday, January 1\n- Season 4/)
  assert.match(result.content, /Friday, January 2\n- Main/)
  assert.equal(result.eventCount, 2)
})

test("agenda rejects reversed, invalid, and oversized ranges", () => {
  const input = { events: [], tagConfig: {}, startDate: "2026-01-02", endDate: "2026-01-01" }
  assert.throws(() => generateAgenda(input), /must not be after/)
  assert.throws(() => generateAgenda({ ...input, startDate: "2026-02-30", endDate: "2026-03-01" }), /Invalid date/)
  assert.throws(() => generateAgenda({ ...input, startDate: "2026-01-01", endDate: "2027-01-02" }), /366/)
})

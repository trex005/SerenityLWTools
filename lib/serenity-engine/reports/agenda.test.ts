import assert from "node:assert/strict"
import test from "node:test"
import { generateAgenda } from "./agenda"

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

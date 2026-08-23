import assert from "node:assert/strict"
import test from "node:test"
import { normalizeEventOperations } from "../event-operations"
import { generateDailyReminders, generateDailyRemindersFromLayers } from "./reminders"

test("daily reminders render deterministic current and next-day content", () => {
  const recurrence = { type: "days" as const, startTag: "s4", startOffset: 0, onPeriods: 1, offPeriods: 0, daysOfWeek: [] }
  const result = generateDailyReminders({
    reportDate: "2026-08-10",
    minutesUntilReset: 60,
    tagConfig: { tags: { s4: { startDate: "2026-08-01" } } },
    events: [
      { id: "today", title: "Claim rewards", isAllDay: true, remindEndOfDay: true, recurrence },
      { id: "tomorrow", title: "Canyon", startTime: "18:00", remindTomorrow: true, recurrence },
    ],
  })
  assert.equal(result.content, "Reset in 1 hour!\n\nTomorrow:\n18:00 - Canyon\n\nReminders:\n• Claim rewards")
})

test("daily reminders compose today and tomorrow using different active stacks", () => {
  const recurrence = { type: "days", startTag: "main", startOffset: 0, onPeriods: 1, offPeriods: 0, daysOfWeek: [] }
  const result = generateDailyRemindersFromLayers({
    reportDate: "2026-01-01",
    minutesUntilReset: 30,
    layers: [
      {
        tag: "main",
        config: { tags: { main: { startDate: "2025-01-01" } } },
        eventOperations: normalizeEventOperations({ schemaVersion: 2, operations: [
          { kind: "owned", event: { id: "event", title: "Main", remindEndOfDay: true, remindTomorrow: true, recurrence } },
        ] }),
      },
      {
        tag: "season",
        config: { tags: { season: { startDate: "2025-01-01", endDate: "2026-01-01" } } },
        eventOperations: normalizeEventOperations({ schemaVersion: 2, operations: [
          { kind: "override", id: "event", set: { "/title": "Season" } },
        ] }),
      },
      {
        tag: "leaf",
        config: { tags: { leaf: { startDate: "2025-01-01" } } },
        eventOperations: normalizeEventOperations({ schemaVersion: 2, operations: [] }),
      },
    ],
  })
  assert.deepEqual(result.dayReminders, ["\u2022 Season"])
  assert.deepEqual(result.tomorrowReminders, ["\u2022 Main"])
})

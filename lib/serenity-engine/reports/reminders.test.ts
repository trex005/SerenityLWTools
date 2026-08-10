import assert from "node:assert/strict"
import test from "node:test"
import { generateDailyReminders } from "./reminders"

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

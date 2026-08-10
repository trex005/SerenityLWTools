import assert from "node:assert/strict"
import test from "node:test"
import { addDateKeyDays, eventOccursOnDate, occursInCycle, resolveRecurrenceDateKey, weekdayForDateKey } from "./core"

test("portable date-key arithmetic", () => {
  assert.equal(addDateKeyDays("2026-01-31", 1), "2026-02-01")
  assert.equal(weekdayForDateKey("2026-08-10"), "monday")
  assert.equal(resolveRecurrenceDateKey("s4", 5, { tags: { s4: { startDate: "2026-01-01" } } }), "2026-01-06")
})

test("weekly on/off cycles do not split at calendar week boundaries", () => {
  assert.equal(occursInCycle("2026-01-04", "2026-01-01", 7, 1, 1), true)
  assert.equal(occursInCycle("2026-01-08", "2026-01-01", 7, 1, 1), false)
  assert.equal(occursInCycle("2026-01-15", "2026-01-01", 7, 1, 1), true)
})

test("events apply weekday filters, inclusive end bounds, and explicit includes", () => {
  const event = { recurrence: { type: "weeks" as const, startTag: "s4", startOffset: 0, endOffset: 9, onPeriods: 1, offPeriods: 0, daysOfWeek: ["saturday"] } }
  const config = { tags: { s4: { startDate: "2026-01-01" } } }
  assert.equal(eventOccursOnDate(event, "2026-01-03", config), true)
  assert.equal(eventOccursOnDate(event, "2026-01-10", config), true)
  assert.equal(eventOccursOnDate(event, "2026-01-17", config), false)
  assert.equal(eventOccursOnDate({ ...event, dateIncludeOverrides: { "2026-01-17": true } }, "2026-01-17", config), true)
})

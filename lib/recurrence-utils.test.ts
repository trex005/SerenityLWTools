import { strict as assert } from "node:assert"
import { test } from "node:test"
import { resolveRecurrenceDate } from "./recurrence-utils"
import { formatInAppTimezone } from "./date-utils"

test("resolveRecurrenceDate: offset 0 returns the tag startDate itself", () => {
  const tagConfig = { tags: { s4: { startDate: "2026-01-01" } } }
  const result = resolveRecurrenceDate("s4", 0, tagConfig)
  assert.equal(formatInAppTimezone(result, "yyyy-MM-dd"), "2026-01-01")
})

test("resolveRecurrenceDate: positive offset adds days", () => {
  const tagConfig = { tags: { s4: { startDate: "2026-01-01" } } }
  const result = resolveRecurrenceDate("s4", 5, tagConfig)
  assert.equal(formatInAppTimezone(result, "yyyy-MM-dd"), "2026-01-06")
})

test("resolveRecurrenceDate: uses overridden startDate when child tag overrides ancestor", () => {
  const tagConfig = { tags: { s4: { startDate: "2024-10-10" } } }
  const result = resolveRecurrenceDate("s4", 5, tagConfig)
  assert.equal(formatInAppTimezone(result, "yyyy-MM-dd"), "2024-10-15")
})

test("resolveRecurrenceDate: throws when tag not in tagConfig", () => {
  const tagConfig = { tags: {} }
  assert.throws(
    () => resolveRecurrenceDate("missing", 5, tagConfig),
    /No startDate found for tag/
  )
})

import { shouldShowRecurringEvent, formatRecurrence } from "./recurrence-utils"

const tagConfig = { tags: { s4: { startDate: "2026-01-01" } } }

test("shouldShowRecurringEvent: shows on offset day with daily recurrence", () => {
  const event = {
    recurrence: {
      type: "days",
      startTag: "s4",
      startOffset: 0,
      onPeriods: 1,
      offPeriods: 0,
      daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    },
  }
  // 2026-01-01 is a Thursday — should show on that date
  const date = new Date("2026-01-01T12:00:00Z")
  assert.equal(shouldShowRecurringEvent(event, date, false, tagConfig), true)
})

test("shouldShowRecurringEvent: hides before offset start day", () => {
  const event = {
    recurrence: {
      type: "days",
      startTag: "s4",
      startOffset: 5,
      onPeriods: 1,
      offPeriods: 0,
      daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    },
  }
  // 2026-01-01 is before offset 5 (2026-01-06)
  const date = new Date("2026-01-01T12:00:00Z")
  assert.equal(shouldShowRecurringEvent(event, date, false, tagConfig), false)
})

test("formatRecurrence: returns human label for daily event", () => {
  const event = {
    recurrence: {
      type: "days",
      startTag: "s4",
      startOffset: 0,
      onPeriods: 1,
      offPeriods: 0,
      daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    },
  }
  assert.equal(formatRecurrence(event, tagConfig), "Daily")
})

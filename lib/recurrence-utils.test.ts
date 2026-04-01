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

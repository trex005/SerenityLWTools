import { strict as assert } from "node:assert"
import { test } from "node:test"
import {
  APP_TIMEZONE,
  addAppDays,
  formatInAppTimezone,
  getEndOfAppDay,
  getStartOfAppDay,
} from "./date-utils"

test("app timezone formatting stays on app calendar day", () => {
  // Event timestamp: 2025-03-12T04:00:00Z should be 2025-03-12 in GMT-2
  const iso = "2025-03-12T04:00:00Z"
  assert.equal(formatInAppTimezone(new Date(iso), "yyyy-MM-dd"), "2025-03-12")
})

test("start/end of app day align to midnight in app timezone", () => {
  const sample = new Date("2025-03-12T15:00:00Z")
  const start = getStartOfAppDay(sample)
  const end = getEndOfAppDay(sample)

  assert.equal(formatInAppTimezone(start, "yyyy-MM-dd HH:mm"), "2025-03-12 00:00")
  assert.equal(formatInAppTimezone(end, "yyyy-MM-dd HH:mm"), "2025-03-12 23:59")
})

test("addAppDays advances by whole app days", () => {
  const start = getStartOfAppDay(new Date("2025-03-12T15:00:00Z"))
  const next = addAppDays(start, 1)
  assert.equal(formatInAppTimezone(next, "yyyy-MM-dd HH:mm"), "2025-03-13 00:00")
})

test("APP_TIMEZONE constant is defined", () => {
  assert.ok(typeof APP_TIMEZONE === "string" && APP_TIMEZONE.length > 0)
})

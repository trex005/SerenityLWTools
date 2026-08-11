import assert from "node:assert/strict"
import test from "node:test"
import { ENGINE_VERSION, invoke } from "./index"

test("JSON ABI returns a versioned report response", () => {
  const response = JSON.parse(invoke(JSON.stringify({
    operation: "daily-reminders",
    input: {
      reportDate: "2026-08-10",
      minutesUntilReset: 60,
      events: [],
      tagConfig: {},
    },
  })))
  assert.deepEqual(response, {
    ok: true,
    engineVersion: ENGINE_VERSION,
    result: {
      content: "Reset in 1 hour!",
      dayReminders: [],
      tomorrowReminders: [],
      todayEventCount: 0,
      tomorrowEventCount: 0,
    },
  })
})

test("JSON ABI contains failures instead of throwing across runtimes", () => {
  const response = JSON.parse(invoke("not-json"))
  assert.equal(response.ok, false)
  assert.equal(response.engineVersion, ENGINE_VERSION)
  assert.match(response.error, /JSON/)
})

test("JSON ABI resolves canonical schedules", () => {
  const response = JSON.parse(invoke(JSON.stringify({
    operation: "schedule-next",
    input: {
      schedule: {
        version: 1,
        type: "recurring",
        start: { kind: "datetime", datetime: "2026-08-10T00:00:00Z" },
        frequency: { interval: 1, unit: "days" },
      },
      nowMs: Date.parse("2026-08-10T00:00:01Z"),
    },
  })))
  assert.equal(response.ok, true)
  assert.deepEqual(response.result, {
    runAtMs: Date.parse("2026-08-11T00:00:00Z"),
    recurring: true,
  })
})

test("JSON ABI can select an active schedule window", () => {
  const response = JSON.parse(invoke(JSON.stringify({
    operation: "schedule-next",
    input: {
      schedule: {
        version: 1,
        type: "recurring",
        start: { kind: "datetime", datetime: "2026-08-10T00:00:00Z" },
        frequency: { interval: 1, unit: "days" },
        duration_seconds: 7200,
      },
      nowMs: Date.parse("2026-08-11T01:00:00Z"),
      includeActiveWindow: true,
    },
  })))
  assert.deepEqual(response.result, {
    runAtMs: Date.parse("2026-08-11T00:00:00Z"),
    endAtMs: Date.parse("2026-08-11T02:00:00Z"),
    recurring: true,
  })
})

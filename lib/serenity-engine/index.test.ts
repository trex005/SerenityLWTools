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

import assert from "node:assert/strict"
import test from "node:test"
import { nextScheduleOccurrence } from "./schedule"

const epoch = (value: string): number => Date.parse(value)

test("one-time datetime supports an explicit end", () => {
  assert.deepEqual(nextScheduleOccurrence({
    version: 1,
    type: "one_time",
    start: { kind: "datetime", datetime: "2026-08-10T12:00:00-04:00" },
    end: { kind: "datetime", datetime: "2026-08-10T13:30:00-04:00" },
  }, epoch("2026-08-10T11:00:00-04:00")), {
    runAtMs: epoch("2026-08-10T12:00:00-04:00"),
    endAtMs: epoch("2026-08-10T13:30:00-04:00"),
    recurring: false,
  })
})

test("recurring schedules stop after their inclusive cutoff", () => {
  const schedule = {
    version: 1 as const,
    type: "recurring" as const,
    start: { kind: "datetime" as const, datetime: "2026-08-10T12:00:00-04:00" },
    frequency: { interval: 1, unit: "hours" as const },
    until: "2026-08-10T14:00:00-04:00",
  }
  assert.equal(
    nextScheduleOccurrence(schedule, epoch("2026-08-10T13:30:00-04:00")).runAtMs,
    epoch("2026-08-10T14:00:00-04:00"),
  )
  assert.throws(
    () => nextScheduleOccurrence(schedule, epoch("2026-08-10T14:00:00.001-04:00")),
    /no occurrence before until/,
  )
})

test("one-time datetime returns its exact instant and duration window", () => {
  assert.deepEqual(nextScheduleOccurrence({
    version: 1,
    type: "one_time",
    start: { kind: "datetime", datetime: "2026-08-10T15:30:00-02:00" },
    duration_seconds: 900,
  }, epoch("2026-08-10T17:00:00Z")), {
    runAtMs: epoch("2026-08-10T17:30:00Z"),
    endAtMs: epoch("2026-08-10T17:45:00Z"),
    recurring: false,
  })
})

test("one-time delay without an anchor is relative to now", () => {
  const nowMs = epoch("2026-08-10T12:00:00Z")
  assert.deepEqual(nextScheduleOccurrence({
    version: 1,
    type: "one_time",
    start: { kind: "delay", delay_seconds: 1800 },
  }, nowMs), {
    runAtMs: nowMs + 1_800_000,
    recurring: false,
  })
})

test("anchored delay stays fixed and rejects an elapsed occurrence", () => {
  const schedule = {
    version: 1 as const,
    type: "one_time" as const,
    start: {
      kind: "delay" as const,
      delay_seconds: 1800,
      anchor_at: "2026-08-10T12:00:00Z",
    },
  }
  assert.equal(
    nextScheduleOccurrence(schedule, epoch("2026-08-10T12:05:00Z")).runAtMs,
    epoch("2026-08-10T12:30:00Z"),
  )
  assert.throws(
    () => nextScheduleOccurrence(schedule, epoch("2026-08-10T12:31:00Z")),
    /no future occurrence/,
  )
})

test("recurring schedule returns the first aligned occurrence at or after now", () => {
  const schedule = {
    version: 1 as const,
    type: "recurring" as const,
    start: { kind: "datetime" as const, datetime: "2026-08-10T00:00:00Z" },
    frequency: { interval: 2, unit: "hours" as const },
    duration_seconds: 600,
  }
  assert.deepEqual(
    nextScheduleOccurrence(schedule, epoch("2026-08-10T05:01:00Z")),
    {
      runAtMs: epoch("2026-08-10T06:00:00Z"),
      endAtMs: epoch("2026-08-10T06:10:00Z"),
      recurring: true,
    },
  )
  assert.equal(
    nextScheduleOccurrence(schedule, epoch("2026-08-10T06:00:00Z")).runAtMs,
    epoch("2026-08-10T06:00:00Z"),
  )
})

test("recurring schedule without a start begins at now", () => {
  const nowMs = epoch("2026-08-10T12:34:56Z")
  assert.deepEqual(nextScheduleOccurrence({
    version: 1,
    type: "recurring",
    frequency: { interval: 3, unit: "days" },
  }, nowMs), {
    runAtMs: nowMs,
    recurring: true,
  })
})

test("active-window selection returns the current occurrence when requested", () => {
  const schedule = {
    version: 1 as const,
    type: "recurring" as const,
    start: { kind: "datetime" as const, datetime: "2026-08-10T00:00:00Z" },
    frequency: { interval: 1, unit: "days" as const },
    duration_seconds: 7_200,
  }
  const nowMs = epoch("2026-08-11T01:00:00Z")
  assert.deepEqual(nextScheduleOccurrence(schedule, nowMs, true), {
    runAtMs: epoch("2026-08-11T00:00:00Z"),
    endAtMs: epoch("2026-08-11T02:00:00Z"),
    recurring: true,
  })
  assert.equal(
    nextScheduleOccurrence(schedule, nowMs, false).runAtMs,
    epoch("2026-08-12T00:00:00Z"),
  )
})

test("one-time active window may be returned after its start", () => {
  const schedule = {
    version: 1 as const,
    type: "one_time" as const,
    start: { kind: "datetime" as const, datetime: "2026-08-10T12:00:00Z" },
    duration_seconds: 3_600,
  }
  assert.deepEqual(
    nextScheduleOccurrence(schedule, epoch("2026-08-10T12:30:00Z"), true),
    {
      runAtMs: epoch("2026-08-10T12:00:00Z"),
      endAtMs: epoch("2026-08-10T13:00:00Z"),
      recurring: false,
    },
  )
})

test("all recurring units have deterministic millisecond intervals", () => {
  const start = "2026-08-01T00:00:00Z"
  const expected = {
    seconds: 2_000,
    minutes: 120_000,
    hours: 7_200_000,
    days: 172_800_000,
    weeks: 1_209_600_000,
  }
  for (const [unit, period] of Object.entries(expected)) {
    const occurrence = nextScheduleOccurrence({
      version: 1,
      type: "recurring",
      start: { kind: "datetime", datetime: start },
      frequency: { interval: 2, unit: unit as "seconds" | "minutes" | "hours" | "days" | "weeks" },
    }, epoch(start) + 1)
    assert.equal(occurrence.runAtMs, epoch(start) + period)
  }
})

test("invalid canonical schedules fail with actionable errors", () => {
  assert.throws(
    () => nextScheduleOccurrence({ version: 2, type: "recurring" }, 0),
    /version must be 1/,
  )
  assert.throws(
    () => nextScheduleOccurrence({
      version: 1,
      type: "recurring",
      frequency: { interval: 0, unit: "hours" },
    }, 0),
    /at least 1/,
  )
  assert.throws(
    () => nextScheduleOccurrence({
      version: 1,
      type: "one_time",
      start: { kind: "datetime", datetime: "2026-08-10" },
    }, 0),
    /RFC 3339/,
  )
})

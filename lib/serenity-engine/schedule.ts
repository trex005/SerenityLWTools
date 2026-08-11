export type ScheduleUnit = "minutes" | "hours" | "days" | "weeks"

export type DateTimeStart = {
  kind: "datetime"
  datetime: string
}

export type DelayStart = {
  kind: "delay"
  delay_seconds: number
  anchor_at?: string
}

export type OneTimeSchedule = {
  version: 1
  type: "one_time"
  start: DateTimeStart | DelayStart
  duration_seconds?: number
  end?: DateTimeStart
}

export type RecurringSchedule = {
  version: 1
  type: "recurring"
  start?: DateTimeStart
  frequency: {
    interval: number
    unit: ScheduleUnit
  }
  duration_seconds?: number
  until?: string
}

export type Schedule = OneTimeSchedule | RecurringSchedule

export type ScheduleOccurrence = {
  runAtMs: number
  endAtMs?: number
  recurring: boolean
}

const RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/
const UNIT_MS: Record<ScheduleUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
  weeks: 604_800_000,
}

const requireObject = (value: unknown, name: string): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`)
  }
  return value as Record<string, unknown>
}

const requireNonNegativeInteger = (value: unknown, name: string): number => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    throw new Error(`${name} must be a non-negative safe integer`)
  }
  return Number(value)
}

const parseTimestamp = (value: unknown, name: string): number => {
  if (typeof value !== "string" || !RFC3339.test(value)) {
    throw new Error(`${name} must be an RFC 3339 datetime with a timezone`)
  }
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) throw new Error(`${name} is invalid`)
  return timestamp
}

const durationFor = (schedule: Record<string, unknown>): number | undefined =>
  schedule.duration_seconds === undefined
    ? undefined
    : requireNonNegativeInteger(schedule.duration_seconds, "duration_seconds") * 1000

const resultFor = (runAtMs: number, durationMs: number | undefined, recurring: boolean, endAtMs?: number): ScheduleOccurrence => ({
  runAtMs,
  ...(endAtMs === undefined && durationMs === undefined ? {} : {
    endAtMs: endAtMs ?? runAtMs + Number(durationMs),
  }),
  recurring,
})

/** Resolve the active or next occurrence from the canonical v1 schedule. */
export const nextScheduleOccurrence = (
  scheduleValue: unknown,
  nowMs: number,
  includeActiveWindow = false,
): ScheduleOccurrence => {
  const schedule = requireObject(scheduleValue, "schedule")
  if (schedule.version !== 1) throw new Error("schedule.version must be 1")
  if (!Number.isSafeInteger(nowMs)) throw new Error("nowMs must be a safe integer")
  const durationMs = durationFor(schedule)

  if (schedule.type === "one_time") {
    const start = requireObject(schedule.start, "start")
    let runAtMs: number
    if (start.kind === "datetime") {
      runAtMs = parseTimestamp(start.datetime, "start.datetime")
    } else if (start.kind === "delay") {
      const delayMs = requireNonNegativeInteger(start.delay_seconds, "start.delay_seconds") * 1000
      const anchorMs = start.anchor_at === undefined
        ? nowMs
        : parseTimestamp(start.anchor_at, "start.anchor_at")
      runAtMs = anchorMs + delayMs
    } else {
      throw new Error("one_time start.kind must be datetime or delay")
    }
    const explicitEnd = schedule.end === undefined
      ? undefined
      : (() => {
          if (durationMs !== undefined) throw new Error("one_time schedule cannot use both end and duration_seconds")
          const end = requireObject(schedule.end, "end")
          if (end.kind !== "datetime") throw new Error("end.kind must be datetime")
          return parseTimestamp(end.datetime, "end.datetime")
        })()
    if (explicitEnd !== undefined && explicitEnd <= runAtMs) {
      throw new Error("end.datetime must be after the scheduled start")
    }
    const endAtMs = explicitEnd ?? (durationMs === undefined ? undefined : runAtMs + durationMs)
    const active = endAtMs !== undefined && runAtMs <= nowMs && nowMs < endAtMs
    if (runAtMs < nowMs && !(includeActiveWindow && active)) {
      throw new Error("one_time schedule has no future occurrence")
    }
    return resultFor(runAtMs, durationMs, false, explicitEnd)
  }

  if (schedule.type === "recurring") {
    const untilMs = schedule.until === undefined
      ? undefined
      : parseTimestamp(schedule.until, "until")
    const frequency = requireObject(schedule.frequency, "frequency")
    const interval = requireNonNegativeInteger(frequency.interval, "frequency.interval")
    if (interval < 1) throw new Error("frequency.interval must be at least 1")
    const unit = frequency.unit
    if (typeof unit !== "string" || !(unit in UNIT_MS)) {
      throw new Error("frequency.unit must be minutes, hours, days, or weeks")
    }
    const periodMs = interval * UNIT_MS[unit as ScheduleUnit]
    if (!Number.isSafeInteger(periodMs)) throw new Error("frequency is too large")
    const startMs = schedule.start === undefined
      ? nowMs
      : (() => {
          const start = requireObject(schedule.start, "start")
          if (start.kind !== "datetime") throw new Error("recurring start.kind must be datetime")
          return parseTimestamp(start.datetime, "start.datetime")
        })()
    const elapsed = nowMs - startMs
    if (includeActiveWindow && durationMs !== undefined && elapsed >= 0) {
      const previousSteps = Math.floor(elapsed / periodMs)
      const previousStart = startMs + previousSteps * periodMs
      if (previousStart <= nowMs && nowMs < previousStart + durationMs) {
        if (untilMs !== undefined && previousStart > untilMs) {
          throw new Error("recurring schedule has no occurrence before until")
        }
        return resultFor(previousStart, durationMs, true)
      }
    }
    const steps = elapsed <= 0 ? 0 : Math.ceil(elapsed / periodMs)
    const runAtMs = startMs + steps * periodMs
    if (untilMs !== undefined && runAtMs > untilMs) {
      throw new Error("recurring schedule has no occurrence before until")
    }
    return resultFor(runAtMs, durationMs, true)
  }

  throw new Error("schedule.type must be one_time or recurring")
}

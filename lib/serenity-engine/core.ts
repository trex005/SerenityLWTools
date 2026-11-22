import { engineError } from "./errors"

export const ENGINE_VERSION = "0.5.0"

export type TagMetadata = { startDate?: string; endDate?: string | null; [key: string]: unknown }
export type TagConfig = { tags?: Record<string, TagMetadata | null>; [key: string]: unknown }
export type Recurrence = {
  type: "days" | "weeks" | "month_end" | "none"
  startTag: string
  startOffset: number
  endOffset?: number
  onPeriods: number
  offPeriods: number
  daysOfWeek: string[]
}
export type ScheduledEvent = {
  recurrence?: Recurrence
  dateIncludeOverrides?: Record<string, boolean>
}

const DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/
const DAY_MS = 86_400_000
const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

export const dateKeyToDay = (dateKey: string): number => {
  const match = DATE_KEY.exec(dateKey)
  if (!match) return engineError("INVALID_DATE", `Invalid date key ${JSON.stringify(dateKey)}`)
  const [year, month, day] = match.slice(1).map(Number)
  const timestamp = Date.UTC(year, month - 1, day)
  const parsed = new Date(timestamp)
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    engineError("INVALID_DATE", `Invalid date key ${JSON.stringify(dateKey)}`)
  }
  return Math.floor(timestamp / DAY_MS)
}

export const validateDateKey = (dateKey: string): string => {
  dateKeyToDay(dateKey)
  return dateKey
}

export const validateReportDateRange = (startDate: string, endDate: string): number => {
  const start = dateKeyToDay(startDate)
  const end = dateKeyToDay(endDate)
  if (end < start) engineError("INVALID_DATE_RANGE", "Report startDate must not be after endDate")
  const inclusiveDays = end - start + 1
  if (inclusiveDays > 366) engineError("LIMIT_EXCEEDED", "Reports are limited to 366 inclusive days")
  return inclusiveDays
}

const dayToDateKey = (day: number): string => new Date(day * DAY_MS).toISOString().slice(0, 10)

export const addDateKeyDays = (dateKey: string, amount: number): string =>
  dayToDateKey(dateKeyToDay(dateKey) + Math.trunc(amount))

export const resolveRecurrenceDateKey = (startTag: string, offsetDays: number, tagConfig: TagConfig): string => {
  const startDate = tagConfig.tags?.[startTag]?.startDate
  if (!startDate) throw new Error(`No startDate found for tag "${startTag}" in tagConfig`)
  return addDateKeyDays(startDate.slice(0, 10), offsetDays)
}

export const weekdayForDateKey = (dateKey: string): string =>
  WEEKDAYS[new Date(dateKeyToDay(dateKey) * DAY_MS).getUTCDay()]

export const occursInCycle = (
  targetDateKey: string,
  startDateKey: string,
  periodDays: number,
  onPeriods: number,
  offPeriods: number,
  allowedWeekdays?: string[],
  endDateKey?: string,
): boolean => {
  const targetDay = dateKeyToDay(targetDateKey)
  const startDay = dateKeyToDay(startDateKey)
  if (targetDay < startDay || (endDateKey && targetDay > dateKeyToDay(endDateKey))) return false
  const safePeriodDays = Math.max(Math.trunc(periodDays), 1)
  const effectiveOn = Math.max(Math.trunc(onPeriods), 0)
  const effectiveOff = Math.max(Math.trunc(offPeriods), 0)
  const cyclePeriods = effectiveOn + effectiveOff
  const cycleDays = safePeriodDays * (cyclePeriods === 0 ? 1 : cyclePeriods)
  const position = ((targetDay - startDay) % cycleDays + cycleDays) % cycleDays
  const inOnBlock = position < safePeriodDays * effectiveOn
  return inOnBlock && (!allowedWeekdays?.length || allowedWeekdays.includes(weekdayForDateKey(targetDateKey)))
}

export const eventOccursOnDate = (
  event: ScheduledEvent,
  targetDateKey: string,
  tagConfig: TagConfig,
  adminModeView = false,
): boolean => {
  if (!adminModeView && event.dateIncludeOverrides?.[targetDateKey] !== undefined) {
    return event.dateIncludeOverrides[targetDateKey]
  }
  const recurrence = event.recurrence
  if (!recurrence || (recurrence.type !== "days" && recurrence.type !== "weeks" && recurrence.type !== "month_end")) return false
  try {
    const start = resolveRecurrenceDateKey(recurrence.startTag, recurrence.startOffset, tagConfig)
    const end = recurrence.endOffset === undefined
      ? undefined
      : resolveRecurrenceDateKey(recurrence.startTag, recurrence.endOffset, tagConfig)
    if (recurrence.type === "month_end") {
      const day = dateKeyToDay(targetDateKey)
      if (day < dateKeyToDay(start) || (end && day > dateKeyToDay(end))) return false
      return new Date((day + 1) * DAY_MS).getUTCDate() === 1
    }
    return occursInCycle(
      targetDateKey,
      start,
      recurrence.type === "days" ? 1 : 7,
      recurrence.onPeriods,
      recurrence.offPeriods,
      recurrence.daysOfWeek,
      end,
    )
  } catch {
    return false
  }
}

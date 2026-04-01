import { parseISO } from "date-fns"
import { formatInAppTimezone, getDayOfWeek as getAppDayOfWeek, getStartOfAppDay, addAppDays } from "./date-utils"

export type TagConfig = {
  tags?: Record<string, { startDate?: string }>
}

/**
 * Resolve an absolute Date from a tag-relative offset.
 * actualDate = tags[startTag].startDate + offsetDays
 */
export function resolveRecurrenceDate(
  startTag: string,
  offsetDays: number,
  tagConfig: TagConfig,
): Date {
  const startDateStr = tagConfig?.tags?.[startTag]?.startDate
  if (!startDateStr) {
    throw new Error(`No startDate found for tag "${startTag}" in tagConfig`)
  }
  const base = getStartOfAppDay(parseISO(startDateStr))
  return addAppDays(base, offsetDays)
}

export const getDayOfWeek = getAppDayOfWeek

const DAY_IN_MS = 1000 * 60 * 60 * 24

// Normalize any date to the start of that calendar day in the app timezone
const normalizeToAppDay = (date: Date): Date => getStartOfAppDay(date)

/**
 * New schedule calculation that fixes calendar week boundary splitting bug.
 * Based on integer day offsets from start_date, not calendar weeks.
 * 
 * @param targetDate The date to check
 * @param startDate The schedule start date
 * @param periodDays Number of days in one period (1 for daily, 7 for weekly)
 * @param onPeriods Number of consecutive "on" periods
 * @param offPeriods Number of consecutive "off" periods
 * @param allowedWeekdays Optional array of allowed weekdays (for weekday filtering)
 * @param endDate Optional inclusive end date for the schedule
 */
export function shouldShowOnDate(
  targetDate: Date,
  startDate: Date,
  periodDays: number,
  onPeriods: number,
  offPeriods: number,
  allowedWeekdays?: string[],
  endDate?: Date
): boolean {
  const normalizedTarget = normalizeToAppDay(targetDate)
  const normalizedStart = normalizeToAppDay(startDate)
  const normalizedEnd = endDate ? normalizeToAppDay(endDate) : undefined

  const dayOffset = Math.floor((normalizedTarget.getTime() - normalizedStart.getTime()) / DAY_IN_MS)

  if (dayOffset < 0) return false
  if (normalizedEnd && normalizedTarget.getTime() > normalizedEnd.getTime()) return false

  const effectiveOnPeriods = Math.max(onPeriods, 0)
  const effectiveOffPeriods = Math.max(offPeriods, 0)
  const cyclePeriods = effectiveOnPeriods + effectiveOffPeriods
  const safePeriodDays = Math.max(periodDays, 1)
  const cycleDays = safePeriodDays * (cyclePeriods === 0 ? 1 : cyclePeriods)
  const positionInCycle = ((dayOffset % cycleDays) + cycleDays) % cycleDays

  const inOnBlock = positionInCycle < safePeriodDays * effectiveOnPeriods

  if (allowedWeekdays && allowedWeekdays.length > 0) {
    const dayOfWeek = getDayOfWeek(normalizedTarget)
    return inOnBlock && allowedWeekdays.includes(dayOfWeek)
  }

  return inOnBlock
}

/**
 * Get the day of the week as a string (e.g., "sunday")
 * @param date The date to get the day of the week for
 */
export function shouldShowRecurringEvent(
  event: any,
  date: Date,
  adminModeView = false,
  tagConfig: TagConfig = {},
): boolean {
  const dateString = formatInAppTimezone(date, "yyyy-MM-dd")

  if (!adminModeView && event.dateIncludeOverrides && event.dateIncludeOverrides[dateString] !== undefined) {
    return event.dateIncludeOverrides[dateString]
  }

  const normalizedTargetDate = normalizeToAppDay(date)

  if (event.recurrence?.startTag !== undefined && event.recurrence?.startOffset !== undefined) {
    const startDate = normalizeToAppDay(
      resolveRecurrenceDate(event.recurrence.startTag, event.recurrence.startOffset, tagConfig),
    )
    if (normalizedTargetDate.getTime() < startDate.getTime()) return false
  }

  if (event.recurrence?.endOffset !== undefined) {
    const endDate = normalizeToAppDay(
      resolveRecurrenceDate(event.recurrence.startTag, event.recurrence.endOffset, tagConfig),
    )
    if (normalizedTargetDate.getTime() > endDate.getTime()) return false
  }

  if (!event.recurrence || event.recurrence.type === "none") {
    return false
  }

  const params = convertNewRecurrenceFormat(event, tagConfig)
  if (!params) return false

  return shouldShowOnDate(
    date,
    params.startDate,
    params.periodDays,
    params.onPeriods,
    params.offPeriods,
    params.allowedWeekdays,
    params.endDate,
  )
}

/**
 * Convert new recurrence format to parameters for shouldShowOnDate
 * @param event The event with new recurrence format
 * @returns Parameters for the new schedule calculation
 */
function convertNewRecurrenceFormat(
  event: any,
  tagConfig: TagConfig,
): {
  startDate: Date
  periodDays: number
  onPeriods: number
  offPeriods: number
  allowedWeekdays?: string[]
  endDate?: Date
} | null {
  if (!event.recurrence) return null

  if (
    event.recurrence.startTag === undefined ||
    event.recurrence.startOffset === undefined ||
    event.recurrence.onPeriods === undefined ||
    event.recurrence.offPeriods === undefined
  ) {
    return null
  }

  let periodDays: number
  if (event.recurrence.type === "days") {
    periodDays = 1
  } else if (event.recurrence.type === "weeks") {
    periodDays = 7
  } else {
    return null
  }

  let endDate: Date | undefined
  if (event.recurrence.endOffset !== undefined) {
    endDate = normalizeToAppDay(
      resolveRecurrenceDate(event.recurrence.startTag, event.recurrence.endOffset, tagConfig),
    )
  }

  return {
    startDate: normalizeToAppDay(
      resolveRecurrenceDate(event.recurrence.startTag, event.recurrence.startOffset, tagConfig),
    ),
    periodDays,
    onPeriods: event.recurrence.onPeriods,
    offPeriods: event.recurrence.offPeriods,
    allowedWeekdays:
      event.recurrence.daysOfWeek && event.recurrence.daysOfWeek.length > 0
        ? event.recurrence.daysOfWeek
        : undefined,
    endDate,
  }
}

/**
 * Format weekdays compactly with ranges and special cases
 * @param weekdays Array of weekday strings
 * @returns Compact weekday representation
 */
function formatWeekdaysCompact(weekdays: string[]): string {
  if (!weekdays || weekdays.length === 0) return ""
  
  const allDays = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  
  // Special cases
  if (weekdays.length === 7) return "" // All days selected, don't show filter
  if (weekdays.length === 5 && 
      weekdays.includes("monday") && weekdays.includes("tuesday") && 
      weekdays.includes("wednesday") && weekdays.includes("thursday") && 
      weekdays.includes("friday")) {
    return "weekdays"
  }
  if (weekdays.length === 2 && weekdays.includes("saturday") && weekdays.includes("sunday")) {
    return "weekends"
  }
  if (weekdays.length === 6) {
    // Show "except X" for 6 out of 7 days
    const missing = allDays.find(day => !weekdays.includes(day))
    if (missing) {
      const missingIndex = allDays.indexOf(missing)
      return `except ${dayNames[missingIndex]}`
    }
  }

  // Create boolean array for selected days (Sunday = index 0)
  const selected = allDays.map(day => weekdays.includes(day))
  
  // Find consecutive ranges with wraparound support
  const ranges: Array<{start: number, end: number}> = []
  const visited = new Array(7).fill(false)
  
  for (let i = 0; i < 7; i++) {
    const prev = (i + 6) % 7
    if (selected[i] && !selected[prev] && !visited[i]) {
      // Start of a run
      let j = i
      while (selected[j] && !visited[j]) {
        visited[j] = true
        j = (j + 1) % 7
        if (j === i) break // Full circle
      }
      const end = (j + 6) % 7 // Last selected day
      ranges.push({ start: i, end })
    }
  }
  
  // Convert ranges to text
  const parts = ranges.map(({ start, end }) => {
    if (start === end) {
      return dayNames[start]
    } else {
      return `${dayNames[start]} to ${dayNames[end]}`
    }
  })
  
  return parts.join(", ")
}

/**
 * Format recurrence information for display with improved labeling
 * @param event The event to format
 */
export function formatRecurrence(event: any, tagConfig: TagConfig = {}): string | null {
  if (!event.recurrence || event.recurrence.type === "none") {
    return null
  }

  let periodDays: number
  let onPeriods: number
  let offPeriods: number
  let weekdays: string[] = []

  onPeriods = event.recurrence.onPeriods || 1
  offPeriods = event.recurrence.offPeriods || 0
  periodDays = event.recurrence.type === "days" ? 1 : 7
  weekdays = event.recurrence.daysOfWeek || []

  if (onPeriods === 1 && offPeriods === 0) {
    const baseLabel = periodDays === 1 ? "Daily" : "Weekly"
    const weekdayFilter = formatWeekdaysCompact(weekdays)
    return weekdayFilter ? `${baseLabel} on ${weekdayFilter}` : baseLabel
  }

  let label: string

  if (onPeriods === 1) {
    const total = onPeriods + offPeriods
    if (periodDays === 1) {
      label = `Every ${total} days`
    } else if (periodDays === 7) {
      label = `Every ${total} weeks`
    } else {
      label = `Every ${total} ${periodDays}-day periods`
    }
  } else {
    if (periodDays === 1) {
      label = `${onPeriods} days on, ${offPeriods} off`
    } else if (periodDays === 7) {
      label = `${onPeriods} weeks on, ${offPeriods} off`
    } else {
      label = `${onPeriods} periods on, ${offPeriods} off (${periodDays}-day period)`
    }
  }

  const weekdayFilter = formatWeekdaysCompact(weekdays)
  if (weekdayFilter) {
    label += ` on ${weekdayFilter}`
  }

  if (event.recurrence?.endOffset !== undefined && event.recurrence?.startTag) {
    try {
      const endDate = resolveRecurrenceDate(
        event.recurrence.startTag,
        event.recurrence.endOffset,
        tagConfig,
      )
      label += ` (ends ${formatInAppTimezone(endDate, "MMM d, yyyy")})`
    } catch {
      // startTag not in tagConfig — omit end date label
    }
  }

  return label
}

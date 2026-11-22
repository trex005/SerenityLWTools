import { parseISO } from "date-fns"
import { formatInAppTimezone, getDayOfWeek as getAppDayOfWeek, getStartOfAppDay } from "./date-utils"
import { eventOccursOnDate, occursInCycle, resolveRecurrenceDateKey, type TagConfig } from "./serenity-engine/core"

export type { TagConfig } from "./serenity-engine/core"

/**
 * Resolve an absolute Date from a tag-relative offset.
 * actualDate = tags[startTag].startDate + offsetDays
 */
export function resolveRecurrenceDate(
  startTag: string,
  offsetDays: number,
  tagConfig: TagConfig,
): Date {
  return getStartOfAppDay(parseISO(resolveRecurrenceDateKey(startTag, offsetDays, tagConfig)))
}

export const getDayOfWeek = getAppDayOfWeek

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
  return occursInCycle(
    formatInAppTimezone(targetDate, "yyyy-MM-dd"),
    formatInAppTimezone(startDate, "yyyy-MM-dd"),
    periodDays,
    onPeriods,
    offPeriods,
    allowedWeekdays,
    endDate ? formatInAppTimezone(endDate, "yyyy-MM-dd") : undefined,
  )
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
  return eventOccursOnDate(event, formatInAppTimezone(date, "yyyy-MM-dd"), tagConfig, adminModeView)
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

  try {
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
      endDate:
        event.recurrence.endOffset !== undefined
          ? normalizeToAppDay(
              resolveRecurrenceDate(event.recurrence.startTag, event.recurrence.endOffset, tagConfig),
            )
          : undefined,
    }
  } catch {
    return null
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

  if (event.recurrence.type === "month_end") return "Last day of every month"

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

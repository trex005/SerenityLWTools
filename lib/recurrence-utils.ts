import { differenceInDays, differenceInWeeks, getWeek, isBefore, parseISO } from "date-fns"

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
 */
export function shouldShowOnDate(
  targetDate: Date, 
  startDate: Date, 
  periodDays: number, 
  onPeriods: number, 
  offPeriods: number, 
  allowedWeekdays?: string[]
): boolean {
  // Calculate integer day offset from start date
  const dayOffset = Math.floor((targetDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
  
  // If before start date, not active
  if (dayOffset < 0) return false
  
  // Calculate cycle length and position in cycle
  const cycleDays = periodDays * (onPeriods + offPeriods)
  const positionInCycle = dayOffset % cycleDays
  
  // Check if in "on" block
  const inOnBlock = positionInCycle < periodDays * onPeriods
  
  // Apply weekday filter if specified
  if (allowedWeekdays && allowedWeekdays.length > 0) {
    const dayOfWeek = getDayOfWeek(targetDate)
    return inOnBlock && allowedWeekdays.includes(dayOfWeek)
  }
  
  return inOnBlock
}

/**
 * Convert legacy recurrence data to new format parameters
 * @param event The event with legacy recurrence data
 * @returns Parameters for the new schedule calculation
 */
export function convertLegacyRecurrence(event: any): {
  startDate: Date,
  periodDays: number,
  onPeriods: number, 
  offPeriods: number,
  allowedWeekdays?: string[]
} | null {
  if (!event.recurrence) return null
  
  let startDate: Date
  let periodDays: number
  let onPeriods: number
  let offPeriods: number
  
  // Determine start date (priority: startDate > pattern.phaseStartDate > fallback)
  if (event.recurrence.startDate) {
    startDate = parseISO(event.recurrence.startDate)
  } else if (event.recurrence.pattern?.phaseStartDate) {
    startDate = parseISO(event.recurrence.pattern.phaseStartDate)
  } else {
    // Fallback date: 2025-01-05
    startDate = new Date(2025, 0, 5) // Month is 0-indexed
  }
  
  // Convert based on pattern vs interval/type
  if (event.recurrence.pattern) {
    // Custom pattern with onWeeks/offWeeks
    periodDays = 7
    onPeriods = event.recurrence.pattern.onWeeks || 1
    offPeriods = event.recurrence.pattern.offWeeks || 1
  } else {
    // Legacy interval/type format
    const interval = event.recurrence.interval || 1
    
    if (event.recurrence.type === "weekly") {
      periodDays = 7
    } else if (event.recurrence.type === "daily") {
      periodDays = 1
    } else {
      return null // Unsupported type
    }
    
    onPeriods = 1
    offPeriods = interval - 1
  }
  
  // Get allowed weekdays
  const allowedWeekdays = event.recurrence.daysOfWeek || event.days
  
  return {
    startDate,
    periodDays,
    onPeriods,
    offPeriods,
    allowedWeekdays: allowedWeekdays && allowedWeekdays.length > 0 ? allowedWeekdays : undefined
  }
}

/**
 * Get the day of the week as a string (e.g., "sunday")
 * @param date The date to get the day of the week for
 */
export function getDayOfWeek(date: Date): string {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  return days[date.getDay()]
}

/**
 * Check if an event should be shown on a specific date based on its recurrence pattern
 * This function only checks the basic recurrence pattern, not any date-specific overrides
 * @param event The event to check
 * @param date The specific date to check
 * @param isAdminView If true, will ignore certain exclusions to show all events in admin view but still respect recurrence intervals
 */
export function shouldShowRecurringEvent(event: any, date: Date, isAdminView = false): boolean {
  // Get the day of week string (e.g., "sunday")
  const dayOfWeek = getDayOfWeek(date)

  // Format the date as YYYY-MM-DD for use with dateOverrides
  const dateString = date.toISOString().split("T")[0]

  // Check for date-specific include/exclude override first, but only if not in admin view
  if (!isAdminView && event.dateIncludeOverrides && event.dateIncludeOverrides[dateString] !== undefined) {
    // If we have an explicit include/exclude for this date, respect that above all else
    return event.dateIncludeOverrides[dateString]
  }

  // Handle new recurrence format
  if (event.recurrence && (event.recurrence.onPeriods !== undefined || event.recurrence.offPeriods !== undefined)) {
    // New format: use the new calculation
    const params = convertNewRecurrenceFormat(event)
    if (!params) return false
    
    return shouldShowOnDate(date, params.startDate, params.periodDays, params.onPeriods, params.offPeriods, params.allowedWeekdays)
  }

  // Handle legacy format
  const legacyParams = convertLegacyRecurrence(event)
  if (legacyParams) {
    return shouldShowOnDate(date, legacyParams.startDate, legacyParams.periodDays, legacyParams.onPeriods, legacyParams.offPeriods, legacyParams.allowedWeekdays)
  }

  // If no recurrence, check the days array for backward compatibility
  if (!event.recurrence) {
    // Default to not showing if days array is missing or empty
    if (!Array.isArray(event.days) || event.days.length === 0) {
      return false
    }
    return event.days.includes(dayOfWeek)
  }

  // For admin view, we want to show all events that are scheduled for this day of the week
  if (isAdminView) {
    // First check if this day is in the days array or daysOfWeek array
    const isOnThisDay = event.recurrence
      ? Array.isArray(event.recurrence.daysOfWeek) && event.recurrence.daysOfWeek.includes(dayOfWeek)
      : Array.isArray(event.days) && event.days.includes(dayOfWeek)

    return isOnThisDay
  }

  // If recurrence type is "none", don't show the event
  if (event.recurrence && event.recurrence.type === "none") {
    return false
  }

  // Default to not showing the event if none of the above conditions are met
  return false
}

/**
 * Convert new recurrence format to parameters for shouldShowOnDate
 * @param event The event with new recurrence format
 * @returns Parameters for the new schedule calculation
 */
function convertNewRecurrenceFormat(event: any): {
  startDate: Date,
  periodDays: number,
  onPeriods: number, 
  offPeriods: number,
  allowedWeekdays?: string[]
} | null {
  if (!event.recurrence) return null
  
  // New format should have startDate, onPeriods, offPeriods, type
  if (!event.recurrence.startDate || event.recurrence.onPeriods === undefined || event.recurrence.offPeriods === undefined) {
    return null
  }
  
  let periodDays: number
  if (event.recurrence.type === "days") {
    periodDays = 1
  } else if (event.recurrence.type === "weeks") {
    periodDays = 7
  } else {
    return null // Unsupported type
  }
  
  return {
    startDate: parseISO(event.recurrence.startDate),
    periodDays,
    onPeriods: event.recurrence.onPeriods,
    offPeriods: event.recurrence.offPeriods,
    allowedWeekdays: event.recurrence.daysOfWeek && event.recurrence.daysOfWeek.length > 0 ? event.recurrence.daysOfWeek : undefined
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
export function formatRecurrence(event: any): string | null {
  if (!event.recurrence || event.recurrence.type === "none") {
    return null
  }

  // Extract parameters from new or legacy format
  let periodDays: number
  let onPeriods: number
  let offPeriods: number
  let weekdays: string[] = []

  // Handle new format
  if (event.recurrence.onPeriods !== undefined || event.recurrence.offPeriods !== undefined) {
    onPeriods = event.recurrence.onPeriods || 1
    offPeriods = event.recurrence.offPeriods || 0
    periodDays = event.recurrence.type === "days" ? 1 : 7
    weekdays = event.recurrence.daysOfWeek || []
  } 
  // Handle legacy format
  else if (event.recurrence.pattern && event.recurrence.type === "custom") {
    // Custom pattern
    periodDays = 7
    onPeriods = event.recurrence.pattern.onWeeks || 1
    offPeriods = event.recurrence.pattern.offWeeks || 0
    weekdays = event.recurrence.daysOfWeek || []
  } 
  else {
    // Legacy interval-based format
    const interval = event.recurrence.interval || 1
    periodDays = event.recurrence.type === "daily" ? 1 : 7
    onPeriods = 1
    offPeriods = Math.max(0, interval - 1)
    weekdays = event.recurrence.daysOfWeek || []
  }

  // Step 1: Handle special cases first
  if (onPeriods === 1 && offPeriods === 0) {
    const baseLabel = periodDays === 1 ? "Daily" : "Weekly"
    const weekdayFilter = formatWeekdaysCompact(weekdays)
    return weekdayFilter ? `${baseLabel} on ${weekdayFilter}` : baseLabel
  }

  // Step 2: Generate base phrase from periods
  let label: string
  
  if (onPeriods === 1) {
    // "Every X" format for single on-period
    const total = onPeriods + offPeriods
    if (periodDays === 1) {
      label = `Every ${total} days`
    } else if (periodDays === 7) {
      label = `Every ${total} weeks`
    } else {
      const unit = `${periodDays}-day period`
      label = `Every ${total} ${unit}s`
    }
  } else {
    // "X on, Y off" format
    if (periodDays === 1) {
      label = `${onPeriods} days on, ${offPeriods} off`
    } else if (periodDays === 7) {
      label = `${onPeriods} weeks on, ${offPeriods} off`
    } else {
      label = `${onPeriods} periods on, ${offPeriods} off (${periodDays}-day period)`
    }
  }

  // Step 3: Add weekday filter if not all days selected
  const weekdayFilter = formatWeekdaysCompact(weekdays)
  if (weekdayFilter) {
    label += ` on ${weekdayFilter}`
  }

  return label
}


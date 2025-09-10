import { differenceInDays, differenceInWeeks, getWeek, isBefore, parseISO } from "date-fns"

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

  // For admin view, we want to show all events that are scheduled for this day of the week
  // but we still need to respect the recurrence intervals
  if (isAdminView) {
    // First check if this day is in the days array or daysOfWeek array
    const isOnThisDay = event.recurrence
      ? Array.isArray(event.recurrence.daysOfWeek) && event.recurrence.daysOfWeek.includes(dayOfWeek)
      : Array.isArray(event.days) && event.days.includes(dayOfWeek)

    if (!isOnThisDay) return false

    // Even in admin view, we should respect the recurrence intervals
    // We'll continue with the normal recurrence checks below
  }

  // Check if the event has a start date and if the current date is before that start date
  if (event.recurrence) {
    let startDateToCheck: Date | null = null

    // Check for direct startDate property
    if (event.recurrence.startDate) {
      startDateToCheck = parseISO(event.recurrence.startDate)
    }
    // Check for phaseStartDate in custom pattern
    else if (
      event.recurrence.type === "custom" &&
      event.recurrence.pattern &&
      event.recurrence.pattern.phaseStartDate
    ) {
      startDateToCheck = parseISO(event.recurrence.pattern.phaseStartDate)
    }

    // If we have a start date to check, verify the current date is not before it
    if (startDateToCheck) {
      // Set both dates to the beginning of the day for accurate comparison
      const startOfCurrentDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const startOfStartDate = new Date(
        startDateToCheck.getFullYear(),
        startDateToCheck.getMonth(),
        startDateToCheck.getDate(),
      )

      // If the current date is before the start date, don't show the event
      if (isBefore(startOfCurrentDate, startOfStartDate)) {
        return false
      }
    }
  }

  // If no recurrence, check the days array for backward compatibility
  if (!event.recurrence) {
    // Default to not showing if days array is missing or empty
    if (!Array.isArray(event.days) || event.days.length === 0) {
      return false
    }
    return event.days.includes(dayOfWeek)
  }

  // First check if the day is in the daysOfWeek array - this is the primary filter
  // If daysOfWeek is missing or empty, the event should not be shown on any day
  if (!event.recurrence.daysOfWeek || !event.recurrence.daysOfWeek.includes(dayOfWeek)) {
    return false
  }

  // If recurrence type is "none", don't show the event
  if (event.recurrence.type === "none") {
    return false
  }

  // If recurrence type is not specified, don't show the event (changed from previous behavior)
  if (!event.recurrence.type) {
    return false
  }

  // For daily recurrence with interval = 1 (or not specified), show every day
  if (event.recurrence.type === "daily" && (!event.recurrence.interval || event.recurrence.interval === 1)) {
    return true
  }

  // For weekly recurrence with interval = 1, show on all selected days
  if (event.recurrence.type === "weekly" && (!event.recurrence.interval || event.recurrence.interval === 1)) {
    return true
  }

  // For daily recurrence with interval > 1
  if (event.recurrence.type === "daily" && event.recurrence.interval && event.recurrence.interval > 1) {
    // If a start date is specified, use it to determine the phase
    if (event.recurrence.startDate) {
      const startDate = new Date(event.recurrence.startDate)
      // Calculate days since the start date
      const daysSinceStart = differenceInDays(date, startDate)
      // If the days since start is divisible by the interval, show the event
      return daysSinceStart % event.recurrence.interval === 0
    } else {
      // Fall back to the old behavior if no start date is specified
      // Calculate days since epoch (Jan 1, 1970)
      const daysSinceEpoch = Math.floor(date.getTime() / (1000 * 60 * 60 * 24))
      // If the days since epoch is divisible by the interval, show the event
      return daysSinceEpoch % event.recurrence.interval === 0
    }
  }

  // For weekly recurrence with interval > 1
  if (event.recurrence.type === "weekly" && event.recurrence.interval && event.recurrence.interval > 1) {
    // For other intervals, calculate which week we're in
    if (event.recurrence.startDate) {
      const startDate = new Date(event.recurrence.startDate)
      // Calculate weeks since the start date
      const weeksSinceStart = differenceInWeeks(date, startDate)
      // If the weeks since start is divisible by the interval, show the event
      return weeksSinceStart % event.recurrence.interval === 0
    } else {
      // Fall back to the old behavior if no start date is specified
      // Get the week number of the year
      const weekNumber = getWeek(date)
      // If the week number is divisible by the interval, show the event
      return weekNumber % event.recurrence.interval === 0
    }
  }

  // For custom pattern
  if (event.recurrence.type === "custom" && event.recurrence.pattern) {
    const { pattern } = event.recurrence
    const { onWeeks, offWeeks, phaseStartDate } = pattern

    // If no phase start date is set, don't show (changed from previous behavior)
    if (!phaseStartDate) return false

    // Calculate weeks since phase start
    const startDate = new Date(phaseStartDate)
    const weeksSinceStart = differenceInWeeks(date, startDate)

    // If weeksSinceStart is negative, we're before the start date
    if (weeksSinceStart < 0) return false

    // Calculate the total cycle length
    const cycleLength = onWeeks + offWeeks

    // Calculate position in the cycle
    const positionInCycle = ((weeksSinceStart % cycleLength) + cycleLength) % cycleLength

    // Determine if we're in an "on" period - always based on position in cycle
    // If position is less than onWeeks, we're in the "on" phase
    return positionInCycle < onWeeks
  }

  // Default to not showing the event if none of the above conditions are met
  return false
}

/**
 * Format recurrence information for display
 * @param event The event to format
 */
export function formatRecurrence(event: any): string | null {
  if (!event.recurrence || event.recurrence.type === "none") {
    return null
  }

  let recurrenceText = ""

  // Standard order of days for sorting
  const dayOrder = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

  switch (event.recurrence.type) {
    case "daily":
      recurrenceText = event.recurrence.interval === 1 ? "Daily" : `Every ${event.recurrence.interval} days`
      break
    case "weekly":
      recurrenceText = event.recurrence.interval === 1 ? "Weekly" : `Every ${event.recurrence.interval} weeks`

      if (event.recurrence.daysOfWeek && event.recurrence.daysOfWeek.length > 0) {
        // Sort the days according to the standard week order
        const sortedDays = [...event.recurrence.daysOfWeek].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b))

        // Format days as abbreviated capitalized names
        const formattedDays = sortedDays.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(", ")

        recurrenceText += ` on ${formattedDays}`
      }
      break
    case "custom":
      const { pattern } = event.recurrence
      if (pattern) {
        recurrenceText = `${pattern.onWeeks} week(s) on, ${pattern.offWeeks} week(s) off`

        if (event.recurrence.daysOfWeek && event.recurrence.daysOfWeek.length > 0) {
          // Sort the days according to the standard week order
          const sortedDays = [...event.recurrence.daysOfWeek].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b))

          // Format days as abbreviated capitalized names
          const formattedDays = sortedDays.map((d) => d.charAt(0).toUpperCase() + d.slice(1, 3)).join(", ")

          recurrenceText += ` on ${formattedDays}`
        }
      }
      break
  }

  // Add start date information if available
  if (event.recurrence.startDate) {
    const startDate = new Date(event.recurrence.startDate)
    recurrenceText += `, starting ${startDate.toLocaleDateString()}`
  } else if (
    event.recurrence.type === "custom" &&
    event.recurrence.pattern &&
    event.recurrence.pattern.phaseStartDate
  ) {
    const startDate = new Date(event.recurrence.pattern.phaseStartDate)
    recurrenceText += `, starting ${startDate.toLocaleDateString()}`
  }

  return recurrenceText
}

/**
 * Determine if days should be shown separately from recurrence
 * @param event The event to check
 */
export function shouldShowDaysSeparately(event: any): boolean {
  if (!event.recurrence || event.recurrence.type === "none") {
    return true // Show days for events without recurrence
  }

  // For daily recurrence, don't show days separately
  if (event.recurrence.type === "daily") {
    return false
  }

  // For weekly or custom recurrence, days are already shown in the recurrence text
  if (event.recurrence.type === "weekly" || event.recurrence.type === "custom") {
    return false
  }

  return true
}

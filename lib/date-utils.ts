/**
 * Date Utility Functions
 *
 * This file contains utility functions for working with dates.
 */

/**
 * Get the day of the week as a string (e.g., "sunday")
 * @param date The date to get the day of the week for
 */
export function getDayOfWeek(date: Date): string {
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
  return days[date.getDay()]
}

/**
 * Get the current date and time in the application's timezone
 * Currently set to UTC-2, but can be easily changed here for the entire app
 * @returns A new Date object representing the current time in the app timezone
 */
export function getAppTimezoneDate(): Date {
  const now = new Date()
  const timezoneOffsetHours = -2 // Change this value to adjust app timezone
  // First convert to UTC by adding the timezone offset
  // Then apply the app timezone offset
  return new Date(now.getTime() + now.getTimezoneOffset() * 60000 + (timezoneOffsetHours * 60 * 60 * 1000))
}

/**
 * Get the minutes until the next day in the application's timezone, rounded down to the nearest 5-minute increment
 * @returns Number of minutes until next day, rounded down to nearest 5
 */
export function getMinutesUntilNextDay(): number {
  const now = getAppTimezoneDate()
  
  // Create next day at midnight in app timezone
  const nextDay = new Date(now)
  nextDay.setDate(nextDay.getDate() + 1)
  nextDay.setHours(0, 0, 0, 0)
  
  // Calculate difference in milliseconds
  const diffMs = nextDay.getTime() - now.getTime()
  
  // Convert to minutes
  const totalMinutes = Math.floor(diffMs / (1000 * 60))
  
  // Round down to nearest 5-minute increment
  return Math.floor(totalMinutes / 5) * 5
}

/**
 * Format minutes into "X hour(s) X minutes" format, omitting zero values
 * @param totalMinutes The total minutes to format
 * @returns Formatted string like "2 hours 30 minutes" or "45 minutes" or "1 hour"
 */
export function formatTimeRemaining(totalMinutes: number): string {
  if (totalMinutes <= 0) return "0 minutes"
  
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  
  const parts: string[] = []
  
  if (hours > 0) {
    parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`)
  }
  
  if (minutes > 0) {
    parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`)
  }
  
  return parts.join(' ')
}

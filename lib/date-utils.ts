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

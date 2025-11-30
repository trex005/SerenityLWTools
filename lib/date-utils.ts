/**
 * Date Utility Functions
 *
 * This file contains utility functions for working with dates.
 */

import { addDays, endOfDay, startOfDay } from "date-fns"
import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz"

// Centralized timezone handling for the app (GMT-2)
export const APP_TIMEZONE = "Etc/GMT+2"

/**
 * Get the current date/time in the application's timezone.
 * The returned Date represents the same instant, but calculations should
 * always go through the helpers below to avoid leaking the user's timezone.
 */
export function getAppTimezoneDate(): Date {
  return toZonedTime(new Date(), APP_TIMEZONE)
}

/**
 * Start-of-day for "today" in the app timezone.
 */
export function getAppToday(): Date {
  return getStartOfAppDay(new Date())
}

/**
 * Convenience string key for today's date in the app timezone (yyyy-MM-dd).
 */
export function getAppTodayKey(): string {
  return formatInAppTimezone(new Date(), "yyyy-MM-dd")
}

/**
 * Format a Date in the app timezone using a date-fns pattern.
 */
export function formatInAppTimezone(date: Date, formatStr: string): string {
  return formatInTimeZone(date, APP_TIMEZONE, formatStr)
}

/**
 * Get the day-of-week string (sunday...saturday) in the app timezone.
 */
export function getDayOfWeek(date: Date): string {
  return formatInAppTimezone(date, "EEEE").toLowerCase()
}

/**
 * Start of day in the app timezone, returned as a UTC Date.
 */
export function getStartOfAppDay(date: Date = new Date()): Date {
  const zonedDate = toZonedTime(date, APP_TIMEZONE)
  const start = startOfDay(zonedDate)
  return fromZonedTime(start, APP_TIMEZONE)
}

/**
 * End of day in the app timezone, returned as a UTC Date.
 */
export function getEndOfAppDay(date: Date = new Date()): Date {
  const zonedDate = toZonedTime(date, APP_TIMEZONE)
  const end = endOfDay(zonedDate)
  return fromZonedTime(end, APP_TIMEZONE)
}

/**
 * Add whole days in the app timezone to keep boundaries stable.
 */
export function addAppDays(date: Date, amount: number): Date {
  const zonedDate = toZonedTime(date, APP_TIMEZONE)
  const shifted = addDays(zonedDate, amount)
  return fromZonedTime(shifted, APP_TIMEZONE)
}

/**
 * Get the minutes until the next day in the application's timezone, rounded down to the nearest 5-minute increment
 * @returns Number of minutes until next day, rounded down to nearest 5
 */
export function getMinutesUntilNextDay(): number {
  const nowZoned = getAppTimezoneDate()
  const nextDayStart = startOfDay(addDays(nowZoned, 1))
  const nowUtc = fromZonedTime(nowZoned, APP_TIMEZONE)
  const nextDayUtc = fromZonedTime(nextDayStart, APP_TIMEZONE)

  const diffMs = nextDayUtc.getTime() - nowUtc.getTime()
  const totalMinutes = Math.floor(diffMs / (1000 * 60))

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

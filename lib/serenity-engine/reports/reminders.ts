import { addDateKeyDays, eventOccursOnDate, weekdayForDateKey, type TagConfig } from "../core"

const BULLET_PREFIX = "\u2022 "

const effectiveValue = (event: any, dateKey: string, weekday: string, property: string): unknown => {
  const dateValue = event?.dateOverrides?.[dateKey]?.[property]
  if (dateValue !== undefined) return dateValue
  const variationValue = event?.variations?.[weekday]?.[property]
  return variationValue !== undefined ? variationValue : event?.[property]
}

const visibleEvents = (events: any[], dateKey: string, tagConfig: TagConfig): any[] => {
  const weekday = weekdayForDateKey(dateKey)
  return events.filter((event) => {
    if (!event || event.archived || !eventOccursOnDate(event, dateKey, tagConfig)) return false
    if (event.dateOverrides?.[dateKey]?.hidden === true) return false
    if (event.variations?.[weekday]?.hidden === true) return false
    return event.dateIncludeOverrides?.[dateKey] !== false
  })
}

type ReminderLine = {
  event: any
  line: string
  title: string
  startTime: string
  hasTimedStart: boolean
}

const reminderLine = (event: any, dateKey: string): ReminderLine => {
  const weekday = weekdayForDateKey(dateKey)
  const rawTitle = effectiveValue(event, dateKey, weekday, "title") ?? event.title ?? "Untitled event"
  const title = typeof rawTitle === "string" ? rawTitle.trim() || "Untitled event" : "Untitled event"
  const rawStart = effectiveValue(event, dateKey, weekday, "startTime")
  const startTime = typeof rawStart === "string" ? rawStart.trim() : ""
  const rawAllDay = effectiveValue(event, dateKey, weekday, "isAllDay")
  const isAllDay = typeof rawAllDay === "boolean" ? rawAllDay : false
  const hasTimedStart = Boolean(startTime) && !isAllDay
  return {
    event,
    line: `${hasTimedStart ? `${startTime} - ` : BULLET_PREFIX}${title}`,
    title,
    startTime,
    hasTimedStart,
  }
}

const compareLines = (a: ReminderLine, b: ReminderLine): number => {
  if (a.hasTimedStart !== b.hasTimedStart) return a.hasTimedStart ? -1 : 1
  if (a.hasTimedStart) {
    const time = a.startTime.localeCompare(b.startTime)
    if (time) return time
  } else {
    const order = (Number.isFinite(a.event?.order_value) ? a.event.order_value : 0)
      - (Number.isFinite(b.event?.order_value) ? b.event.order_value : 0)
    if (order) return order
  }
  const title = a.title.localeCompare(b.title, undefined, { sensitivity: "base" })
  return title || String(a.event?.id ?? "").localeCompare(String(b.event?.id ?? ""))
}

const duration = (totalMinutes: number): string => {
  if (totalMinutes <= 0) return "0 minutes"
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []
  if (hours) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`)
  if (minutes) parts.push(`${minutes} minute${minutes === 1 ? "" : "s"}`)
  return parts.join(" ")
}

export type DailyReminderReport = {
  content: string
  dayReminders: string[]
  tomorrowReminders: string[]
  todayEventCount: number
  tomorrowEventCount: number
}

export const generateDailyReminders = ({
  events,
  tagConfig,
  reportDate,
  minutesUntilReset,
}: {
  events: any[]
  tagConfig: TagConfig
  reportDate: string
  minutesUntilReset: number
}): DailyReminderReport => {
  const tomorrow = addDateKeyDays(reportDate, 1)
  const todayEvents = visibleEvents(events, reportDate, tagConfig)
  const tomorrowEvents = visibleEvents(events, tomorrow, tagConfig)
  const select = (items: any[], dateKey: string, property: string) => items
    .filter((event) => Boolean(effectiveValue(event, dateKey, weekdayForDateKey(dateKey), property)))
    .map((event) => reminderLine(event, dateKey))
    .sort(compareLines)
    .map(({ line }) => line)
  const dayReminders = select(todayEvents, reportDate, "remindEndOfDay")
  const tomorrowReminders = select(tomorrowEvents, tomorrow, "remindTomorrow")
  const sections = [`Reset in ${duration(minutesUntilReset)}!`]
  if (tomorrowReminders.length) sections.push(`Tomorrow:\n${tomorrowReminders.join("\n")}`)
  if (dayReminders.length) sections.push(`Reminders:\n${dayReminders.join("\n")}`)
  return {
    content: sections.join("\n\n"),
    dayReminders,
    tomorrowReminders,
    todayEventCount: todayEvents.length,
    tomorrowEventCount: tomorrowEvents.length,
  }
}

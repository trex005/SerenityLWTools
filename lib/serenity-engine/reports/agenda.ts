import { addDateKeyDays, eventOccursOnDate, validateReportDateRange, weekdayForDateKey, type TagConfig } from "../core"
import { composeEventsForDate, type ConfigurationLayer } from "../composition"

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"]
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

const parts = (dateKey: string): { year: number; month: number; day: number; weekday: number } => {
  const [year, month, day] = dateKey.split("-").map(Number)
  return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() }
}

const shortDate = (dateKey: string, withYear = false): string => {
  const value = parts(dateKey)
  return `${MONTHS[value.month - 1]} ${value.day}${withYear ? `, ${value.year}` : ""}`
}

const dayHeader = (dateKey: string): string => {
  const value = parts(dateKey)
  return `${WEEKDAYS[value.weekday]}, ${MONTHS[value.month - 1]} ${value.day}`
}

export const formatIndentedDescription = (description: string): string =>
  description ? description.split("\n").map((line) => `  ${line}`).join("\n") : ""

const hashString = (value: string): string => {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0
  return String(hash)
}

const effectiveValue = (event: any, property: string, weekday: string, dateKey: string): any => {
  const dateValue = event.dateOverrides?.[dateKey]?.[property]
  if (dateValue !== undefined) return dateValue
  const variationValue = event.variations?.[weekday]?.[property]
  return variationValue !== undefined ? variationValue : event[property]
}

const includedOnDate = (event: any, dateKey: string, tagConfig: TagConfig): boolean => {
  if (!event || event.archived || event.includeInBriefing === false) return false
  if (!eventOccursOnDate(event, dateKey, tagConfig)) return false
  const weekday = weekdayForDateKey(dateKey)
  if (event.dateOverrides?.[dateKey]?.hidden === true) return false
  if (event.variations?.[weekday]?.hidden === true) return false
  return event.dateIncludeOverrides?.[dateKey] !== false
}

const orderValue = (event: any): number => Number.isFinite(event?.order_value) ? event.order_value : 0
const eventTitle = (event: any): string => typeof event?.title === "string" && event.title.trim()
  ? event.title
  : event?.id ? `[Untitled event: ${event.id}]` : "[Untitled event]"

const compareForDate = (a: any, b: any, weekday: string, dateKey: string): number => {
  const aAllDay = Boolean(effectiveValue(a, "isAllDay", weekday, dateKey))
  const bAllDay = Boolean(effectiveValue(b, "isAllDay", weekday, dateKey))
  if (aAllDay !== bAllDay) return aAllDay ? 1 : -1
  if (!aAllDay) {
    const time = String(effectiveValue(a, "startTime", weekday, dateKey) || "00:00")
      .localeCompare(String(effectiveValue(b, "startTime", weekday, dateKey) || "00:00"))
    if (time) return time
  } else {
    const order = orderValue(a) - orderValue(b)
    if (order) return order
    const title = eventTitle(a).localeCompare(eventTitle(b), undefined, { sensitivity: "base" })
    if (title) return title
    return String(a?.id ?? "").localeCompare(String(b?.id ?? ""))
  }
  return 0
}

const generateAgendaWithResolver = ({
  resolve,
  startDate,
  endDate,
  referenceDate,
}: {
  resolve: (dateKey: string) => { events: any[]; tagConfig: TagConfig }
  startDate: string
  endDate: string
  referenceDate?: string
}): { content: string; eventCount: number } => {
  validateReportDateRange(startDate, endDate)
  let content = `Schedule for ${shortDate(startDate)} - ${shortDate(endDate, true)}\n\n`
  const includedDescriptions = new Set<string>()
  const tomorrow = referenceDate ? addDateKeyDays(referenceDate, 1) : undefined
  let eventCount = 0

  for (let dateKey = startDate; dateKey <= endDate; dateKey = addDateKeyDays(dateKey, 1)) {
    const { events, tagConfig } = resolve(dateKey)
    const weekday = weekdayForDateKey(dateKey)
    const dateEvents = events.filter((event) => includedOnDate(event, dateKey, tagConfig))
      .sort((a, b) => compareForDate(a, b, weekday, dateKey))
    if (!dateEvents.length) continue

    let header = dayHeader(dateKey)
    if (dateKey === referenceDate) header = `Today: ${header}`
    else if (dateKey === tomorrow) header = `Tomorrow: ${header}`
    content += `${header}\n`

    for (const event of dateEvents) {
      const isAllDay = Boolean(effectiveValue(event, "isAllDay", weekday, dateKey))
      const startTime = effectiveValue(event, "startTime", weekday, dateKey)
      const endTime = effectiveValue(event, "endTime", weekday, dateKey)
      const description = effectiveValue(event, "description", weekday, dateKey)
      let time = ""
      if (!isAllDay && startTime) time = `${startTime}${endTime ? ` - ${endTime}` : ""}: `
      content += `- ${time}${event.title}`
      if (description) {
        const key = `${event.id}-${hashString(String(description))}`
        if (!includedDescriptions.has(key)) {
          content += `\n${formatIndentedDescription(String(description))}`
          includedDescriptions.add(key)
        }
      }
      content += "\n"
      eventCount += 1
    }
    content += "\n"
  }
  return { content, eventCount }
}

export const generateAgenda = ({
  events,
  tagConfig,
  startDate,
  endDate,
  referenceDate,
}: {
  events: any[]
  tagConfig: TagConfig
  startDate: string
  endDate: string
  referenceDate?: string
}): { content: string; eventCount: number } => generateAgendaWithResolver({
  resolve: () => ({ events, tagConfig }),
  startDate,
  endDate,
  referenceDate,
})

export const generateAgendaFromLayers = ({
  layers,
  localTag,
  startDate,
  endDate,
  referenceDate,
}: {
  layers: ConfigurationLayer[]
  localTag?: string
  startDate: string
  endDate: string
  referenceDate?: string
}): { content: string; eventCount: number } => generateAgendaWithResolver({
  resolve: (date) => composeEventsForDate({ layers, localTag, date }),
  startDate,
  endDate,
  referenceDate,
})

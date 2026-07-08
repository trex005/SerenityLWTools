"use client"

export const getEventTitleForSort = (event: any): string => {
  if (typeof event?.title === "string" && event.title.trim()) {
    return event.title
  }
  return event?.id ? `[Untitled event: ${event.id}]` : "[Untitled event]"
}

export const getEventOrderValue = (event: any): number => {
  const value = event?.order_value
  return typeof value === "number" && Number.isFinite(value) ? value : 0
}

export const compareEventsByOrderValue = (a: any, b: any): number => {
  const orderDiff = getEventOrderValue(a) - getEventOrderValue(b)
  if (orderDiff !== 0) return orderDiff

  const titleDiff = getEventTitleForSort(a).localeCompare(getEventTitleForSort(b), undefined, {
    sensitivity: "base",
  })
  if (titleDiff !== 0) return titleDiff

  return String(a?.id ?? "").localeCompare(String(b?.id ?? ""))
}

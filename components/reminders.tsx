/**
 * Reminders Component
 *
 * This component displays reminders for a selected day, allowing users to view
 * and edit reminders in a textarea format with copy and regenerate functionality.
 */
"use client"

import type React from "react"

import { useCallback, useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEvents } from "@/hooks/use-events"
import {
  formatTimeRemaining,
  formatInAppTimezone,
  getAppToday,
  getDayOfWeek,
  addAppDays,
  getStartOfAppDay,
  getMinutesUntilNextDay,
} from "@/lib/date-utils"
import { Check, Copy, RefreshCw } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { shouldShowRecurringEvent } from "@/lib/recurrence-utils"
import { Input } from "@/components/ui/input"
import { scopedLocalStorage } from "@/lib/scoped-storage"

const STORAGE_PREFIX = "daily-reminders-content"
const BULLET_PREFIX = "\u2022 "

const getDateKey = (date: Date): string => formatInAppTimezone(date, "yyyy-MM-dd")

const getEffectiveValue = (event: any, date: Date, dayKey: string, property: string) => {
  const dateKey = getDateKey(date)

  if (
    event?.dateOverrides &&
    event.dateOverrides[dateKey] &&
    event.dateOverrides[dateKey][property] !== undefined
  ) {
    return event.dateOverrides[dateKey][property]
  }

  if (event?.variations && event.variations[dayKey] && event.variations[dayKey][property] !== undefined) {
    return event.variations[dayKey][property]
  }

  return event?.[property]
}

const isScheduledForDate = (event: any, date: Date, dayKey: string): boolean => {
  const dateKey = getDateKey(date)

  if (event?.dateIncludeOverrides && event.dateIncludeOverrides[dateKey] !== undefined) {
    return Boolean(event.dateIncludeOverrides[dateKey])
  }

  if (typeof event?.includeInExport === "boolean") {
    return event.includeInExport
  }

  if (event?.includeInExport && event.includeInExport[dayKey] !== undefined) {
    return Boolean(event.includeInExport[dayKey])
  }

  if (event?.includeInExport && typeof event.includeInExport === "object") {
    return Object.values(event.includeInExport).some((value) => value === true)
  }

  return false
}

const shouldIncludeEventOnDate = (event: any, date: Date, dayKey: string): boolean => {
  if (!event || event.archived) return false

  if (!isScheduledForDate(event, date, dayKey)) {
    return false
  }

  if (!shouldShowRecurringEvent(event, date, false)) {
    return false
  }

  const dateKey = getDateKey(date)

  if (event.dateOverrides && event.dateOverrides[dateKey]?.hidden === true) {
    return false
  }

  if (event.variations && event.variations[dayKey]?.hidden === true) {
    return false
  }

  if (
    event.dateIncludeOverrides &&
    event.dateIncludeOverrides[dateKey] !== undefined &&
    event.dateIncludeOverrides[dateKey] === false
  ) {
    return false
  }

  return true
}

const formatReminderLine = (event: any, date: Date, dayKey: string): { line: string; sortKey: string } => {
  const titleValue = getEffectiveValue(event, date, dayKey, "title") ?? event.title ?? "Untitled event"
  const title = typeof titleValue === "string" ? titleValue.trim() || "Untitled event" : "Untitled event"

  const startTimeValue = getEffectiveValue(event, date, dayKey, "startTime")
  const startTime =
    typeof startTimeValue === "string"
      ? startTimeValue.trim()
      : typeof event.startTime === "string"
        ? event.startTime.trim()
        : ""

  const isAllDayValue = getEffectiveValue(event, date, dayKey, "isAllDay")
  const isAllDay =
    typeof isAllDayValue === "boolean"
      ? isAllDayValue
      : typeof event.isAllDay === "boolean"
        ? event.isAllDay
        : false

  const hasTimedStart = Boolean(startTime) && !isAllDay
  const prefix = hasTimedStart ? `${startTime} - ` : BULLET_PREFIX
  const sortKey = hasTimedStart ? `a-${startTime}` : `z-${title.toLowerCase()}`

  return {
    line: `${prefix}${title}`,
    sortKey,
  }
}

/**
 * Reminders component
 * Displays reminders for a selected day with copy functionality
 */
export function Reminders() {
  // Access events from store
  const { events, hydrated } = useEvents()

  // State for selected date (defaults to current day in app timezone)
  const [selectedDate, setSelectedDate] = useState<Date>(() => getAppToday())

  // State for copy button feedback
  const [isCopied, setIsCopied] = useState(false)

  // State for editable textarea content
  const [textareaContent, setTextareaContent] = useState("")
  const [initializedKey, setInitializedKey] = useState<string | null>(null)

  // Calculate minutes until next day
  const minutesUntilNextDay = getMinutesUntilNextDay()

  const storageKey = useMemo(() => `${STORAGE_PREFIX}:${getDateKey(selectedDate)}`, [selectedDate])
  const tomorrowDate = useMemo(() => addAppDays(selectedDate, 1), [selectedDate])

  // Get events for the selected day and generate reminders
  const { dayReminders, tomorrowReminders, todayEventCount, tomorrowEventCount } = useMemo(() => {
    const dayKey = getDayOfWeek(selectedDate)
    const tomorrowKey = getDayOfWeek(tomorrowDate)

    const dayEvents = events.filter((event) => shouldIncludeEventOnDate(event, selectedDate, dayKey))
    const tomorrowEvents = events.filter((event) => shouldIncludeEventOnDate(event, tomorrowDate, tomorrowKey))

    const todayReminders = dayEvents
      .filter((event) => {
        const override = getEffectiveValue(event, selectedDate, dayKey, "remindEndOfDay")
        if (override !== undefined) {
          return Boolean(override)
        }
        return Boolean(event.remindEndOfDay)
      })
      .map((event) => formatReminderLine(event, selectedDate, dayKey))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map((item) => item.line)

    const tomorrowReminderList = tomorrowEvents
      .filter((event) => {
        const override = getEffectiveValue(event, tomorrowDate, tomorrowKey, "remindTomorrow")
        if (override !== undefined) {
          return Boolean(override)
        }
        return Boolean(event.remindTomorrow)
      })
      .map((event) => formatReminderLine(event, tomorrowDate, tomorrowKey))
      .sort((a, b) => a.sortKey.localeCompare(b.sortKey))
      .map((item) => item.line)

    return {
      dayReminders: todayReminders,
      tomorrowReminders: tomorrowReminderList,
      todayEventCount: dayEvents.length,
      tomorrowEventCount: tomorrowEvents.length,
    }
  }, [events, selectedDate, tomorrowDate])

  const buildReminderContent = useCallback(() => {
    const resetText = `Reset in ${formatTimeRemaining(minutesUntilNextDay)}!`
    const sections: string[] = [resetText]

    if (tomorrowReminders.length > 0) {
      sections.push(`Tomorrow:\n${tomorrowReminders.join("\n")}`)
    }

    if (dayReminders.length > 0) {
      sections.push(`Reminders:\n${dayReminders.join("\n")}`)
    }

    return sections.join("\n\n")
  }, [minutesUntilNextDay, dayReminders, tomorrowReminders])

  // Initialize or regenerate content when date changes or storage is empty
  useEffect(() => {
    if (initializedKey === storageKey) {
      return
    }

    const stored = scopedLocalStorage.getItem(storageKey)
    if (stored !== null) {
      setTextareaContent(stored)
      setInitializedKey(storageKey)
      return
    }

    if (!hydrated) {
      return
    }

    const generated = buildReminderContent()
    setTextareaContent(generated)
    setInitializedKey(storageKey)
    scopedLocalStorage.setItem(storageKey, generated)
  }, [storageKey, hydrated, initializedKey, buildReminderContent])

  // Persist content changes after initialization
  useEffect(() => {
    if (initializedKey !== storageKey) return
    scopedLocalStorage.setItem(storageKey, textareaContent)
  }, [textareaContent, storageKey, initializedKey])

  // Handle copy to clipboard
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(textareaContent)
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), 2000)
    } catch (error) {
      console.error("Failed to copy to clipboard:", error)
    }
  }

  const handleRegenerate = () => {
    const content = buildReminderContent()
    setTextareaContent(content)
    setInitializedKey(storageKey)
    scopedLocalStorage.setItem(storageKey, content)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Daily Reminders</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Date Selector */}
          <div className="grid gap-2">
            <Label htmlFor="date-input">Select Date</Label>
            <Input
              id="date-input"
              type="date"
              value={selectedDate ? formatInAppTimezone(selectedDate, "yyyy-MM-dd") : ""}
              onChange={(e) => {
                if (e.target.value) {
                  // Parse date manually to avoid timezone issues
                  const [year, month, day] = e.target.value.split("-").map(Number)
                  setSelectedDate(getStartOfAppDay(new Date(year, month - 1, day)))
                  setTextareaContent("")
                  setInitializedKey(null)
                }
              }}
              className="w-[240px]"
            />
          </div>

          {/* Reminders Textarea */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="reminders-textarea">Reminders</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerate}
                  className="flex items-center gap-1"
                  title="Regenerate reminders"
                >
                  <RefreshCw className="h-4 w-4" />
                  <span className="sr-only">Regenerate</span>
                </Button>
                <Button variant="outline" size="sm" onClick={handleCopy} className="flex items-center gap-2">
                  {isCopied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied!
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </Button>
              </div>
            </div>

            {/* Character Counter */}
            <div className="flex justify-between items-center">
              <div
                className={`text-sm ${
                  textareaContent.length > 500
                    ? "text-destructive font-medium"
                    : textareaContent.length > 450
                      ? "text-amber-500 font-medium"
                      : "text-muted-foreground"
                }`}
              >
                {textareaContent.length > 500
                  ? `Character limit exceeded: ${textareaContent.length}/500`
                  : textareaContent.length > 450
                    ? `Approaching limit: ${textareaContent.length}/500`
                    : `Characters: ${textareaContent.length}/500`}
              </div>
            </div>
            <Textarea
              id="reminders-textarea"
              value={textareaContent}
              onChange={(e) => {
                if (initializedKey !== storageKey) {
                  setInitializedKey(storageKey)
                }
                setTextareaContent(e.target.value)
              }}
              placeholder="No reminders for this day"
              className="min-h-[200px] font-mono text-sm"
              spellCheck={false}
            />
          </div>

          {/* Status Info */}
          <div className="text-sm text-muted-foreground">
            Found {dayReminders.length} reminder{dayReminders.length !== 1 ? "s" : ""} for{" "}
            {formatInAppTimezone(selectedDate, "EEEE, MMM d")}
            {tomorrowReminders.length > 0 && (
              <span> • {tomorrowReminders.length} tomorrow reminder{tomorrowReminders.length !== 1 ? "s" : ""}</span>
            )}
          </div>

          {/* Debug Info */}
          <div className="text-xs text-muted-foreground mt-2 p-2 bg-gray-100 rounded">
            <strong>Debug:</strong> {events.length} total events • {todayEventCount} active on{" "}
            {formatInAppTimezone(selectedDate, "EEEE")} • {tomorrowEventCount} active on{" "}
            {formatInAppTimezone(tomorrowDate, "EEEE")}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

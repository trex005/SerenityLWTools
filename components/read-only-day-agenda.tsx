"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { useConfigData } from "@/hooks/use-config-data"
import { shouldShowRecurringEvent } from "@/lib/recurrence-utils"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { format } from "date-fns"

interface ReadOnlyDayAgendaProps {
  day: string
  date: Date
  showLocalTime?: boolean
  setShowLocalTime?: (value: boolean) => void
}

export function ReadOnlyDayAgenda({ day, date, showLocalTime = false, setShowLocalTime }: ReadOnlyDayAgendaProps) {
  // Access events data from config
  const { events, isLoaded } = useConfigData()

  // State to manage all-day and time-specific events
  const [allDayEvents, setAllDayEvents] = useState<any[]>([])
  const [timeEvents, setTimeEvents] = useState<any[]>([])

  // If parent provides showLocalTime and setShowLocalTime, use those
  // Otherwise, manage state internally
  const [internalShowLocalTime, setInternalShowLocalTime] = useState(() => {
    // Load preference from localStorage, default to true
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("show-local-time")
      return saved ? JSON.parse(saved) : true
    }
    return true
  })

  // Use parent state if provided, otherwise use internal state
  const effectiveShowLocalTime = showLocalTime !== undefined ? showLocalTime : internalShowLocalTime

  // Function to update showLocalTime and save to localStorage
  const handleShowLocalTimeChange = (value: boolean) => {
    if (setShowLocalTime) {
      // If parent provided a setter, use it
      setShowLocalTime(value)
    } else {
      // Otherwise use internal state
      setInternalShowLocalTime(value)
      localStorage.setItem("show-local-time", JSON.stringify(value))
    }
  }

  /**
   * Effect to filter and organize events for the current day
   * It separates all-day events from time-specific events and sorts them appropriately
   */
  useEffect(() => {
    if (!isLoaded) return

    // Filter events for the current day that are not archived and match recurrence pattern
    const dayEvents = events.filter((event) => {
      // First check if the event should be shown based on recurrence pattern
      // Pass isAdminView=false to respect all exclusions in the read-only view
      const shouldShow = !event.archived && shouldShowRecurringEvent(event, date, false)

      // If the basic check fails, don't show the event
      if (!shouldShow) return false

      // Additional check for date-specific overrides that might hide the event
      const dateString = date.toISOString().split("T")[0]

      // If there's a date override that explicitly sets hidden to true, don't show
      if (event.dateOverrides && event.dateOverrides[dateString] && event.dateOverrides[dateString].hidden === true) {
        return false
      }

      // If there's a day variation that explicitly sets hidden to true, don't show
      if (event.variations && event.variations[day] && event.variations[day].hidden === true) {
        return false
      }

      // Check includeInExport property - if it's false for this day, don't show the event
      // This check is ONLY applied in the read-only view
      if (event.includeInExport) {
        // Check date-specific override first
        if (event.dateIncludeOverrides && event.dateIncludeOverrides[dateString] !== undefined) {
          if (event.dateIncludeOverrides[dateString] === false) {
            return false
          }
        }
        // Then check day-specific setting
        else if (event.includeInExport[day] === false) {
          return false
        }
      }

      return true
    })

    // Split into all-day and time-specific events
    const allDay = dayEvents
      .filter((event) => {
        // Check if there's a date-specific override
        const dateString = date.toISOString().split("T")[0]
        if (
          event.dateOverrides &&
          event.dateOverrides[dateString] &&
          event.dateOverrides[dateString].isAllDay !== undefined
        ) {
          return event.dateOverrides[dateString].isAllDay
        }

        // Check if there's a day-specific variation
        if (event.variations && event.variations[day] && event.variations[day].isAllDay !== undefined) {
          return event.variations[day].isAllDay
        }

        // Fall back to the main event property
        return event.isAllDay
      })
      .sort((a, b) => {
        // Sort by custom order if available
        const orderA = a.order && a.order[day] !== undefined ? a.order[day] : 999
        const orderB = b.order && b.order[day] !== undefined ? b.order[day] : 999
        return orderA - orderB
      })

    const timed = dayEvents
      .filter((event) => {
        // Check if there's a date-specific override
        const dateString = date.toISOString().split("T")[0]
        if (
          event.dateOverrides &&
          event.dateOverrides[dateString] &&
          event.dateOverrides[dateString].isAllDay !== undefined
        ) {
          return !event.dateOverrides[dateString].isAllDay
        }

        // Check if there's a day-specific variation
        if (event.variations && event.variations[day] && event.variations[day].isAllDay !== undefined) {
          return !event.variations[day].isAllDay
        }

        // Fall back to the main event property
        return !event.isAllDay
      })
      .sort((a, b) => {
        // Get the effective start time (considering date overrides and variations)
        const getStartTime = (event: any) => {
          const dateString = date.toISOString().split("T")[0]

          // Check for date override first
          if (event.dateOverrides && event.dateOverrides[dateString] && event.dateOverrides[dateString].startTime) {
            return event.dateOverrides[dateString].startTime
          }

          // Then check for day variation
          if (event.variations && event.variations[day] && event.variations[day].startTime) {
            return event.variations[day].startTime
          }

          // Fall back to main event property
          return event.startTime || "00:00"
        }

        return getStartTime(a).localeCompare(getStartTime(b))
      })

    setTimeEvents(timed)
    setAllDayEvents(allDay)
  }, [events, day, date, isLoaded])

  // Function to format local time
  const formatLocalTime = (timeString: string): string => {
    if (!timeString) return ""

    // Parse the time string (format: "HH:MM")
    const [hours, minutes] = timeString.split(":").map(Number)

    // Create a date object for today
    const date = new Date()

    // Reset to midnight in local time
    date.setHours(0, 0, 0, 0)

    // Convert server time (UTC-2) to UTC
    const utcHours = hours + 2

    // Set the time in UTC
    date.setUTCHours(utcHours, minutes, 0, 0)

    // Format in local time with AM/PM
    return new Intl.DateTimeFormat("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }).format(date)
  }

  /**
   * Helper function to get the effective value for a property
   */
  const getEffectiveValue = (event: any, property: string) => {
    // Format the date as YYYY-MM-DD for use with dateOverrides
    const dateString = format(date, "yyyy-MM-dd")

    // First check for date-specific override
    if (
      event.dateOverrides &&
      event.dateOverrides[dateString] &&
      event.dateOverrides[dateString][property] !== undefined
    ) {
      return event.dateOverrides[dateString][property]
    }

    // Then check for day-specific variation
    if (event.variations && event.variations[day] && event.variations[day][property] !== undefined) {
      return event.variations[day][property]
    }

    // Fall back to the main event property
    return event[property]
  }

  return (
    <div className="space-y-6">
      {/* Time-specific Events Section - Now displayed first */}
      {timeEvents.length > 0 && (
        <div>
          <div className="flex justify-between items-center mb-2">
            <h4 className="text-md font-medium">Scheduled Events</h4>
            <div className="flex items-center gap-2">
              <Switch
                id={`show-local-time-${day}`}
                checked={effectiveShowLocalTime}
                onCheckedChange={handleShowLocalTimeChange}
                className="data-[state=checked]:bg-primary/40"
              />
              <Label htmlFor={`show-local-time-${day}`} className="text-xs text-muted-foreground">
                also display local time
              </Label>
            </div>
          </div>
          <div className="space-y-2">
            {timeEvents.map((event) => (
              <ReadOnlyEventCard
                key={event.id}
                event={event}
                day={day}
                date={date}
                showLocalTime={effectiveShowLocalTime}
                getEffectiveValue={getEffectiveValue}
                formatLocalTime={formatLocalTime}
              />
            ))}
          </div>
        </div>
      )}

      {/* All-day Events Section - Now displayed second */}
      {allDayEvents.length > 0 && (
        <div>
          <h4 className="text-md font-medium mb-2">All-day Events</h4>
          <div className="space-y-2">
            {allDayEvents.map((event) => (
              <ReadOnlyEventCard
                key={event.id}
                event={event}
                day={day}
                date={date}
                showLocalTime={effectiveShowLocalTime}
                getEffectiveValue={getEffectiveValue}
                formatLocalTime={formatLocalTime}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state message */}
      {allDayEvents.length === 0 && timeEvents.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">No events scheduled for this day.</div>
      )}
    </div>
  )
}

interface ReadOnlyEventCardProps {
  event: any
  day: string
  date: Date
  showLocalTime?: boolean
  getEffectiveValue: (event: any, property: string) => any
  formatLocalTime: (timeString: string) => string
}

function ReadOnlyEventCard({
  event,
  day,
  date,
  showLocalTime = false,
  getEffectiveValue,
  formatLocalTime,
}: ReadOnlyEventCardProps) {
  // Get effective values for this day/date
  const isAllDay = getEffectiveValue(event, "isAllDay")
  const startTime = getEffectiveValue(event, "startTime")
  const endTime = getEffectiveValue(event, "endTime")
  const description = getEffectiveValue(event, "description")

  return (
    <Card>
      <CardContent className="p-4">
        <div>
          <h4 className="font-medium">{event.title}</h4>

          {!isAllDay && startTime && (
            <div className="text-sm text-muted-foreground">
              {startTime}
              {endTime ? ` - ${endTime}` : ""}

              {showLocalTime && (
                <span className="text-xs text-muted-foreground/60 ml-2">
                  ({formatLocalTime(startTime)}
                  {endTime ? ` - ${formatLocalTime(endTime)}` : ""})
                </span>
              )}
            </div>
          )}

          {/* Event Description */}
          {description && <p className="text-sm mt-2 text-muted-foreground whitespace-pre-line">{description}</p>}
        </div>
      </CardContent>
    </Card>
  )
}

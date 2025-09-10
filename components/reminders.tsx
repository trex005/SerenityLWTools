/**
 * Reminders Component
 *
 * This component displays reminders for a selected day, allowing users to view
 * and edit reminders in a textarea format with copy functionality.
 */
"use client"

import type React from "react"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { useEvents } from "@/hooks/use-events"
import { format, startOfDay, addDays } from "date-fns"
import { getAppTimezoneDate, getMinutesUntilNextDay, formatTimeRemaining } from "@/lib/date-utils"
import { Copy, Check, Calendar } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { shouldShowRecurringEvent } from "@/lib/recurrence-utils"
import { Input } from "@/components/ui/input"
import { cn } from "@/lib/utils"

/**
 * Reminders component
 * Displays reminders for a selected day with copy functionality
 */
export function Reminders() {
  // Access events from store
  const { events } = useEvents()
  
  // State for selected date (defaults to current day in app timezone)
  const [selectedDate, setSelectedDate] = useState<Date>(() => {
    return startOfDay(getAppTimezoneDate())
  })
  
  
  // State for copy button feedback
  const [isCopied, setIsCopied] = useState(false)
  
  // State for editable textarea content
  const [textareaContent, setTextareaContent] = useState("")
  
  // Calculate minutes until next day
  const minutesUntilNextDay = getMinutesUntilNextDay()
  
  // Get events for the selected day and generate reminders
  const { dayReminders, tomorrowReminders } = useMemo(() => {
    const selectedDayStr = format(selectedDate, "yyyy-MM-dd")
    const dayOfWeek = format(selectedDate, "EEEE").toLowerCase()
    
    // Calculate tomorrow's date and day of week
    const tomorrow = addDays(selectedDate, 1)
    const tomorrowDayOfWeek = format(tomorrow, "EEEE").toLowerCase()
    
    // Filter events for this day
    const dayEvents = events.filter(event => {
      // Check if event is scheduled for this day of week
      if (event.days.includes(dayOfWeek)) {
        // Check if it's a recurring event and should show on this date
        if (event.recurrence) {
          return shouldShowRecurringEvent(event, selectedDate)
        }
        return true
      }
      return false
    })
    
    // Filter events for tomorrow that should be reminded today
    const tomorrowEvents = events.filter(event => {
      // Only include events with remindTomorrow checked
      if (!event.remindTomorrow) return false
      
      // Check if event is scheduled for tomorrow's day of week
      if (event.days.includes(tomorrowDayOfWeek)) {
        // Check if it's a recurring event and should show on tomorrow's date
        if (event.recurrence) {
          return shouldShowRecurringEvent(event, tomorrow)
        }
        return true
      }
      return false
    })
    
    // Process today's end-of-day reminders
    const todayReminders = dayEvents
      .filter(event => event.remindEndOfDay)
      .sort((a, b) => {
        // Sort by start time
        return a.startTime.localeCompare(b.startTime)
      })
      .map(event => {
        const timePrefix = event.startTime && event.startTime.trim() !== "" && !event.isAllDay
          ? `${event.startTime}-` 
          : "• "
        return `${timePrefix}${event.title}`
      })
    
    // Process tomorrow's reminders - these will be displayed differently
    const tomorrowReminderList = tomorrowEvents
      .sort((a, b) => {
        // Sort by start time, but put events without start time at the end (or isAllDay events)
        const aTime = a.startTime && a.startTime.trim() !== "" && !a.isAllDay ? a.startTime : "99:99"
        const bTime = b.startTime && b.startTime.trim() !== "" && !b.isAllDay ? b.startTime : "99:99"
        return aTime.localeCompare(bTime)
      })
      .map(event => {
        const timePrefix = event.startTime && event.startTime.trim() !== "" && !event.isAllDay
          ? `${event.startTime}-` 
          : "• "
        return `${timePrefix}${event.title}`
      })
    
    return { dayReminders: todayReminders, tomorrowReminders: tomorrowReminderList }
  }, [events, selectedDate])
  
  // Generate formatted content for textarea
  useEffect(() => {
    const resetText = `Reset in ${formatTimeRemaining(minutesUntilNextDay)}!`
    
    let content = `${resetText}\n\n`
    
    // Add tomorrow's reminders if any exist
    if (tomorrowReminders.length > 0) {
      content += `Tomorrow:\n${tomorrowReminders.join('\n')}\n\n`
    }
    
    // Add today's reminders only if there are any
    if (dayReminders.length > 0) {
      content += 'Reminders:\n'
      content += dayReminders.join('\n')
    }
    
    setTextareaContent(content)
  }, [minutesUntilNextDay, dayReminders, tomorrowReminders])
  
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
              value={selectedDate ? format(selectedDate, "yyyy-MM-dd") : ""}
              onChange={(e) => {
                if (e.target.value) {
                  setSelectedDate(startOfDay(new Date(e.target.value)))
                }
              }}
              className="w-[240px]"
            />
          </div>
          
          {/* Reminders Textarea */}
          <div className="grid gap-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="reminders-textarea">Reminders</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={handleCopy}
                className="flex items-center gap-2"
              >
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
              onChange={(e) => setTextareaContent(e.target.value)}
              placeholder="No reminders for this day"
              className="min-h-[200px] font-mono text-sm"
              spellCheck={false}
            />
          </div>
          
          {/* Status Info */}
          <div className="text-sm text-muted-foreground">
            Found {dayReminders.length} reminder{dayReminders.length !== 1 ? 's' : ''} for {format(selectedDate, "EEEE, MMM d")}
            {tomorrowReminders.length > 0 && (
              <span> • {tomorrowReminders.length} tomorrow reminder{tomorrowReminders.length !== 1 ? 's' : ''}</span>
            )}
          </div>
          
          {/* Debug Info */}
          <div className="text-xs text-muted-foreground mt-2 p-2 bg-gray-100 rounded">
            <strong>Debug:</strong> {events.length} total events, {events.filter(e => e.remindTomorrow).length} with remindTomorrow, {events.filter(e => e.remindEndOfDay).length} with remindEndOfDay
            <br />
            Tomorrow ({format(addDays(selectedDate, 1), 'EEEE')}): {events.filter(e => e.remindTomorrow && e.days.includes(format(addDays(selectedDate, 1), 'EEEE').toLowerCase())).length} matching events
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
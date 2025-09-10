/**
 * Email Generator Component
 *
 * This component provides the email generation functionality in a tab view
 * rather than a dialog. It allows users to generate an email with events
 * from a selected date range.
 */
"use client"

import type React from "react"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DateRangeSelector } from "@/components/date-range-selector"
import { useEvents } from "@/hooks/use-events"
import { useTips } from "@/hooks/use-tips"
import { addDays, startOfDay, endOfDay, format } from "date-fns"
import { Copy, Check, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { shouldShowRecurringEvent } from "@/lib/recurrence-utils"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Checkbox } from "@/components/ui/checkbox"

/**
 * Simple string hashing function to create a unique identifier for description content
 */
const hashString = (str: string): string => {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash = hash & hash // Convert to 32bit integer
  }
  return hash.toString()
}

interface EmailGeneratorProps {
  initialDateRange?: [Date | undefined, Date | undefined]
}

export function EmailGenerator({ initialDateRange }: EmailGeneratorProps) {
  // Access events and tips from stores
  const { events } = useEvents()
  const { tips, updateTip } = useTips()

  // State for date range - ALWAYS default to today and tomorrow in UTC-2
  const [dateRange, setDateRange] = useState<[Date | undefined, Date | undefined]>(() => {
    // Get current date in UTC-2
    const now = new Date()
    // First convert to UTC by adding the timezone offset
    // Then subtract 2 hours (120 minutes) to get UTC-2
    const utcMinus2 = new Date(now.getTime() + now.getTimezoneOffset() * 60000 - 120 * 60000)
    const today = startOfDay(utcMinus2)
    const tomorrow = endOfDay(addDays(today, 1))
    return [today, tomorrow] // Default to today and tomorrow in UTC-2
  })

  // State for selected tip
  const [selectedTip, setSelectedTip] = useState<string | null>(null)

  // State for generated email content
  const [agendaContent, setAgendaContent] = useState("")

  // State for tip content (now separate)
  const [tipContent, setTipContent] = useState("")

  // State for tracking user edits to the email content
  const [editedAgendaContent, setEditedAgendaContent] = useState("")

  // State for edited tip content
  const [editedTipContent, setEditedTipContent] = useState("")

  // State for optional header (persisted in localStorage)
  const [headerContent, setHeaderContent] = useState("")

  // State for copy button
  const [copied, setCopied] = useState(false)

  // State for tip search and filter
  const [tipSearchTerm, setTipSearchTerm] = useState("")
  const [tipFilterOption, setTipFilterOption] = useState<"all" | "used" | "unused">("all")

  // State for regeneration dialog
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false)
  const [clearTipOnRegenerate, setClearTipOnRegenerate] = useState(() => {
    const saved = localStorage.getItem("daily-agenda-clear-tip-preference")
    return saved ? JSON.parse(saved) : true
  })

  // Ref to track previous date range for comparison
  const prevDateRangeRef = useRef<[Date | undefined, Date | undefined]>(dateRange)

  // Load persisted content from localStorage on initial render
  useEffect(() => {
    const savedHeader = localStorage.getItem("daily-agenda-email-header")
    if (savedHeader) {
      setHeaderContent(savedHeader)
    }

    const savedAgenda = localStorage.getItem("daily-agenda-email-content")
    if (savedAgenda) {
      setEditedAgendaContent(savedAgenda)
    }

    const savedTip = localStorage.getItem("daily-agenda-tip-content")
    if (savedTip) {
      setEditedTipContent(savedTip)
    }
  }, [])

  // Save header content to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("daily-agenda-email-header", headerContent)
  }, [headerContent])

  // Save agenda content to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("daily-agenda-email-content", editedAgendaContent)
  }, [editedAgendaContent])

  // Save tip content to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem("daily-agenda-tip-content", editedTipContent)
  }, [editedTipContent])

  // Save clear tip preference to localStorage
  useEffect(() => {
    localStorage.setItem("daily-agenda-clear-tip-preference", JSON.stringify(clearTipOnRegenerate))
  }, [clearTipOnRegenerate])

  // Check if date range has changed and show regenerate dialog
  useEffect(() => {
    // Skip on initial render
    const prevStart = prevDateRangeRef.current[0]?.getTime()
    const prevEnd = prevDateRangeRef.current[1]?.getTime()
    const currentStart = dateRange[0]?.getTime()
    const currentEnd = dateRange[1]?.getTime()

    if (
      prevStart !== undefined &&
      prevEnd !== undefined &&
      currentStart !== undefined &&
      currentEnd !== undefined &&
      (prevStart !== currentStart || prevEnd !== currentEnd)
    ) {
      setShowRegenerateDialog(true)
    }

    // Update ref with current date range
    prevDateRangeRef.current = dateRange
  }, [dateRange])

  // Generate email content when date range changes
  useEffect(() => {
    if (dateRange[0] && dateRange[1]) {
      generateAgendaContent()
    }
  }, [events]) // Only regenerate when events change, not when date range changes

  // Update editedAgendaContent whenever agendaContent changes
  useEffect(() => {
    if (agendaContent && !editedAgendaContent) {
      setEditedAgendaContent(agendaContent)
    }
  }, [agendaContent])

  // Update editedTipContent whenever tipContent changes
  useEffect(() => {
    if (tipContent) {
      setEditedTipContent(tipContent)
    }
  }, [tipContent])

  // Generate tip content when selected tip changes
  useEffect(() => {
    if (selectedTip) {
      generateTipContent()
    }
  }, [selectedTip])

  // Filter tips based on search term and filter option
  const filteredTips = tips.filter((tip) => {
    // First filter by search term
    if (tipSearchTerm && !tip.content.toLowerCase().includes(tipSearchTerm.toLowerCase())) {
      return false
    }

    // Filter out tips that can't be used in briefing
    if (tip.canUseInBriefing === false) {
      return false
    }

    // Then filter by usage status
    if (tipFilterOption === "used" && !tip.lastUsed) {
      return false
    }
    if (tipFilterOption === "unused" && tip.lastUsed) {
      return false
    }

    return true
  })

  // Sort tips by last used date (most recent at bottom)
  const sortedTips = [...filteredTips].sort((a, b) => {
    // If neither has been used, sort by content
    if (!a.lastUsed && !b.lastUsed) {
      return a.content.localeCompare(b.content)
    }

    // If only one has been used, put the unused one first
    if (!a.lastUsed) return -1
    if (!b.lastUsed) return 1

    // Both have been used, sort by date (oldest first)
    return new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime()
  })

  /**
   * Format description text with proper indentation for multi-line descriptions
   */
  const formatDescription = (description: string): string => {
    if (!description) return ""

    // Split the description by newlines
    const lines = description.split("\n")

    // If there's only one line, return it as is
    if (lines.length < 1) return description

    // For multi-line descriptions, add two spaces to the beginning of each line after the first
    return lines.map((line) => `  ${line}`).join("\n")
  }

  /**
   * Check if an event should be included in the export for a specific date
   */
  const shouldIncludeEventForDate = (event: any, date: Date) => {
    const dateStr = format(date, "yyyy-MM-dd")
    const dayOfWeek = getDayOfWeek(date)

    // Check date-specific override first
    if (event.dateIncludeOverrides && dateStr in event.dateIncludeOverrides) {
      return event.dateIncludeOverrides[dateStr]
    }

    // Then check day-specific setting
    if (event.includeInExport && dayOfWeek in event.includeInExport) {
      return event.includeInExport[dayOfWeek]
    }

    // Default to false if no specific setting found
    return false
  }

  /**
   * Generate agenda content based on selected date range
   */
  const generateAgendaContent = () => {
    if (!dateRange[0] || !dateRange[1]) return

    const includedDescriptions = new Set<string>() // Track which descriptions have been included by content hash

    // Get events for the selected date range
    const filteredEvents = events.filter((event) => {
      // Skip archived events
      if (event.archived) return false

      // Check if the event occurs on any day within the date range
      const eventDates = getEventDatesInRange(event, dateRange[0]!, dateRange[1]!)
      return eventDates.length > 0
    })

    // Generate email content
    let content = ""

    // Add date range header
    content += `Schedule for ${format(dateRange[0]!, "MMMM d")} - ${format(dateRange[1]!, "MMMM d, yyyy")}\n\n`

    // Create a new date to iterate through the range
    const currentDate = new Date(dateRange[0]!.getTime())
    const endDate = new Date(dateRange[1]!.getTime())

    // Get current date in UTC-2 for "Today" and "Tomorrow" labels
    const now = new Date()
    // First convert to UTC by adding the timezone offset
    // Then subtract 2 hours (120 minutes) to get UTC-2
    const utcMinus2 = new Date(now.getTime() + now.getTimezoneOffset() * 60000 - 120 * 60000)
    const utcMinus2Today = startOfDay(utcMinus2)
    const utcMinus2Tomorrow = startOfDay(addDays(utcMinus2Today, 1))

    // Iterate through each day in the range
    while (currentDate <= endDate) {
      const dateStr = format(currentDate, "yyyy-MM-dd")
      const dayOfWeek = getDayOfWeek(currentDate)

      // Get events for this specific date
      const dateEvents = filteredEvents.filter((event) => {
        return shouldShowRecurringEvent(event, currentDate) && shouldIncludeEventForDate(event, currentDate)
      })

      // Only add the date if there are events for it
      if (dateEvents.length > 0) {
        // Add the date header with Today/Tomorrow prefix if applicable
        let dateHeader = format(currentDate, "EEEE, MMMM d")

        // Check if this date is today or tomorrow in UTC-2
        if (format(currentDate, "yyyy-MM-dd") === format(utcMinus2Today, "yyyy-MM-dd")) {
          dateHeader = "Today: " + dateHeader
        } else if (format(currentDate, "yyyy-MM-dd") === format(utcMinus2Tomorrow, "yyyy-MM-dd")) {
          dateHeader = "Tomorrow: " + dateHeader
        }

        content += `${dateHeader}\n`

        // Sort events by time
        const sortedEvents = [...dateEvents].sort((a, b) => {
          // Get effective values for this specific date
          const aIsAllDay = getEffectiveValue(a, "isAllDay", dayOfWeek, dateStr)
          const bIsAllDay = getEffectiveValue(b, "isAllDay", dayOfWeek, dateStr)

          // Timed events come before all-day events
          if (!aIsAllDay && bIsAllDay) return -1
          if (aIsAllDay && !bIsAllDay) return 1

          // If both are timed, sort by start time
          if (!aIsAllDay && !bIsAllDay) {
            const aStartTime = getEffectiveValue(a, "startTime", dayOfWeek, dateStr) || "00:00"
            const bStartTime = getEffectiveValue(b, "startTime", dayOfWeek, dateStr) || "00:00"
            return aStartTime.localeCompare(bStartTime)
          }

          // If both are all-day events, sort by custom order if available
          if (aIsAllDay && bIsAllDay) {
            const aOrder = a.order && a.order[dayOfWeek] !== undefined ? a.order[dayOfWeek] : 999
            const bOrder = b.order && b.order[dayOfWeek] !== undefined ? b.order[dayOfWeek] : 999
            return aOrder - bOrder
          }

          return 0
        })

        // Add each event
        sortedEvents.forEach((event) => {
          // Get effective values for this specific date
          const isAllDay = getEffectiveValue(event, "isAllDay", dayOfWeek, dateStr)
          const startTime = getEffectiveValue(event, "startTime", dayOfWeek, dateStr)
          const endTime = getEffectiveValue(event, "endTime", dayOfWeek, dateStr)
          const description = getEffectiveValue(event, "description", dayOfWeek, dateStr)

          // Format time
          let timeStr = ""
          if (!isAllDay && startTime) {
            timeStr += startTime
            if (endTime) {
              timeStr += ` - ${endTime}`
            }
            timeStr += ": "
          }

          // Add event title
          content += `- ${timeStr}${event.title}`

          // Add description with proper formatting on a new line, but only if this specific description hasn't been included
          if (description) {
            // Create a unique key for this description (event ID + description content hash)
            const descriptionKey = `${event.id}-${hashString(description)}`

            if (!includedDescriptions.has(descriptionKey)) {
              const formattedDescription = formatDescription(description)
              content += `\n${formattedDescription}`

              // Mark this specific description as included
              includedDescriptions.add(descriptionKey)
            }
          }

          content += "\n"
        })

        content += "\n"
      }

      // Move to the next day
      currentDate.setDate(currentDate.getDate() + 1)
    }

    setAgendaContent(content)
  }

  /**
   * Generate tip content based on selected tip
   */
  const generateTipContent = () => {
    if (!selectedTip) return

    const tip = tips.find((t) => t.id === selectedTip)
    if (tip) {
      let content = "Tip of the Day: " + (tip.title || "") + "\n"

      // Format the tip content with proper indentation
      const formattedTipContent = formatDescription(tip.content)
      content += formattedTipContent

      setTipContent(content)

      // Update tip's last used date
      updateTip({
        ...tip,
        lastUsed: new Date().toISOString(),
      })
    }
  }

  // Add this helper function to get effective value for a property
  const getEffectiveValue = (event: any, property: string, day: string, dateString: string) => {
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

  /**
   * Get dates for an event within a specified range
   */
  const getEventDatesInRange = (event: any, startDate: Date, endDate: Date) => {
    const dates: Date[] = []
    // Create a new date to avoid modifying the original
    const currentDate = new Date(startDate.getTime())
    const lastDate = new Date(endDate.getTime())

    // Check each date in the range
    while (currentDate <= lastDate) {
      // Check if this event should be included for this date
      if (shouldIncludeEventForDate(event, currentDate)) {
        // Check if this event occurs on this day based on recurrence pattern
        if (shouldShowRecurringEvent(event, currentDate)) {
          // Clone the date to avoid reference issues
          dates.push(new Date(currentDate.getTime()))
        }
      }

      currentDate.setDate(currentDate.getDate() + 1)
    }

    return dates
  }

  /**
   * Get day of week string (monday, tuesday, etc.) from a date
   */
  const getDayOfWeek = (date: Date) => {
    const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    return days[date.getDay()]
  }

  /**
   * Group events by date
   */
  const groupEventsByDate = (events: any[], startDate: Date, endDate: Date) => {
    const eventsByDate: Record<string, any[]> = {}

    // Initialize all dates in the range
    const currentDate = new Date(startDate.getTime())
    while (currentDate <= endDate) {
      const dateStr = format(currentDate, "yyyy-MM-dd")
      eventsByDate[dateStr] = []
      // Move to next day
      currentDate.setDate(currentDate.getDate() + 1)
    }

    // Add events to their respective dates
    events.forEach((event) => {
      // Only get dates that are within our selected range
      const eventDates = getEventDatesInRange(event, startDate, endDate)

      eventDates.forEach((date) => {
        const dateStr = format(date, "yyyy-MM-dd")
        const dayOfWeek = getDayOfWeek(date)

        // Skip if this date is not in our initialized range
        if (!eventsByDate[dateStr]) {
          return
        }

        // Check if this event has a date override for this specific date
        const dateOverride = event.dateOverrides && event.dateOverrides[dateStr] ? event.dateOverrides[dateStr] : null

        // Check if this event has a variation for this day
        const variation = event.variations && event.variations[dayOfWeek] ? event.variations[dayOfWeek] : null

        // Create a copy of the event with the overrides applied
        const eventWithOverrides = {
          ...event,
          // Date overrides take precedence over day variations
          isAllDay:
            dateOverride && dateOverride.isAllDay !== undefined
              ? dateOverride.isAllDay
              : variation && variation.isAllDay !== undefined
                ? variation.isAllDay
                : event.isAllDay,
          startTime:
            dateOverride && dateOverride.startTime !== undefined
              ? dateOverride.startTime
              : variation && variation.startTime !== undefined
                ? variation.startTime
                : event.startTime,
          endTime:
            dateOverride && dateOverride.endTime !== undefined
              ? dateOverride && dateOverride.endTime !== undefined
              : variation && variation.endTime !== undefined
                ? variation.endTime
                : event.endTime,
          description:
            dateOverride && dateOverride.description !== undefined
              ? dateOverride.description
              : variation && variation.description !== undefined
                ? variation.description
                : event.description,
        }

        eventsByDate[dateStr].push(eventWithOverrides)
      })
    })

    return eventsByDate
  }

  // Add a new state for character count after the other state declarations
  const [characterCount, setCharacterCount] = useState(0)

  /**
   * Auto-resize textarea based on content
   */
  const autoResizeTextarea = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target
    textarea.style.height = "auto"
    textarea.style.height = `${textarea.scrollHeight}px`
  }

  /**
   * Handle copying email content to clipboard
   */
  const handleCopy = () => {
    // Combine header, agenda, and tip content for copying
    let fullContent = ""

    if (headerContent) {
      fullContent += headerContent + "\n\n"
    }

    fullContent += editedAgendaContent

    if (editedTipContent) {
      fullContent += "\n\n" + editedTipContent
    }

    navigator.clipboard.writeText(fullContent).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Add a useEffect to calculate character count whenever content changes
  useEffect(() => {
    // Calculate total character count from all content that will be copied
    let fullContent = ""

    if (headerContent) {
      fullContent += headerContent + "\n\n"
    }

    fullContent += editedAgendaContent

    if (editedTipContent) {
      fullContent += "\n\n" + editedTipContent
    }

    setCharacterCount(fullContent.length)
  }, [headerContent, editedAgendaContent, editedTipContent])

  // Add effect to resize textareas when their content changes
  useEffect(() => {
    const resizeTextareas = () => {
      const textareas = document.querySelectorAll("textarea")
      textareas.forEach((textarea) => {
        textarea.style.height = "auto"
        textarea.style.height = `${textarea.scrollHeight}px`
      })
    }

    // Resize on initial render and when content changes
    resizeTextareas()
  }, [headerContent, editedAgendaContent, editedTipContent])

  /**
   * Handle selecting a tip
   */
  const handleSelectTip = (tipId: string) => {
    if (tipId === selectedTip) {
      setSelectedTip(null)
      setTipContent("")
      setEditedTipContent("")
    } else {
      setSelectedTip(tipId)
    }
  }

  /**
   * Format the relative time for last used date
   */
  const formatLastUsed = (lastUsed: string | null) => {
    if (!lastUsed) return "Never used"

    const lastUsedDate = new Date(lastUsed)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - lastUsedDate.getTime())
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return "Used today"
    if (diffDays === 1) return "Used yesterday"
    return `Used ${diffDays} days ago`
  }

  /**
   * Handle changes to the agenda content textarea
   */
  const handleAgendaContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedAgendaContent(e.target.value)
  }

  /**
   * Handle changes to the tip content textarea
   */
  const handleTipContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedTipContent(e.target.value)
  }

  /**
   * Handle changes to the header content textarea
   */
  const handleHeaderChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setHeaderContent(e.target.value)
  }

  /**
   * Handle regenerate button click
   */
  const handleRegenerateAgenda = () => {
    generateAgendaContent()
    setEditedAgendaContent(agendaContent)
  }

  /**
   * Handle regenerate dialog confirmation
   */
  const handleRegenerateConfirm = () => {
    generateAgendaContent()
    setEditedAgendaContent(agendaContent)

    if (clearTipOnRegenerate) {
      setSelectedTip(null)
      setTipContent("")
      setEditedTipContent("")
    }

    setShowRegenerateDialog(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-6">
          {/* Date range selector */}
          <div className="space-y-2 mb-4">
            <DateRangeSelector value={dateRange} onChange={setDateRange} />
          </div>

          <div className="flex justify-between items-center mb-4">
            <div
              className={`text-sm ${
                characterCount > 3000
                  ? "text-destructive font-medium"
                  : characterCount > 2700
                    ? "text-amber-500 font-medium"
                    : "text-muted-foreground"
              }`}
            >
              {characterCount > 3000
                ? `Character limit exceeded: ${characterCount}/3000`
                : characterCount > 2700
                  ? `Approaching limit: ${characterCount}/3000`
                  : `Characters: ${characterCount}/3000`}
            </div>
            <Button onClick={handleCopy} className="flex items-center gap-1">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Finalize and Copy"}
            </Button>
          </div>
          {/* Optional header textarea */}
          <div className="space-y-2">
            <Label htmlFor="email-header">Header</Label>
            <Textarea
              id="email-header"
              value={headerContent}
              onChange={(e) => {
                handleHeaderChange(e)
                autoResizeTextarea(e)
              }}
              placeholder="Add an optional header for your email (e.g., greeting, introduction, etc.)"
              className="min-h-[100px] font-mono text-sm"
              onInput={autoResizeTextarea}
              ref={(el) => {
                if (el) {
                  el.style.height = "auto"
                  el.style.height = `${el.scrollHeight}px`
                }
              }}
            />
          </div>

          {/* Agenda content preview */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="agenda-content">Agenda</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateAgenda}
                  className="flex items-center gap-1"
                  title="Regenerate agenda"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="sr-only">Regenerate</span>
                </Button>
              </div>
            </div>
            <Textarea
              id="agenda-content"
              value={editedAgendaContent}
              onChange={(e) => {
                handleAgendaContentChange(e)
                autoResizeTextarea(e)
              }}
              className="min-h-[300px] font-mono text-sm"
              onInput={autoResizeTextarea}
              ref={(el) => {
                if (el) {
                  el.style.height = "auto"
                  el.style.height = `${el.scrollHeight}px`
                }
              }}
            />
          </div>

          {/* Tip content textarea */}
          <div className="space-y-2">
            <Label htmlFor="tip-content">Tip of the Day</Label>
            <Textarea
              id="tip-content"
              value={editedTipContent}
              onChange={(e) => {
                handleTipContentChange(e)
                autoResizeTextarea(e)
              }}
              placeholder="Select a tip below to include it here"
              className="min-h-[150px] font-mono text-sm"
              onInput={autoResizeTextarea}
              ref={(el) => {
                if (el) {
                  el.style.height = "auto"
                  el.style.height = `${el.scrollHeight}px`
                }
              }}
            />
          </div>

          {/* Tip selector */}
          <div className="space-y-4">
            <Label>Select a Tip</Label>

            {/* Tip search and filter */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Input
                  type="search"
                  placeholder="Search tips..."
                  value={tipSearchTerm}
                  onChange={(e) => setTipSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={tipFilterOption === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTipFilterOption("all")}
                  className="whitespace-nowrap"
                >
                  All Tips
                </Button>
                <Button
                  variant={tipFilterOption === "used" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTipFilterOption("used")}
                  className="whitespace-nowrap"
                >
                  Used
                </Button>
                <Button
                  variant={tipFilterOption === "unused" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTipFilterOption("unused")}
                  className="whitespace-nowrap"
                >
                  Unused
                </Button>
              </div>
            </div>

            {sortedTips.length > 0 && (
              <div className="text-sm text-muted-foreground">
                Showing {sortedTips.length} of {tips.length} tips
              </div>
            )}

            {/* Tips list */}
            <div className="rounded-md border">
              <div className="p-4 space-y-2">
                {sortedTips.map((tip) => (
                  <Card
                    key={tip.id}
                    className={`cursor-pointer transition-colors ${
                      selectedTip === tip.id ? "border-primary bg-primary/5" : ""
                    }`}
                    onClick={() => handleSelectTip(tip.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div className="text-sm font-medium">
                          {selectedTip === tip.id && (
                            <Badge variant="outline" className="mb-2">
                              Selected
                            </Badge>
                          )}
                          {tip.title}
                        </div>
                        <div className="text-xs text-muted-foreground">{formatLastUsed(tip.lastUsed)}</div>
                      </div>
                      <div className="whitespace-pre-wrap break-words text-sm">{tip.content}</div>
                    </CardContent>
                  </Card>
                ))}
                {sortedTips.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    {tips.length === 0 ? "No tips available." : `No tips found matching your criteria.`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Regenerate Dialog */}
      <AlertDialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate Agenda?</AlertDialogTitle>
            <AlertDialogDescription>
              The date range has changed. Would you like to regenerate the agenda content?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex items-center space-x-2 py-4">
            <Checkbox
              id="clear-tip"
              checked={clearTipOnRegenerate}
              onCheckedChange={(checked) => setClearTipOnRegenerate(!!checked)}
            />
            <Label htmlFor="clear-tip">Also clear the tip of the day</Label>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep Current Content</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerateConfirm}>Regenerate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default EmailGenerator

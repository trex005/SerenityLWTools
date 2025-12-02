/**
 * Event Card Component
 *
 * This component displays a single event as a card with edit and delete options.
 * It's used in the DayAgenda component to display events.
 */
"use client"

import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Edit, Trash2, Archive, X, Clock, Mail, Globe } from "lucide-react"
import { useEvents } from "@/hooks/use-events"
import { useState, type MouseEvent, useRef, useEffect } from "react"
import { EventDialog } from "@/components/event-dialog"
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
import { formatRecurrence } from "@/lib/recurrence-utils"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import type { DiffInfo } from "@/lib/config-diff"
import { formatInAppTimezone } from "@/lib/date-utils"

// Update the EventCardProps interface to include showLocalTime
interface EventCardProps {
  event: any // The event to display
  day: string // The current day (for showing day-specific variations)
  date: Date // The specific date being displayed
  showLocalTime?: boolean
  overrideInfo?: DiffInfo
}

// Update the function signature to include the new prop
export function EventCard({ event, day, date, showLocalTime = false, overrideInfo }: EventCardProps) {
  // State for dialogs
  const [editDialogOpen, setEditDialogOpen] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  // State for inline time editing
  const [isEditingTime, setIsEditingTime] = useState(false)
  const [editStartHour, setEditStartHour] = useState("09")
  const [editStartMinute, setEditStartMinute] = useState("00")
  const [editEndHour, setEditEndHour] = useState("10")
  const [editEndMinute, setEditEndMinute] = useState("00")
  const [hasEndTime, setHasEndTime] = useState(false)

  // Ref for the time editor container to handle outside clicks
  const timeEditorRef = useRef<HTMLDivElement>(null)

  // Get delete function from store
  // Add access to the updateDateIncludeOverride function from the store
  const { deleteEvent, archiveEvent, updateDateOverride, updateDateIncludeOverride } = useEvents()

  // Get timezone preferences
  // Remove: const { useLocalTimeZone, convertToLocalTime, formatTimeDisplay, convertToServerTime } = useTimeZone()

  // Standard order of days for sorting
  const dayOrder = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

  // Format the date as YYYY-MM-DD for use with dateOverrides
  const dateString = formatInAppTimezone(date, "yyyy-MM-dd")

  // Check if there's a date override for this specific date
  const hasDateOverride = event.dateOverrides && event.dateOverrides[dateString]

  const hasDateIncludeOverride = event.dateIncludeOverrides && event.dateIncludeOverrides[dateString] !== undefined

  const overrideKeys = overrideInfo?.overrideKeys ?? []
  const hasOverrides = overrideKeys.length > 0

  /**
   * Helper function to get the effective value for a property
   * Takes into account date-specific overrides first, then day-specific variations
   */
  const getEffectiveValue = (property: string) => {
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

  // Get effective values for this day/date
  const isAllDay = getEffectiveValue("isAllDay")
  const startTime = getEffectiveValue("startTime")
  const endTime = getEffectiveValue("endTime")
  const description = getEffectiveValue("description")

  // Initialize time editor values when editing starts
  useEffect(() => {
    if (isEditingTime && startTime) {
      const [hour, minute] = startTime.split(":")
      setEditStartHour(hour)
      setEditStartMinute(minute)

      if (endTime) {
        const [endHour, endMinute] = endTime.split(":")
        setEditEndHour(endHour)
        setEditEndMinute(endMinute)
        setHasEndTime(true)
      } else {
        setHasEndTime(false)
      }
    }
  }, [isEditingTime, startTime, endTime])

  // Handle clicks outside the time editor
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      // Don't close if clicking on a Select component or its dropdown
      const target = event.target as HTMLElement
      if (target.closest('[role="combobox"]') || target.closest('[role="listbox"]')) {
        return
      }

      if (timeEditorRef.current && !timeEditorRef.current.contains(target)) {
        setIsEditingTime(false)
      }
    }

    // Add event listener when editing
    if (isEditingTime) {
      document.addEventListener("mousedown", handleClickOutside as any)
    }

    // Clean up
    return () => {
      document.removeEventListener("mousedown", handleClickOutside as any)
    }
  }, [isEditingTime])

  /**
   * Helper function to check if the event is scheduled for the current day/date
   */
  const isScheduledForDate = () => {
    // First check for date-specific override
    if (event.dateIncludeOverrides && event.dateIncludeOverrides[dateString] !== undefined) {
      return event.dateIncludeOverrides[dateString]
    }

    // Then check global setting
    if (typeof event.includeInExport === "boolean") {
      return event.includeInExport
    } else if (typeof event.includeInExport === "object" && event.includeInExport !== null) {
      // Check if this specific day is set to true, or if any day is true
      return event.includeInExport[day] === true || Object.values(event.includeInExport).some((value) => value === true)
    }
    return false
  }

  /**
   * Helper function to check if the event is included on the website for the current day/date
   */
  const isIncludedOnWebsite = () => {
    if (event.includeOnWebsite === false) {
      return false
    }
    return isScheduledForDate()
  }

  /**
   * Helper to check if the event is included in the briefing for this day/date
   */
  const isIncludedInBriefing = () => {
    if (event.includeInBriefing === false) {
      return false
    }
    return isScheduledForDate()
  }

  /**
   * Function to handle edit button click
   * Opens the edit dialog
   */
  const handleEditClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    console.log("Edit button clicked for event:", event.id)
    setEditDialogOpen(true)
  }

  /**
   * Function to handle delete button click
   * Opens the delete confirmation dialog or deletes directly if shift key is pressed
   */
  const handleDeleteClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    console.log("Delete button clicked for event:", event.id)

    // If shift key is pressed, delete without confirmation
    if (e.shiftKey) {
      deleteEvent(event.id)
    } else {
      setDeleteDialogOpen(true)
    }
  }

  /**
   * Function to handle delete confirmation
   * Deletes the event and closes the dialog
   */
  const confirmDelete = () => {
    console.log("Deleting event:", event.id)
    deleteEvent(event.id)
    setDeleteDialogOpen(false)
  }

  /**
   * Function to handle archive button click
   * Archives the event
   */
  const handleArchiveClick = (e: MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    console.log("Archive button clicked for event:", event.id)
    archiveEvent(event.id)
  }

  /**
   * Function to handle time click
   * Opens the inline time editor
   */
  const handleTimeClick = (e: MouseEvent) => {
    if (isAllDay) return // Don't allow editing time for all-day events

    e.preventDefault()
    e.stopPropagation()
    setIsEditingTime(true)
  }

  /**
   * Function to save time changes
   * Updates the date override for this specific date
   */
  const saveTimeChanges = () => {
    const newStartTime = `${editStartHour}:${editStartMinute}`
    const newEndTime = hasEndTime ? `${editEndHour}:${editEndMinute}` : ""

    // Convert times to server time if we're in local time mode
    const startTimeToSave = newStartTime
    const endTimeToSave = hasEndTime ? newEndTime : ""

    // Create or update the date override
    updateDateOverride(event.id, dateString, {
      startTime: startTimeToSave,
      endTime: endTimeToSave,
    })

    setIsEditingTime(false)
  }

  /**
   * Function to cancel time editing
   */
  const cancelTimeEditing = () => {
    setIsEditingTime(false)
  }

  /**
   * Function to remove date override
   */
  const removeDateOverride = () => {
    updateDateOverride(event.id, dateString, null)
    setIsEditingTime(false)
  }


  // Generate hour and minute options for the dropdowns
  const hourOptions = Array.from({ length: 24 }, (_, i) => {
    const hour = i.toString().padStart(2, "0")
    return { value: hour, label: hour }
  })

  const minuteOptions = Array.from({ length: 12 }, (_, i) => {
    const minute = (i * 5).toString().padStart(2, "0")
    return { value: minute, label: minute }
  })

  // Add a new function to handle toggling include in export for this specific date
  /**
   * Function to handle toggling whether to include this event in export for this specific date
   */
  const handleIncludeInExportToggle = (checked: boolean) => {
    updateDateIncludeOverride(event.id, dateString, checked)
  }

  // Add a function to convert and format time to local time
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

  return (
    <>
      {/* Event Card */}
      <Card className={`relative ${hasDateOverride ? "border-primary" : ""}`}>
        <CardContent className="p-4">
          <div className="flex items-start">
            <div className="flex-1">
              <div className="flex justify-between items-start">
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-medium">{event.title}</h4>
                    {hasOverrides && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Badge className="text-muted-foreground border-border bg-muted/60 dark:bg-muted/40">
                              Overridden
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-xs">
                              Overridden fields:{" "}
                              {overrideKeys.length ? overrideKeys.join(", ") : "multiple properties"}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <Globe
                      size={14}
                      className={`text-muted-foreground ${isIncludedOnWebsite() ? "opacity-100" : "opacity-20"}`}
                      title={isIncludedOnWebsite() ? "Included on website" : "Hidden from website"}
                    />
                    <Mail
                      size={14}
                      className={`text-muted-foreground ${isIncludedInBriefing() ? "opacity-100" : "opacity-20"}`}
                      title={isIncludedInBriefing() ? "Included in briefing" : "Excluded from briefing"}
                    />
                    {hasDateOverride && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Clock size={14} className="text-primary" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>This event has a date-specific override</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                    <div className="flex items-center gap-2 ml-1">
                      <Switch
                        id={`include-export-${event.id}`}
                        checked={isScheduledForDate()}
                        onCheckedChange={handleIncludeInExportToggle}
                        className="mt-[-2px] data-[state=checked]:bg-primary/40"
                      />
                      <Label htmlFor={`include-export-${event.id}`} className="text-xs text-muted-foreground">
                        Scheduled
                      </Label>
                    </div>
                  </div>
                  {!isAllDay && startTime && (
                    <div className="text-sm text-muted-foreground relative">
                      {isEditingTime ? (
                        <div
                          ref={timeEditorRef}
                          className="absolute z-50 bg-card border rounded-md p-3 shadow-md -ml-2 mt-1 w-[280px]"
                        >
                          <div className="flex justify-between items-center mb-2">
                            <h4 className="text-sm font-medium">
                              Edit Time for {formatInAppTimezone(date, "MMM d, yyyy")}
                            </h4>
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={cancelTimeEditing}>
                              <X size={14} />
                            </Button>
                          </div>

                          <div className="space-y-3">
                            <div>
                              <label className="text-xs text-muted-foreground mb-1 block">Start Time</label>
                              <div className="flex gap-2 items-center">
                                <Select value={editStartHour} onValueChange={setEditStartHour}>
                                  <SelectTrigger className="w-[70px]">
                                    <SelectValue placeholder="Hour" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {hourOptions.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                <span>:</span>
                                <Select value={editStartMinute} onValueChange={setEditStartMinute}>
                                  <SelectTrigger className="w-[70px]">
                                    <SelectValue placeholder="Minute" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {minuteOptions.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>
                                        {option.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 mb-2">
                              <input
                                type="checkbox"
                                id={`has-end-time-${event.id}`}
                                checked={hasEndTime}
                                onChange={(e) => setHasEndTime(e.target.checked)}
                                className="rounded border-gray-300"
                              />
                              <label htmlFor={`has-end-time-${event.id}`} className="text-xs">
                                Include end time
                              </label>
                            </div>

                            {hasEndTime && (
                              <div>
                                <label className="text-xs text-muted-foreground mb-1 block">End Time</label>
                                <div className="flex gap-2 items-center">
                                  <Select value={editEndHour} onValueChange={setEditEndHour}>
                                    <SelectTrigger className="w-[70px]">
                                      <SelectValue placeholder="Hour" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {hourOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                  <span>:</span>
                                  <Select value={editEndMinute} onValueChange={setEditEndMinute}>
                                    <SelectTrigger className="w-[70px]">
                                      <SelectValue placeholder="Minute" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {minuteOptions.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                          {option.label}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                              </div>
                            )}

                            <div className="flex justify-between mt-3">
                              {hasDateOverride && (
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={removeDateOverride}
                                  className="text-xs h-8"
                                >
                                  Remove Override
                                </Button>
                              )}
                              <div className={hasDateOverride ? "" : "ml-auto"}>
                                <Button variant="default" size="sm" onClick={saveTimeChanges} className="text-xs h-8">
                                  Save
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1">
                          <span
                            className="cursor-pointer hover:underline inline-flex items-center gap-1 group"
                            onClick={handleTimeClick}
                          >
                            {startTime}
                            {endTime ? ` - ${endTime}` : ""}
                            <Clock size={12} className="opacity-0 group-hover:opacity-100 transition-opacity" />
                          </span>
                          {showLocalTime && (
                            <span className="text-xs text-muted-foreground/60">
                              ({formatLocalTime(startTime)}
                              {endTime ? ` - ${formatLocalTime(endTime)}` : ""})
                            </span>
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-1 relative z-20">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleEditClick}
                    aria-label="Edit event"
                    type="button"
                    className="event-card_button relative z-20"
                  >
                    <Edit size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleArchiveClick}
                    aria-label="Archive event"
                    type="button"
                    className="event-card_button relative z-20"
                  >
                    <Archive size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={handleDeleteClick}
                    aria-label="Delete event"
                    type="button"
                    className="event-card_button relative z-20 text-destructive hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>

              {/* Event Description */}
              {description && <p className="text-sm mt-2 text-muted-foreground whitespace-pre-line">{description}</p>}

              {/* Recurrence Information */}
              {formatRecurrence(event) && (
                <div className="text-xs text-primary/70 mt-1 flex items-center">
                  <span className="mr-1">↻</span> {formatRecurrence(event)}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit Dialog */}
      <EventDialog
        event={event}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        initialDay={day}
        initialDate={date}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Event</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{event.title}&quot;? This action cannot be undone.
              <br />
              <br />
              <span className="text-sm italic">
                Tip: To skip this confirmation in the future, hold the Shift key while clicking the delete icon.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

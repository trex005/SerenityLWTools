/**
 * Recurrence Editor Component
 *
 * This component provides a UI for configuring event recurrence patterns
 * and selecting which days of the week an event occurs on.
 */
"use client"

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { Calendar } from "@/components/ui/calendar"
import { Button } from "@/components/ui/button"
import { CalendarIcon } from "lucide-react"
import { format } from "date-fns"
import { useState } from "react"
import { CustomNumberInput } from "./custom-number-input"

// Define the RecurrenceData type for the new structure
export interface RecurrenceData {
  type: "days" | "weeks" | "none"
  onPeriods: number
  offPeriods: number
  daysOfWeek: string[] // Required for weekday filtering
  startDate: string // Always required for new system
}

interface RecurrenceEditorProps {
  value: RecurrenceData | null | undefined
  onChange: (value: RecurrenceData) => void
  isNewEvent?: boolean // true for new events, false/undefined for existing events
}

// Convert legacy recurrence format to new format for UI
function convertLegacyToNew(legacyValue: any, isNewEvent: boolean = false): RecurrenceData {
  // Default start date: today for new events, 2025-01-05 for existing events without a start date
  const defaultStartDate = isNewEvent ? new Date().toISOString() : new Date(2025, 0, 5).toISOString()

  // If it's already in new format, return as is
  if (legacyValue && (legacyValue.onPeriods !== undefined || legacyValue.offPeriods !== undefined)) {
    return {
      type: legacyValue.type || "days",
      onPeriods: legacyValue.onPeriods ?? 1,
      offPeriods: legacyValue.offPeriods ?? 0,
      daysOfWeek: legacyValue.daysOfWeek || ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      startDate: legacyValue.startDate || defaultStartDate,
    }
  }

  // Convert legacy format
  if (legacyValue) {
    let type: "days" | "weeks" | "none" = "none"
    let onPeriods = 1
    let offPeriods = 0
    let startDate = defaultStartDate

    // Handle legacy types
    if (legacyValue.type === "daily") {
      type = "days"
      onPeriods = 1
      offPeriods = Math.max(0, (legacyValue.interval || 1) - 1)
    } else if (legacyValue.type === "weekly") {
      type = "weeks"
      onPeriods = 1
      offPeriods = Math.max(0, (legacyValue.interval || 1) - 1)
    } else if (legacyValue.type === "custom" && legacyValue.pattern) {
      type = "weeks"
      onPeriods = legacyValue.pattern.onWeeks || 1
      offPeriods = legacyValue.pattern.offWeeks || 0
      if (legacyValue.pattern.phaseStartDate) {
        startDate = legacyValue.pattern.phaseStartDate
      }
    } else if (legacyValue.type === "none") {
      type = "none"
    }

    // Get start date (priority: explicit startDate > pattern.phaseStartDate > default)
    if (legacyValue.startDate) {
      startDate = legacyValue.startDate
    }

    return {
      type,
      onPeriods,
      offPeriods,
      daysOfWeek: legacyValue.daysOfWeek || ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      startDate,
    }
  }

  // Default new format - use today for new events
  return {
    type: "days",
    onPeriods: 1,
    offPeriods: 0,
    daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    startDate: isNewEvent ? new Date().toISOString() : defaultStartDate,
  }
}

export function RecurrenceEditor({ value, onChange, isNewEvent = false }: RecurrenceEditorProps) {
  // State to control popover open state
  const [datePickerOpen, setDatePickerOpen] = useState(false)

  // Convert legacy format to new format for display
  const recurrence: RecurrenceData = convertLegacyToNew(value, isNewEvent)

  if (!recurrence.daysOfWeek || recurrence.daysOfWeek.length === 0) {
    recurrence.daysOfWeek = ["monday"] // Ensure daysOfWeek is never empty
  }

  // Days of the week for selection
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

  // Handle recurrence type change
  const handleTypeChange = (type: "days" | "weeks" | "none") => {
    // Create a new recurrence object with the updated type
    const newRecurrence: RecurrenceData = {
      ...recurrence,
      type,
      daysOfWeek: [...recurrence.daysOfWeek], // Preserve selected days by default
    }

    // Set default values based on type
    if (type === "none") {
      newRecurrence.onPeriods = 1
      newRecurrence.offPeriods = 0
      // For none, keep the existing days
      if (newRecurrence.daysOfWeek.length === 0) {
        newRecurrence.daysOfWeek = ["monday"]
      }
    } else if (type === "days") {
      newRecurrence.onPeriods = newRecurrence.onPeriods || 1
      newRecurrence.offPeriods = newRecurrence.offPeriods || 0
      // For daily recurrence, automatically select all days
      newRecurrence.daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    } else if (type === "weeks") {
      newRecurrence.onPeriods = newRecurrence.onPeriods || 1
      newRecurrence.offPeriods = newRecurrence.offPeriods || 0
      // For weekly, keep the existing days or default to Monday if none
      if (newRecurrence.daysOfWeek.length === 0) {
        newRecurrence.daysOfWeek = ["monday"]
      }
    }

    onChange(newRecurrence)
  }

  // Handle on periods change
  const handleOnPeriodsChange = (onPeriods: number) => {
    onChange({
      ...recurrence,
      onPeriods,
      daysOfWeek: [...recurrence.daysOfWeek],
    })
  }

  // Handle off periods change
  const handleOffPeriodsChange = (offPeriods: number) => {
    onChange({
      ...recurrence,
      offPeriods,
      daysOfWeek: [...recurrence.daysOfWeek],
    })
  }

  // Handle day of week toggle
  const handleDayToggle = (day: string, checked: boolean) => {
    const currentDays = [...recurrence.daysOfWeek]
    let newDays: string[]

    if (checked) {
      // Add the day if it's not already included
      newDays = currentDays.includes(day) ? currentDays : [...currentDays, day]
    } else {
      // Remove the day
      newDays = currentDays.filter((d) => d !== day)
      // Ensure at least one day is selected
      if (newDays.length === 0) {
        return // Don't update if it would result in no days selected
      }
    }

    onChange({
      ...recurrence,
      daysOfWeek: newDays,
    })
  }

  // Handle start date change
  const handleStartDateChange = (date: Date | undefined) => {
    if (!date) return

    try {
      const newRecurrence = {
        ...recurrence,
        startDate: date.toISOString(),
        daysOfWeek: [...recurrence.daysOfWeek],
      }
      onChange(newRecurrence)
    } catch (error) {
      console.error("Error updating start date:", error)
    }
  }

  // Safely format a date string
  const formatDateSafe = (dateString: string | undefined) => {
    if (!dateString) return "Pick a date"
    try {
      return format(new Date(dateString), "PPP")
    } catch (error) {
      console.error("Error formatting date:", error)
      return "Invalid date"
    }
  }

  // Helper function to create a simple date picker
  const renderDatePicker = () => {
    return (
      <div className="space-y-2">
        <Label>Start Date</Label>
        <div className="flex items-center gap-2">
          <div className="relative w-full">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start text-left font-normal"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setDatePickerOpen(!datePickerOpen)
              }}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {recurrence.startDate ? formatDateSafe(recurrence.startDate) : "Pick a date"}
            </Button>

            {datePickerOpen && (
              <div
                className="absolute z-50 mt-1 bg-popover border rounded-md shadow-md p-3"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Calendar
                  mode="single"
                  selected={recurrence.startDate ? new Date(recurrence.startDate) : undefined}
                  onSelect={(date) => {
                    handleStartDateChange(date)
                    setDatePickerOpen(false)
                  }}
                  initialFocus
                  className="rounded-md border"
                />
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          This date controls when the schedule pattern begins. All schedule calculations are based on day offsets from this date.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Recurrence Type Selection */}
      <div className="space-y-2">
        <Label className="font-medium">Type</Label>
        <RadioGroup
          value={recurrence.type}
          onValueChange={(value) => handleTypeChange(value as "days" | "weeks" | "none")}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="none" id="r-none" />
            <Label htmlFor="r-none">None</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="days" id="r-days" />
            <Label htmlFor="r-days">Days</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="weeks" id="r-weeks" />
            <Label htmlFor="r-weeks">Weeks</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Period Configuration */}
      {recurrence.type !== "none" && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="on-periods">{recurrence.type === "days" ? "Days on" : "Weeks on"}</Label>
              <CustomNumberInput 
                value={recurrence.onPeriods} 
                onChange={handleOnPeriodsChange} 
                min={1} 
                max={99} 
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="off-periods">{recurrence.type === "days" ? "Days off" : "Weeks off"}</Label>
              <CustomNumberInput 
                value={recurrence.offPeriods} 
                onChange={handleOffPeriodsChange} 
                min={0} 
                max={99} 
              />
            </div>
          </div>

          {/* Days of Week Selection */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="font-medium">Days of the week:</Label>
              <div className="text-xs text-muted-foreground">(at least one day must be selected)</div>
            </div>
            <div className="flex flex-wrap gap-2">
              {days.map((day) => (
                <div key={day} className="flex items-center space-x-2">
                  <Checkbox
                    id={`day-${day}`}
                    checked={recurrence.daysOfWeek.includes(day)}
                    onCheckedChange={(checked) => handleDayToggle(day, !!checked)}
                  />
                  <Label htmlFor={`day-${day}`} className="capitalize">
                    {day}
                  </Label>
                </div>
              ))}
            </div>
          </div>

          {/* Start Date */}
          {renderDatePicker()}
        </div>
      )}
    </div>
  )
}

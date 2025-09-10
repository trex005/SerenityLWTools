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

// Define the RecurrenceData type for better type safety
export interface RecurrenceData {
  type: "none" | "daily" | "weekly" | "custom"
  interval?: number
  daysOfWeek: string[] // Now required
  startDate?: string // Add start date for controlling which phase of the pattern
  pattern?: {
    onWeeks: number
    offWeeks: number
    phaseStartDate: string
  }
}

interface RecurrenceEditorProps {
  value: RecurrenceData | null | undefined
  onChange: (value: RecurrenceData) => void
}

export function RecurrenceEditor({ value, onChange }: RecurrenceEditorProps) {
  // State to control popover open state
  const [dailyDatePickerOpen, setDailyDatePickerOpen] = useState(false)
  const [weeklyDatePickerOpen, setWeeklyDatePickerOpen] = useState(false)
  const [customDatePickerOpen, setCustomDatePickerOpen] = useState(false)

  // Ensure we have a valid value object with daysOfWeek
  const recurrence: RecurrenceData = value || {
    type: "daily", // Default to daily instead of none
    daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"], // Default to all days
    interval: 1,
  }

  if (!recurrence.daysOfWeek || recurrence.daysOfWeek.length === 0) {
    recurrence.daysOfWeek = ["monday"] // Ensure daysOfWeek is never empty
  }

  // Days of the week for selection
  const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

  // Handle recurrence type change
  const handleTypeChange = (type: "none" | "daily" | "weekly" | "custom") => {
    // Create a new recurrence object with the updated type
    const newRecurrence: RecurrenceData = {
      ...recurrence,
      type,
      daysOfWeek: [...recurrence.daysOfWeek], // Preserve selected days by default
    }

    // Set default values based on type
    if (type === "none") {
      // For none, keep the existing days
      if (newRecurrence.daysOfWeek.length === 0) {
        newRecurrence.daysOfWeek = ["monday"]
      }
    } else if (type === "daily") {
      newRecurrence.interval = newRecurrence.interval || 1
      // For daily recurrence, automatically select all days
      newRecurrence.daysOfWeek = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]
    } else if (type === "weekly") {
      newRecurrence.interval = newRecurrence.interval || 1
      // For weekly, keep the existing days or default to Monday if none
      if (newRecurrence.daysOfWeek.length === 0) {
        newRecurrence.daysOfWeek = ["monday"]
      }
    } else if (type === "custom") {
      if (!newRecurrence.pattern) {
        newRecurrence.pattern = {
          onWeeks: 1,
          offWeeks: 1,
          phaseStartDate: new Date().toISOString(),
        }
      }
    }

    onChange(newRecurrence)
  }

  // Handle interval change
  const handleIntervalChange = (interval: number) => {
    onChange({
      ...recurrence,
      interval,
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

  // Handle pattern change for custom recurrence
  const handlePatternChange = (field: keyof RecurrenceData["pattern"], value: any) => {
    if (!recurrence.pattern) return

    const newPattern = { ...recurrence.pattern, [field]: value }
    onChange({
      ...recurrence,
      pattern: newPattern,
      daysOfWeek: [...recurrence.daysOfWeek],
    })
  }

  // Handle start date change for daily/weekly recurrence
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

  // Handle phase start date change for custom recurrence
  const handlePhaseStartDateChange = (date: Date | undefined) => {
    if (!date || !recurrence.pattern) return

    try {
      const newPattern = { ...recurrence.pattern, phaseStartDate: date.toISOString() }
      onChange({
        ...recurrence,
        pattern: newPattern,
        daysOfWeek: [...recurrence.daysOfWeek],
      })
    } catch (error) {
      console.error("Error updating phase start date:", error)
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
  const renderDatePicker = (
    dateValue: string | undefined,
    onDateChange: (date: Date | undefined) => void,
    isOpen: boolean,
    setIsOpen: (open: boolean) => void,
    label: string,
  ) => {
    return (
      <div className="space-y-2">
        <Label>{label}</Label>
        <div className="flex items-center gap-2">
          <div className="relative w-full">
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start text-left font-normal"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setIsOpen(!isOpen)
              }}
            >
              <CalendarIcon className="mr-2 h-4 w-4" />
              {dateValue ? formatDateSafe(dateValue) : "Pick a date"}
            </Button>

            {isOpen && (
              <div
                className="absolute z-50 mt-1 bg-popover border rounded-md shadow-md p-3"
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
              >
                <Calendar
                  mode="single"
                  selected={dateValue ? new Date(dateValue) : undefined}
                  onSelect={(date) => {
                    onDateChange(date)
                    setIsOpen(false)
                  }}
                  initialFocus
                  className="rounded-md border"
                />
              </div>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          This date controls which days in the pattern this event appears on. Events with the same interval but
          different start dates will appear on alternating days.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Recurrence Type Selection */}
      <div className="space-y-2">
        <Label className="font-medium">Recurrence Pattern</Label>
        <RadioGroup
          value={recurrence.type}
          onValueChange={(value) => handleTypeChange(value as "none" | "daily" | "weekly" | "custom")}
        >
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="none" id="r-none" />
            <Label htmlFor="r-none">None</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="daily" id="r-daily" />
            <Label htmlFor="r-daily">Daily</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="weekly" id="r-weekly" />
            <Label htmlFor="r-weekly">Weekly</Label>
          </div>
          <div className="flex items-center space-x-2">
            <RadioGroupItem value="custom" id="r-custom" />
            <Label htmlFor="r-custom">Custom pattern</Label>
          </div>
        </RadioGroup>
      </div>

      {/* Daily Recurrence Options */}
      {recurrence.type === "daily" && (
        <div className="pl-6 space-y-4">
          <div className="flex items-center space-x-2">
            <Label htmlFor="daily-interval">Every</Label>
            <CustomNumberInput value={recurrence.interval || 1} onChange={handleIntervalChange} min={1} max={99} />
            <span>day(s)</span>
          </div>

          {/* Add start date for daily recurrence when interval > 1 */}
          {recurrence.interval &&
            recurrence.interval > 1 &&
            renderDatePicker(
              recurrence.startDate,
              handleStartDateChange,
              dailyDatePickerOpen,
              setDailyDatePickerOpen,
              "Pattern start date",
            )}
        </div>
      )}

      {/* Weekly Recurrence Options */}
      {recurrence.type === "weekly" && (
        <div className="pl-6 space-y-4">
          <div className="flex items-center space-x-2">
            <Label htmlFor="weekly-interval">Every</Label>
            <CustomNumberInput value={recurrence.interval || 1} onChange={handleIntervalChange} min={1} max={99} />
            <span>week(s)</span>
          </div>

          {/* Days of Week Selection - Only visible for Weekly recurrence */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="font-medium">On these days:</Label>
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

          {/* Add start date for weekly recurrence when interval > 1 */}
          {recurrence.interval &&
            recurrence.interval > 1 &&
            renderDatePicker(
              recurrence.startDate,
              handleStartDateChange,
              weeklyDatePickerOpen,
              setWeeklyDatePickerOpen,
              "Pattern start date",
            )}
        </div>
      )}

      {/* Custom Pattern Options */}
      {recurrence.type === "custom" && (
        <div className="pl-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="on-weeks">Weeks on</Label>
              <CustomNumberInput
                value={recurrence.pattern?.onWeeks || 1}
                onChange={(value) => handlePatternChange("onWeeks", value)}
                min={1}
                max={99}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="off-weeks">Weeks off</Label>
              <CustomNumberInput
                value={recurrence.pattern?.offWeeks || 1}
                onChange={(value) => handlePatternChange("offWeeks", value)}
                min={1}
                max={99}
              />
            </div>
          </div>

          {/* Custom pattern date picker */}
          {renderDatePicker(
            recurrence.pattern?.phaseStartDate,
            handlePhaseStartDateChange,
            customDatePickerOpen,
            setCustomDatePickerOpen,
            "Pattern start date",
          )}
        </div>
      )}
    </div>
  )
}

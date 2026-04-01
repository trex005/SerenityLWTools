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
import { differenceInDays, parseISO } from "date-fns"
import { formatInAppTimezone, getStartOfAppDay } from "@/lib/date-utils"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { CustomNumberInput } from "./custom-number-input"
import type { TagConfig } from "@/lib/recurrence-utils"
import { resolveRecurrenceDate } from "@/lib/recurrence-utils"

// Define the RecurrenceData type for the new structure
export interface RecurrenceData {
  type: "days" | "weeks" | "none"
  startTag: string
  startOffset: number
  endOffset?: number
  onPeriods: number
  offPeriods: number
  daysOfWeek: string[]
}

interface RecurrenceEditorProps {
  value: RecurrenceData | null | undefined
  onChange: (value: RecurrenceData) => void
  isNewEvent?: boolean
  tagConfig: TagConfig
  activeTag: string
}

/** Convert a stored RecurrenceData offset back to a calendar date string for display. */
const offsetToDateStr = (
  startTag: string,
  offset: number,
  tagConfig: TagConfig,
): string => {
  try {
    const d = resolveRecurrenceDate(startTag, offset, tagConfig)
    return formatInAppTimezone(d, "yyyy-MM-dd")
  } catch {
    return formatInAppTimezone(new Date(), "yyyy-MM-dd")
  }
}

/** Compute startOffset from a picked calendar date relative to activeTag's startDate. */
const dateStrToOffset = (dateStr: string, activeTag: string, tagConfig: TagConfig): number => {
  const tagStartDateStr = tagConfig?.tags?.[activeTag]?.startDate
  if (!tagStartDateStr) return 0
  return differenceInDays(
    getStartOfAppDay(parseISO(dateStr)),
    getStartOfAppDay(parseISO(tagStartDateStr)),
  )
}

export function RecurrenceEditor({
  value,
  onChange,
  isNewEvent = false,
  tagConfig,
  activeTag,
}: RecurrenceEditorProps) {
  const recurrence: RecurrenceData = value ?? {
    type: "days",
    startTag: activeTag,
    startOffset: 0,
    onPeriods: 1,
    offPeriods: 0,
    daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
  }

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

  const handleStartDateChange = (pickedDateStr: string | undefined) => {
    if (!pickedDateStr) return
    const newOffset = dateStrToOffset(pickedDateStr, activeTag, tagConfig)
    let endOffset = recurrence.endOffset
    if (endOffset !== undefined && endOffset < newOffset) {
      endOffset = newOffset
    }
    onChange({
      ...recurrence,
      startTag: activeTag,
      startOffset: newOffset,
      endOffset,
      daysOfWeek: [...recurrence.daysOfWeek],
    })
  }

  const handleEndDateChange = (pickedDateStr: string | undefined) => {
    if (!pickedDateStr) return
    const newEndOffset = dateStrToOffset(pickedDateStr, activeTag, tagConfig)
    const effectiveEnd = newEndOffset < recurrence.startOffset ? recurrence.startOffset : newEndOffset
    onChange({
      ...recurrence,
      startTag: activeTag,
      endOffset: effectiveEnd,
      daysOfWeek: [...recurrence.daysOfWeek],
    })
  }

  const handleClearEndDate = () => {
    onChange({
      ...recurrence,
      endOffset: undefined,
      daysOfWeek: [...recurrence.daysOfWeek],
    })
  }

  // Helper function to create a simple date picker
  const renderStartDatePicker = () => {
    const displayDate = offsetToDateStr(recurrence.startTag, recurrence.startOffset, tagConfig)
    return (
      <div className="space-y-2">
        <Label htmlFor="start-date">Start Date</Label>
        <Input
          id="start-date"
          type="date"
          value={displayDate}
          onChange={(e) => handleStartDateChange(e.target.value)}
          className="w-[240px]"
        />
        <p className="text-xs text-muted-foreground">
          This date controls when the schedule pattern begins.
        </p>
      </div>
    )
  }

  const renderEndDatePicker = () => {
    const displayEndDate = recurrence.endOffset !== undefined
      ? offsetToDateStr(recurrence.startTag, recurrence.endOffset, tagConfig)
      : ""
    const displayStartDate = offsetToDateStr(recurrence.startTag, recurrence.startOffset, tagConfig)
    return (
      <div className="space-y-2">
        <Label htmlFor="end-date">End Date (optional)</Label>
        <div className="flex items-center gap-2">
          <Input
            id="end-date"
            type="date"
            value={displayEndDate}
            min={displayStartDate || undefined}
            onChange={(e) => handleEndDateChange(e.target.value)}
            className="w-[240px]"
          />
          {recurrence.endOffset !== undefined && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                handleClearEndDate()
              }}
            >
              Clear
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Leave blank to continue indefinitely; the end date is inclusive.
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

          {/* Schedule Bounds */}
          {renderStartDatePicker()}
          {renderEndDatePicker()}
        </div>
      )}
    </div>
  )
}

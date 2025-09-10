"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { format, addDays, startOfDay, endOfDay, isBefore, differenceInDays } from "date-fns"
import { cn } from "@/lib/utils"

interface DateRangeSelectorProps {
  value: [Date | undefined, Date | undefined]
  onChange: (value: [Date | undefined, Date | undefined]) => void
  className?: string
}

export function DateRangeSelector({ value, onChange, className }: DateRangeSelectorProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [startDate, endDate] = value

  // Helper function to get current date in UTC-2
  const getUtcMinus2Date = () => {
    const now = new Date()
    // First convert to UTC by adding the timezone offset
    // Then subtract 2 hours (120 minutes) to get UTC-2
    return new Date(now.getTime() + now.getTimezoneOffset() * 60000 - 120 * 60000)
  }

  // Quick select options
  const quickSelectOptions = [
    {
      label: "Today",
      getValue: () => {
        const today = startOfDay(getUtcMinus2Date())
        return [today, endOfDay(today)]
      },
    },
    {
      label: "Next 7 days",
      getValue: () => {
        const today = startOfDay(getUtcMinus2Date())
        return [today, endOfDay(addDays(today, 6))]
      },
    },
    {
      label: "This week",
      getValue: () => {
        const today = getUtcMinus2Date()
        const day = today.getDay() || 7 // Convert Sunday (0) to 7
        const startOfWeek = startOfDay(addDays(today, 1 - day)) // Monday
        const endOfWeek = endOfDay(addDays(startOfWeek, 6)) // Sunday
        return [startOfWeek, endOfWeek]
      },
    },
    {
      label: "Today & Tomorrow",
      getValue: () => {
        const today = startOfDay(getUtcMinus2Date())
        return [today, endOfDay(addDays(today, 1))]
      },
    },
  ]

  // Handle date selection in the calendar
  const handleSelect = (date: Date | undefined) => {
    if (!date) return

    const newDate = startOfDay(date)

    if (!startDate) {
      // If no start date is set, set the clicked date as start date
      onChange([newDate, undefined])
    } else if (!endDate) {
      // If start date is set but no end date, set the clicked date as end date
      // (regardless of whether it's before or after start date)
      if (isBefore(newDate, startDate)) {
        // If selected date is before start date, swap them
        onChange([newDate, endOfDay(startDate)])
      } else {
        // Otherwise use normal order
        onChange([startDate, endOfDay(newDate)])
      }
      setIsOpen(false)
    } else {
      // If both dates are already set, start a new selection
      onChange([newDate, undefined])
    }
  }

  // Handle quick select option
  const handleQuickSelect = (index: number) => {
    const [start, end] = quickSelectOptions[index].getValue() as [Date, Date]
    onChange([start, end])
    setIsOpen(false)
  }

  // Navigate to previous/next period
  const navigatePeriod = (direction: "prev" | "next") => {
    if (!startDate) return

    // Calculate the number of days to move based on the selected range
    let daysToMove = 1 // Default to 1 day if only start date is selected

    if (endDate) {
      // Calculate days between start and end dates (inclusive)
      daysToMove = differenceInDays(endDate, startDate) + 1
    }

    if (direction === "prev") {
      const newStart = addDays(startDate, -daysToMove)
      const newEnd = endDate ? addDays(endDate, -daysToMove) : undefined
      onChange([newStart, newEnd])
    } else {
      const newStart = addDays(startDate, daysToMove)
      const newEnd = endDate ? addDays(endDate, daysToMove) : undefined
      onChange([newStart, newEnd])
    }
  }

  // Toggle the calendar popover
  const toggleCalendar = () => {
    setIsOpen(!isOpen)
  }

  return (
    <div className={cn("relative", className)}>
      <div className="flex items-center space-x-2">
        <Button variant="outline" size="icon" onClick={() => navigatePeriod("prev")} disabled={!startDate}>
          <ChevronLeft className="h-4 w-4" />
        </Button>

        <Button
          variant="outline"
          className={cn(
            "justify-start text-left font-normal w-[240px]",
            !startDate && "text-muted-foreground",
            isOpen && "bg-accent",
          )}
          onClick={toggleCalendar}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {startDate ? (
            endDate ? (
              <>
                {format(startDate, "MMM d, yyyy")} - {format(endDate, "MMM d, yyyy")}
              </>
            ) : (
              format(startDate, "MMM d, yyyy")
            )
          ) : (
            "Select date range"
          )}
        </Button>

        <Button variant="outline" size="icon" onClick={() => navigatePeriod("next")} disabled={!startDate}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      {/* Calendar popover */}
      {isOpen && (
        <>
          {/* Backdrop for closing when clicking outside */}
          <div className="fixed inset-0 z-40" onClick={() => setIsOpen(false)} />

          <div className="absolute left-0 z-50 mt-1 rounded-md border bg-background shadow-md w-auto">
            <div className="p-3 border-b">
              <div className="space-y-2">
                <h4 className="font-medium text-sm">Quick select</h4>
                <div className="grid grid-cols-2 gap-2">
                  {quickSelectOptions.map((option, index) => (
                    <Button
                      key={option.label}
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => handleQuickSelect(index)}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-3">
              <h4 className="font-medium text-sm mb-2">Custom range</h4>
              <p className="text-xs text-muted-foreground mb-3">
                {!startDate ? "Select start date" : !endDate ? "Now select end date" : "Click to start a new selection"}
              </p>
              <div className="w-[350px]">
                <Calendar
                  mode="single"
                  selected={startDate}
                  onSelect={handleSelect}
                  initialFocus
                  disabled={(date) => {
                    // Disable dates before start date if end date is being selected
                    return startDate && !endDate ? isBefore(date, startDate) : false
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { CalendarIcon, ChevronLeft, ChevronRight } from "lucide-react"
import { differenceInDays } from "date-fns"
import { cn } from "@/lib/utils"
import {
  addAppDays,
  formatInAppTimezone,
  getAppToday,
  getStartOfAppDay,
  getEndOfAppDay,
} from "@/lib/date-utils"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

interface DateRangeSelectorProps {
  value: [Date | undefined, Date | undefined]
  onChange: (value: [Date | undefined, Date | undefined]) => void
  className?: string
  quickSelectDays?: number // Number of days for the "Next X days" option
}

export function DateRangeSelector({ value, onChange, className, quickSelectDays = 3 }: DateRangeSelectorProps) {
  const [startDate, endDate] = value
  const [isCustomOpen, setIsCustomOpen] = useState(false)
  const [tempStartDate, setTempStartDate] = useState<Date | undefined>()
  const [tempEndDate, setTempEndDate] = useState<Date | undefined>()

  // Quick select options
  const quickSelectOptions = [
    {
      label: "Today",
      getValue: () => {
        const today = getAppToday()
        return [today, getEndOfAppDay(today)]
      },
    },
    {
      label: `Next ${quickSelectDays} days`,
      getValue: () => {
        const today = getAppToday()
        return [today, getEndOfAppDay(addAppDays(today, quickSelectDays - 1))]
      },
    },
  ]

  // Navigate to previous/next period
  const navigatePeriod = (direction: "prev" | "next") => {
    if (!startDate || !endDate) return

    const daysToMove = differenceInDays(endDate, startDate) + 1
    const multiplier = direction === "prev" ? -1 : 1
    
    const newStart = addAppDays(startDate, daysToMove * multiplier)
    const newEnd = addAppDays(endDate, daysToMove * multiplier)
    onChange([newStart, newEnd])
  }

  // Handle quick select
  const handleQuickSelect = (option: { getValue: () => [Date, Date] }) => {
    const [start, end] = option.getValue()
    onChange([start, end])
  }

  // Handle custom date input changes (temporary state)
  const handleTempStartDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      // Parse date manually to avoid timezone issues
      const [year, month, day] = e.target.value.split('-').map(Number)
      setTempStartDate(getStartOfAppDay(new Date(year, month - 1, day)))
    }
  }

  const handleTempEndDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      // Parse date manually to avoid timezone issues
      const [year, month, day] = e.target.value.split('-').map(Number)
      setTempEndDate(getStartOfAppDay(new Date(year, month - 1, day)))
    }
  }

  // Apply the custom date range
  const applyCustomDates = () => {
    if (tempStartDate) {
      const newStart = getStartOfAppDay(tempStartDate)
      const newEnd = tempEndDate ? getEndOfAppDay(tempEndDate) : getEndOfAppDay(tempStartDate)
      onChange([newStart, newEnd])
      setIsCustomOpen(false)
    }
  }

  // Initialize temp dates when opening custom picker
  const handleCustomOpen = () => {
    setTempStartDate(startDate || getAppToday())
    setTempEndDate(endDate || getAppToday())
    setIsCustomOpen(true)
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button 
        variant="outline" 
        size="icon" 
        onClick={() => navigatePeriod("prev")} 
        disabled={!startDate || !endDate}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>

      <div className="flex gap-2">
        {quickSelectOptions.map((option) => (
          <Button
            key={option.label}
            variant="outline"
            size="sm"
            onClick={() => handleQuickSelect(option)}
            className="text-xs"
          >
            {option.label}
          </Button>
        ))}
        
        <Popover open={isCustomOpen} onOpenChange={setIsCustomOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={handleCustomOpen}
            >
              <CalendarIcon className="mr-1 h-3 w-3" />
              Custom
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3" align="start">
            <div className="space-y-3">
              <div className="text-sm font-medium">Select Date Range</div>
              <div className="grid gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Start Date</label>
                  <Input
                    type="date"
                    value={tempStartDate ? formatInAppTimezone(tempStartDate, "yyyy-MM-dd") : ""}
                    onChange={handleTempStartDateChange}
                    className="text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">End Date</label>
                  <Input
                    type="date"
                    value={tempEndDate ? formatInAppTimezone(tempEndDate, "yyyy-MM-dd") : ""}
                    onChange={handleTempEndDateChange}
                    min={tempStartDate ? formatInAppTimezone(tempStartDate, "yyyy-MM-dd") : undefined}
                    className="text-sm"
                  />
                </div>
                <div className="flex gap-2 mt-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={() => setIsCustomOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button 
                    size="sm" 
                    onClick={applyCustomDates}
                    disabled={!tempStartDate}
                  >
                    Done
                  </Button>
                </div>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <Button 
        variant="outline" 
        size="icon" 
        onClick={() => navigatePeriod("next")} 
        disabled={!startDate || !endDate}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>

      {startDate && endDate && (
        <span className="text-sm text-muted-foreground ml-2">
          {formatInAppTimezone(startDate, "MMM d")} - {formatInAppTimezone(endDate, "MMM d, yyyy")}
        </span>
      )}
    </div>
  )
}

"use client"

import * as React from "react"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { DayPicker } from "react-day-picker"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

export type CalendarProps = React.ComponentProps<typeof DayPicker>

function Calendar({ className, classNames, showOutsideDays = true, ...props }: CalendarProps) {
  const [month, setMonth] = React.useState<Date>(props.defaultMonth || new Date())

  // Generate month options
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ]

  // Generate year options (10 years before and after current year)
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 21 }, (_, i) => currentYear - 10 + i)

  // Handle month change
  const handleMonthChange = (monthIndex: number) => {
    const newDate = new Date(month)
    newDate.setMonth(monthIndex)
    setMonth(newDate)
    props.onMonthChange?.(newDate)
  }

  // Handle year change
  const handleYearChange = (year: number) => {
    const newDate = new Date(month)
    newDate.setFullYear(year)
    setMonth(newDate)
    props.onMonthChange?.(newDate)
  }

  return (
    <div className="space-y-4">
      {/* Month and Year Selectors */}
      <div className="flex justify-center items-center space-x-2">
        <Select
          value={month.getMonth().toString()}
          onValueChange={(value) => handleMonthChange(Number.parseInt(value))}
        >
          <SelectTrigger className="w-[120px] h-8">
            <SelectValue>{months[month.getMonth()]}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {months.map((monthName, index) => (
              <SelectItem key={monthName} value={index.toString()}>
                {monthName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={month.getFullYear().toString()}
          onValueChange={(value) => handleYearChange(Number.parseInt(value))}
        >
          <SelectTrigger className="w-[90px] h-8">
            <SelectValue>{month.getFullYear()}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            {years.map((year) => (
              <SelectItem key={year} value={year.toString()}>
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Calendar */}
      <DayPicker
        showOutsideDays={showOutsideDays}
        className={cn("p-3", className)}
        classNames={{
          months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0",
          month: "space-y-4",
          caption: "hidden", // Hide the default caption since we have our own selectors
          caption_label: "text-sm font-medium",
          nav: "space-x-1 flex items-center",
          nav_button: cn(
            buttonVariants({ variant: "outline" }),
            "h-7 w-7 bg-transparent p-0 opacity-50 hover:opacity-100",
          ),
          nav_button_previous: "absolute left-1",
          nav_button_next: "absolute right-1",
          table: "w-full border-collapse space-y-1",
          head_row: "flex w-full justify-between",
          head_cell: "text-muted-foreground rounded-md w-9 font-normal text-[0.8rem] text-center",
          row: "flex w-full mt-2 justify-between",
          cell: "text-center text-sm p-0 relative [&:has([aria-selected].day-range-end)]:rounded-r-md [&:has([aria-selected].day-outside)]:bg-accent/50 [&:has([aria-selected])]:bg-accent first:[&:has([aria-selected])]:rounded-l-md last:[&:has([aria-selected])]:rounded-r-md focus-within:relative focus-within:z-20 w-9 h-9",
          day: cn(buttonVariants({ variant: "ghost" }), "h-9 w-9 p-0 font-normal aria-selected:opacity-100"),
          day_range_end: "day-range-end",
          day_selected:
            "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground focus:bg-primary focus:text-primary-foreground",
          day_today: "bg-accent text-accent-foreground",
          day_outside:
            "day-outside text-muted-foreground opacity-50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground aria-selected:opacity-30",
          day_disabled: "text-muted-foreground opacity-50",
          day_range_middle: "aria-selected:bg-accent aria-selected:text-accent-foreground",
          day_hidden: "invisible",
          ...classNames,
        }}
        components={{
          IconLeft: ({ ...props }) => <ChevronLeft className="h-4 w-4" />,
          IconRight: ({ ...props }) => <ChevronRight className="h-4 w-4" />,
        }}
        month={month}
        onMonthChange={setMonth}
        formatters={{
          formatWeekdayName: (weekday) => {
            const day = weekday.toLocaleString("en-US", { weekday: "short" })
            return day.charAt(0)
          },
        }}
        weekStartsOn={0} // Start week on Sunday (0 for Sunday, 1 for Monday)
        {...props}
      />
    </div>
  )
}
Calendar.displayName = "Calendar"

export { Calendar }

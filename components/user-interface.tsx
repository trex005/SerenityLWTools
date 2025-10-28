"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useState, useEffect, useMemo } from "react"
import { DateRangeSelector } from "@/components/date-range-selector"
import { addDays, startOfDay, endOfDay, format } from "date-fns"
import { getDayOfWeek } from "@/lib/recurrence-utils"
import { getAppTimezoneDate } from "@/lib/date-utils"
import { ReadOnlyDayAgenda } from "@/components/read-only-day-agenda"
import { ReadOnlyTips } from "@/components/read-only-tips"
import { setupTipHashNavigation } from "@/lib/hash-navigation"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { scopedLocalStorage } from "@/lib/scoped-storage"

export function UserInterface() {
  // State to track which main tab is currently active
  const [activeTab, setActiveTab] = useState("schedule")
  const [showLocalTime, setShowLocalTime] = useState(() => {
    const saved = scopedLocalStorage.getItem("show-local-time")
    return saved ? JSON.parse(saved) : true
  })

  // State for date range - defaults to next 7 days for schedule view in UTC-2
  const [dateRange, setDateRange] = useState<[Date | undefined, Date | undefined]>(() => {
    const utcMinus2 = getAppTimezoneDate()
    const today = startOfDay(utcMinus2)
    return [today, endOfDay(addDays(today, 6))] // Default to next 7 days from UTC-2 today
  })

  // State for active day - set to UTC-2 today
  const [activeDay, setActiveDay] = useState<string>(() => {
    const utcMinus2 = getAppTimezoneDate()
    return format(utcMinus2, "yyyy-MM-dd")
  })

  // Add a state to force refresh of the tips component
  const [tipsRefreshKey, setTipsRefreshKey] = useState(0)

  // Function to force refresh the tips component
  const forceRefreshTips = () => {
    setTipsRefreshKey(Date.now())
  }

  // Update active day when date range changes
  useEffect(() => {
    if (dateRange[0]) {
      setActiveDay(format(dateRange[0], "yyyy-MM-dd"))
    }
  }, [dateRange])

  // Set up hash navigation when component mounts
  useEffect(() => {
    // Set up the polling for hash navigation
    const cleanup = setupTipHashNavigation(setActiveTab, forceRefreshTips)

    // Clean up when component unmounts
    return cleanup
  }, [])

  // Add a useEffect to save the preference to localStorage
  useEffect(() => {
    scopedLocalStorage.setItem("show-local-time", JSON.stringify(showLocalTime))
  }, [showLocalTime])

  const dayTabs = useMemo(() => {
    if (!dateRange[0] || !dateRange[1]) {
      return []
    }
    return generateDayTabs(dateRange[0], dateRange[1])
  }, [dateRange])

  return (
    <div className="w-full">
      <div className="w-full">
        {/* Main navigation tabs - only Schedule and Tips */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <TabsList className="mb-2 sm:mb-0">
                <TabsTrigger value="schedule">Operations</TabsTrigger>
                <TabsTrigger value="tips">Intel</TabsTrigger>
              </TabsList>
            </div>
          </div>

          {/* Schedule tab content */}
          <TabsContent value="schedule" className="mt-0">
            {/* Date range selector */}
            <div className="flex justify-center mb-4">
              <DateRangeSelector value={dateRange} onChange={setDateRange} quickSelectDays={7} />
            </div>

            {/* Nested tabs for days in the selected range */}
            <Tabs value={activeDay} onValueChange={setActiveDay} className="w-full">
              {dayTabs.length > 0 && (
                <div className="md:hidden mb-4">
                  <Select value={activeDay} onValueChange={setActiveDay}>
                    <SelectTrigger aria-label="Select operations day">
                      <SelectValue placeholder="Select day" />
                    </SelectTrigger>
                    <SelectContent>
                      {dayTabs.map(({ day, date }) => (
                        <SelectItem key={format(date, "yyyy-MM-dd")} value={format(date, "yyyy-MM-dd")}>
                          {`${day.substring(0, 3)} ${format(date, "M/d")}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <TabsList className="hidden md:flex w-full justify-start mb-4 overflow-x-auto">
                {dayTabs.map(({ day, date }) => (
                  <TabsTrigger
                    key={format(date, "yyyy-MM-dd")}
                    value={format(date, "yyyy-MM-dd")}
                    className="capitalize"
                  >
                    {day.substring(0, 3)} {format(date, "M/d")}
                  </TabsTrigger>
                ))}
              </TabsList>

              {/* Content for each day tab */}
              {dayTabs.map(({ day, date }) => (
                <TabsContent key={format(date, "yyyy-MM-dd")} value={format(date, "yyyy-MM-dd")} className="mt-0">
                  <div className="mb-4">
                    <h3 className="text-lg font-medium capitalize">{format(date, "EEEE, MMMM d, yyyy")}</h3>
                  </div>
                  <ReadOnlyDayAgenda
                    day={day}
                    date={date}
                    showLocalTime={showLocalTime}
                    setShowLocalTime={setShowLocalTime}
                  />
                </TabsContent>
              ))}
            </Tabs>
          </TabsContent>

          {/* Tips tab content */}
          <TabsContent value="tips" className="mt-0">
            {/* Use key for React's reconciliation and forceRefresh for the component to use */}
            <ReadOnlyTips key={`tips-${tipsRefreshKey}`} forceRefresh={`${tipsRefreshKey}`} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}

/**
 * Generate day tabs for the selected date range
 */
function generateDayTabs(startDate: Date, endDate: Date) {
  const days = []
  let currentDate = new Date(startDate)

  while (currentDate <= endDate) {
    const day = getDayOfWeek(currentDate)
    days.push({
      day,
      date: new Date(currentDate),
    })
    currentDate = addDays(currentDate, 1)
  }

  return days
}

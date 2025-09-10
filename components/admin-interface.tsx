"use client"

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DayAgenda } from "@/components/day-agenda"
import { AddEventButton } from "@/components/add-event-button"
import { AdminPanel } from "@/components/admin-panel"
import { TipsManagement } from "@/components/tips-management"
import { useState, useEffect } from "react"
import { StorageInitializer } from "@/components/storage-initializer"
import { EventsView } from "@/components/events-view"
import { DateRangeSelector } from "@/components/date-range-selector"
import { addDays, startOfDay, endOfDay, format } from "date-fns"
import { getDayOfWeek } from "@/lib/recurrence-utils"
import { getAppTimezoneDate } from "@/lib/date-utils"
import { EmailGenerator } from "@/components/email-generator"
import { Reminders } from "@/components/reminders"
import { useAdminState } from "@/hooks/use-admin-state"
import { Button } from "@/components/ui/button"
import { setupTipHashNavigation } from "@/lib/hash-navigation"

export function AdminInterface() {
  // State to track which main tab is currently active
  const [activeTab, setActiveTab] = useState("schedule")
  const { exitAdminMode } = useAdminState()
  const [showLocalTime, setShowLocalTime] = useState(() => {
    // Load preference from localStorage, default to true
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("show-local-time")
      return saved ? JSON.parse(saved) : true
    }
    return true
  })

  // Add a state to force refresh of the tips component
  const [tipsRefreshKey, setTipsRefreshKey] = useState(0)

  // Function to force refresh the tips component
  const forceRefreshTips = () => {
    setTipsRefreshKey(Date.now())
  }

  // Add a useEffect to save the preference to localStorage
  useEffect(() => {
    localStorage.setItem("show-local-time", JSON.stringify(showLocalTime))
  }, [showLocalTime])

  // Set up hash navigation when component mounts
  useEffect(() => {
    // Set up the polling for hash navigation
    const cleanup = setupTipHashNavigation(setActiveTab, forceRefreshTips)

    // Clean up when component unmounts
    return cleanup
  }, [])

  // State for date range - now defaults to next 7 days for schedule view in UTC-2
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

  // Update active day when date range changes
  useEffect(() => {
    if (dateRange[0]) {
      setActiveDay(format(dateRange[0], "yyyy-MM-dd"))
    }
  }, [dateRange])

  return (
    <div className="w-full">
      <StorageInitializer />
      <div className="w-full">
        {/* Main navigation tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <TabsList className="mb-2 sm:mb-0">
                <TabsTrigger value="schedule">Operations</TabsTrigger>
                <TabsTrigger value="events">Missions</TabsTrigger>
                <TabsTrigger value="tips">Intel</TabsTrigger>
                <TabsTrigger value="email">Briefing</TabsTrigger>
                <TabsTrigger value="reminders">Reminders</TabsTrigger>
                <TabsTrigger value="admin">Command</TabsTrigger>
              </TabsList>
            </div>
            <Button variant="outline" size="sm" onClick={exitAdminMode} className="text-xs">
              Exit Command Mode
            </Button>
          </div>

          {/* Schedule tab content */}
          <TabsContent value="schedule" className="mt-0">
            {/* Date range selector */}
            <div className="flex justify-center mb-4">
              <DateRangeSelector value={dateRange} onChange={setDateRange} />
            </div>

            {/* Display date range information */}
            <div className="mb-4"></div>

            {/* Nested tabs for days in the selected range */}
            <Tabs value={activeDay} onValueChange={setActiveDay} className="w-full">
              <TabsList className="w-full justify-start mb-4 overflow-x-auto">
                {dateRange[0] &&
                  dateRange[1] &&
                  generateDayTabs(dateRange[0], dateRange[1]).map(({ day, date }) => (
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
              {dateRange[0] &&
                dateRange[1] &&
                generateDayTabs(dateRange[0], dateRange[1]).map(({ day, date }) => (
                  <TabsContent key={format(date, "yyyy-MM-dd")} value={format(date, "yyyy-MM-dd")} className="mt-0">
                    <div className="flex justify-between items-center mb-4">
                      <h3 className="text-lg font-medium capitalize">{format(date, "EEEE, MMMM d, yyyy")}</h3>
                      <AddEventButton day={day} date={date} />
                    </div>
                    <DayAgenda
                      day={day}
                      date={date}
                      showLocalTime={showLocalTime}
                      setShowLocalTime={setShowLocalTime}
                    />
                  </TabsContent>
                ))}
            </Tabs>
          </TabsContent>

          {/* Events tab content (formerly Archive) */}
          <TabsContent value="events" className="mt-0">
            <EventsView />
          </TabsContent>

          {/* Tips management tab content */}
          <TabsContent value="tips" className="mt-0">
            <TipsManagement key={`tips-${tipsRefreshKey}`} forceRefresh={`${tipsRefreshKey}`} />
          </TabsContent>

          {/* Email generator tab content */}
          <TabsContent value="email" className="mt-0">
            <EmailGenerator />
          </TabsContent>

          {/* Reminders tab content */}
          <TabsContent value="reminders" className="mt-0">
            <Reminders />
          </TabsContent>

          {/* Admin panel tab content */}
          <TabsContent value="admin" className="mt-0">
            <AdminPanel />
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

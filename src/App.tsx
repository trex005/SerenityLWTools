import { useEffect, useMemo, useRef, useState } from "react"
import { useAdminState } from "@/hooks/use-admin-state"
import { useTagData } from "@/hooks/use-tag-data"
import { AdminAccessTrigger } from "@/components/admin-access-trigger"
import { BrandLogo } from "@/components/brand-logo"
import { DayAgenda } from "@/components/day-agenda"
import { AddEventButton } from "@/components/add-event-button"
import { ReadOnlyDayAgenda } from "@/components/read-only-day-agenda"
import { ReadOnlyTips } from "@/components/read-only-tips"
import { TipsManagement } from "@/components/tips-management"
import { EventsView } from "@/components/events-view"
import { EmailGenerator } from "@/components/email-generator"
import { Reminders } from "@/components/reminders"
import { AdminPanel } from "@/components/admin-panel"
import { PublishDialog } from "@/src/publish-dialog"
import { getTipIdFromLocation } from "@/lib/hash-navigation"
import { OverrideDiffProvider } from "@/hooks/use-override-diff"
import { addAppDays, formatInAppTimezone, getAppToday, getAppTodayKey, getStartOfAppDay, getEndOfAppDay } from "@/lib/date-utils"
import { CalendarRange, ChevronLeft, ChevronRight, CloudUpload, Eye, EyeOff, LogOut } from "lucide-react"
import { useShowLocalTime } from "@/src/local-time"

type MainTab = "agenda" | "tips" | "events" | "mail" | "reminders" | "command"

const PUBLIC_TABS: MainTab[] = ["agenda", "tips"]
const ADMIN_TABS: MainTab[] = ["agenda", "events", "tips", "mail", "reminders", "command"]

const TAB_LABELS: Record<MainTab, string> = {
  agenda: "Agenda",
  events: "Events",
  tips: "Tips",
  mail: "Mail",
  reminders: "Reminders",
  command: "Command",
}

export function App() {
  const { adminMode } = useAdminState()
  const { brandLabel } = useTagData()
  const [activeTab, setActiveTab] = useState<MainTab>(() =>
    typeof window !== "undefined" && getTipIdFromLocation() ? "tips" : "agenda",
  )
  const [publishOpen, setPublishOpen] = useState(false)

  useEffect(() => {
    if (!adminMode && !PUBLIC_TABS.includes(activeTab)) {
      setActiveTab("agenda")
    }
  }, [adminMode, activeTab])

  const tabs = adminMode ? ADMIN_TABS : PUBLIC_TABS

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar
        adminMode={adminMode}
        tabs={tabs}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onPublish={() => setPublishOpen(true)}
      />

      <main className="mx-auto w-full max-w-5xl flex-1 px-3 pb-10 pt-4 sm:px-4">
        {activeTab === "agenda" && <AgendaView adminMode={adminMode} />}
        {activeTab === "tips" &&
          (adminMode ? <TipsManagement forceRefresh="0" /> : <ReadOnlyTips forceRefresh="0" />)}
        {adminMode && activeTab === "events" && <EventsView />}
        {adminMode && activeTab === "mail" && <EmailGenerator />}
        {adminMode && activeTab === "reminders" && <Reminders />}
        {adminMode && activeTab === "command" && (
          <OverrideDiffProvider>
            <AdminPanel />
          </OverrideDiffProvider>
        )}
      </main>

      <footer className="mt-4 border-t border-white/5 py-6 text-center text-xs text-muted-foreground/60">
        {brandLabel}
      </footer>

      <AdminAccessTrigger />
      <PublishDialog open={publishOpen} onOpenChange={setPublishOpen} />
    </div>
  )
}

function TopBar({
  adminMode,
  tabs,
  activeTab,
  onTabChange,
  onPublish,
}: {
  adminMode: boolean
  tabs: MainTab[]
  activeTab: MainTab
  onTabChange: (tab: MainTab) => void
  onPublish: () => void
}) {
  const { exitAdminMode } = useAdminState()

  return (
    <header className="app-topbar">
      <div className="mx-auto flex h-12 w-full max-w-5xl items-center gap-2 px-3 sm:px-4">
        <div className="flex shrink-0 items-center gap-2">
          <BrandLogo size={22} />
          {adminMode && (
            <span
              title="Command mode"
              aria-label="Command mode"
              className="h-2 w-2 rounded-full bg-primary shadow-[0_0_8px_2px_hsl(245_85%_66%/0.7)]"
            />
          )}
        </div>

        <nav className="scroll-strip min-w-0 flex-1 px-0.5" aria-label="Sections">
          {tabs.map((tab) => (
            <button
              key={tab}
              className="nav-pill"
              data-active={activeTab === tab}
              onClick={() => onTabChange(tab)}
            >
              {TAB_LABELS[tab]}
            </button>
          ))}
        </nav>

        <div className="flex shrink-0 items-center gap-1">
          {adminMode ? (
            <>
              <button
                onClick={onPublish}
                title="Publish changes to S3"
                className="inline-flex h-8 items-center gap-1.5 rounded-full bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-sm transition-all hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <CloudUpload className="h-4 w-4" />
                <span className="hidden sm:inline">Publish</span>
              </button>
              <button
                onClick={exitAdminMode}
                title="Exit command mode"
                aria-label="Exit command mode"
                className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </>
          ) : (
            <LocalTimeToggle />
          )}
        </div>
      </div>
    </header>
  )
}

function LocalTimeToggle() {
  const [showLocalTime, setShowLocalTime] = useShowLocalTime()
  return (
    <button
      onClick={() => setShowLocalTime(!showLocalTime)}
      title={showLocalTime ? "Local time shown alongside server time" : "Server time only"}
      aria-label={showLocalTime ? "Hide local time" : "Show local time"}
      aria-pressed={showLocalTime}
      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {showLocalTime ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
    </button>
  )
}

const MAX_RANGE_DAYS = 31

const toDateInputValue = (date: Date): string => formatInAppTimezone(date, "yyyy-MM-dd")

const fromDateInputValue = (value: string, endOfDay: boolean): Date | undefined => {
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return undefined
  const parsed = getEndOfAppDay(new Date(Date.UTC(year, month - 1, day, 12)))
  return endOfDay ? parsed : getStartOfAppDay(parsed)
}

function AgendaView({ adminMode }: { adminMode: boolean }) {
  const [range, setRange] = useState<[Date, Date]>(() => {
    const today = getAppToday()
    return [today, addAppDays(today, 6)]
  })
  const [activeDay, setActiveDay] = useState<string>(() => getAppTodayKey())
  const [showLocalTime] = useShowLocalTime()

  const days = useMemo(() => {
    const result: { key: string; day: string; date: Date }[] = []
    let cursor = range[0]
    let guard = 0
    while (cursor <= range[1] && guard < MAX_RANGE_DAYS) {
      result.push({
        key: formatInAppTimezone(cursor, "yyyy-MM-dd"),
        day: formatInAppTimezone(cursor, "EEEE").toLowerCase(),
        date: new Date(cursor),
      })
      cursor = addAppDays(cursor, 1)
      guard += 1
    }
    return result
  }, [range])

  useEffect(() => {
    if (!days.some((entry) => entry.key === activeDay)) {
      setActiveDay(days[0]?.key ?? getAppTodayKey())
    }
  }, [days, activeDay])

  const pageRange = (delta: number) => {
    const span = days.length || 7
    setRange(([start, end]) => [addAppDays(start, delta * span), addAppDays(end, delta * span)])
  }

  const resetToToday = () => {
    const today = getAppToday()
    setRange([today, addAppDays(today, 6)])
    setActiveDay(getAppTodayKey())
  }

  const todayKey = getAppTodayKey()
  const activeEntry = days.find((entry) => entry.key === activeDay)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex items-center rounded-lg border bg-card/40">
            <button
              onClick={() => pageRange(-1)}
              aria-label="Previous period"
              title="Previous period"
              className="inline-flex h-8 w-8 items-center justify-center rounded-l-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              onClick={resetToToday}
              className="border-x border-white/5 px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Today
            </button>
            <button
              onClick={() => pageRange(1)}
              aria-label="Next period"
              title="Next period"
              className="inline-flex h-8 w-8 items-center justify-center rounded-r-lg text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          <CustomRangePicker range={range} onChange={setRange} />
        </div>
        {adminMode && activeEntry && <AddEventButton day={activeEntry.day} date={activeEntry.date} />}
      </div>

      <div className="scroll-strip -mx-1 px-1" role="tablist" aria-label="Agenda days">
        {days.map(({ key, date }) => (
          <button
            key={key}
            role="tab"
            aria-selected={activeDay === key}
            className="day-chip"
            data-active={activeDay === key}
            data-today={key === todayKey}
            onClick={() => setActiveDay(key)}
          >
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {formatInAppTimezone(date, "EEE")}
            </span>
            <span className="text-sm font-semibold leading-tight tabular-nums">
              {formatInAppTimezone(date, "d")}
              <span className="ml-0.5 text-[10px] font-medium text-muted-foreground">
                {formatInAppTimezone(date, "MMM")}
              </span>
            </span>
          </button>
        ))}
      </div>

      {activeEntry && (
        <section aria-label={`Agenda for ${activeEntry.key}`}>
          <h2 className="section-title mb-3">
            {formatInAppTimezone(activeEntry.date, "EEEE, MMMM d, yyyy")}
          </h2>
          {adminMode ? (
            <DayAgenda
              day={activeEntry.day}
              date={activeEntry.date}
              showLocalTime={showLocalTime}
            />
          ) : (
            <ReadOnlyDayAgenda
              day={activeEntry.day}
              date={activeEntry.date}
              showLocalTime={showLocalTime}
            />
          )}
        </section>
      )}
    </div>
  )
}

function CustomRangePicker({
  range,
  onChange,
}: {
  range: [Date, Date]
  onChange: (range: [Date, Date]) => void
}) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    document.addEventListener("mousedown", handlePointerDown)
    document.addEventListener("touchstart", handlePointerDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handlePointerDown)
      document.removeEventListener("touchstart", handlePointerDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={containerRef}>
      <button
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title={`Custom range: ${toDateInputValue(range[0])} to ${toDateInputValue(range[1])}`}
        data-active={open}
        className="inline-flex h-8 w-9 items-center justify-center rounded-lg border bg-card/40 text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[active=true]:border-primary/50 data-[active=true]:text-foreground"
      >
        <CalendarRange className="h-4 w-4" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Custom date range"
          className="absolute left-0 top-full z-30 mt-2 w-64 rounded-xl border bg-popover/95 p-3 shadow-xl backdrop-blur-xl"
        >
          <p className="section-label mb-2">Custom range</p>
          <label className="block">
            <span className="mb-1 block text-xs text-muted-foreground">Start</span>
            <input
              type="date"
              value={toDateInputValue(range[0])}
              onChange={(event) => {
                const start = fromDateInputValue(event.target.value, false)
                if (start) onChange(start <= range[1] ? [start, range[1]] : [start, addAppDays(start, 6)])
              }}
              className="w-full rounded-lg border bg-transparent px-2 py-1.5 text-sm outline-none transition-colors focus:border-primary/60 [color-scheme:dark]"
            />
          </label>
          <label className="mt-2 block">
            <span className="mb-1 block text-xs text-muted-foreground">End</span>
            <input
              type="date"
              value={toDateInputValue(range[1])}
              onChange={(event) => {
                const end = fromDateInputValue(event.target.value, true)
                if (end) onChange(end >= range[0] ? [range[0], end] : [addAppDays(end, -6), end])
              }}
              className="w-full rounded-lg border bg-transparent px-2 py-1.5 text-sm outline-none transition-colors focus:border-primary/60 [color-scheme:dark]"
            />
          </label>
        </div>
      )}
    </div>
  )
}

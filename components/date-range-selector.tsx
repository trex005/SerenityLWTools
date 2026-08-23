import { formatInAppTimezone, addAppDays, getAppToday, getEndOfAppDay } from "@/lib/date-utils"
import { CalendarRange } from "lucide-react"

interface DateRangeSelectorProps {
  value: [Date | undefined, Date | undefined]
  onChange: (value: [Date | undefined, Date | undefined]) => void
  quickSelectDays?: number
  className?: string
}

const toDateInputValue = (date: Date | undefined): string =>
  date ? formatInAppTimezone(date, "yyyy-MM-dd") : ""

const fromDateInputValue = (value: string): Date | undefined => {
  if (!value) return undefined
  const [year, month, day] = value.split("-").map(Number)
  if (!year || !month || !day) return undefined
  return getEndOfAppDay(new Date(Date.UTC(year, month - 1, day, 12)))
}

export function DateRangeSelector({ value, onChange, quickSelectDays = 7, className }: DateRangeSelectorProps) {
  const [start, end] = value

  const quickPicks = [3, quickSelectDays, 14].filter(
    (days, index, list) => days > 0 && list.indexOf(days) === index,
  )

  const applyQuickPick = (days: number) => {
    const today = getAppToday()
    onChange([today, getEndOfAppDay(addAppDays(today, days - 1))])
  }

  const matchesQuickPick = (days: number) => {
    if (!start || !end) return false
    const today = getAppToday()
    return (
      formatInAppTimezone(start, "yyyy-MM-dd") === formatInAppTimezone(today, "yyyy-MM-dd") &&
      formatInAppTimezone(end, "yyyy-MM-dd") ===
        formatInAppTimezone(addAppDays(today, days - 1), "yyyy-MM-dd")
    )
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex items-center gap-1.5 rounded-lg border bg-card px-2.5 py-1.5">
          <CalendarRange className="h-4 w-4 text-muted-foreground" />
          <input
            type="date"
            aria-label="Start date"
            value={toDateInputValue(start)}
            onChange={(event) => onChange([fromDateInputValue(event.target.value), end])}
            className="bg-transparent text-sm outline-none"
          />
          <span className="text-muted-foreground">–</span>
          <input
            type="date"
            aria-label="End date"
            value={toDateInputValue(end)}
            onChange={(event) => onChange([start, fromDateInputValue(event.target.value)])}
            className="bg-transparent text-sm outline-none"
          />
        </div>
        <div className="scroll-strip">
          {quickPicks.map((days) => (
            <button
              key={days}
              type="button"
              className="nav-pill"
              data-active={matchesQuickPick(days)}
              onClick={() => applyQuickPick(days)}
            >
              {days}d
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

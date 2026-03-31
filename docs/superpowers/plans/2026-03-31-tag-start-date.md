# Tag-Relative Start Dates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace absolute ISO date strings in event recurrence with tag-relative integer offsets, add a `tags.startDate` config block to each tag's `conf.json`, and build a one-time migration tool that converts all existing events.

**Architecture:** Each tag declares `tags[tagName].startDate` in its `conf.json`; child tags can override ancestor entries via the existing `deepMerge`. Events store `recurrence.startTag` (tag name) and `recurrence.startOffset` (integer days). At runtime, `actualDate = resolvedTagConfig.tags[startTag].startDate + startOffset`. A CLI script (`scripts/migrate-dates.ts`) runs once before deployment to convert all existing files.

**Tech Stack:** TypeScript, Next.js 15, Node.js built-in `readline` + `test` runner, `date-fns` (`differenceInDays`, `parseISO`), `tsx` for running scripts.

**Spec:** `docs/superpowers/specs/2026-03-31-tag-start-date-design.md`

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `lib/recurrence-utils.ts` | Modify | Add `TagConfig` type, `resolveRecurrenceDate`, update `convertNewRecurrenceFormat`, add `tagConfig` param to `shouldShowRecurringEvent` + `formatRecurrence` |
| `lib/recurrence-utils.test.ts` | Create | Tests for `resolveRecurrenceDate` and updated `shouldShowRecurringEvent` |
| `hooks/use-events.ts` | Modify | Update `Event.recurrence` interface to use `startTag`/`startOffset`/`endOffset` |
| `components/recurrence-editor.tsx` | Modify | Update `RecurrenceData`, remove `convertLegacyToNew`, update date↔offset handlers, add `tagConfig`/`activeTag` props |
| `components/event-dialog.tsx` | Modify | Import `useTagData`, pass `tagConfig`/`activeTag` to `RecurrenceEditor`, update `normalizeRecurrenceDates` + fallback objects |
| `components/day-agenda.tsx` | Modify | Add `useTagData()`, pass `tagConfig` to `shouldShowRecurringEvent` |
| `components/read-only-day-agenda.tsx` | Modify | Add `useTagData()`, pass `tagConfig` to `shouldShowRecurringEvent` |
| `components/email-generator.tsx` | Modify | Add `useTagData()`, pass `tagConfig` to `shouldShowRecurringEvent` |
| `components/reminders.tsx` | Modify | Add `useTagData()`, pass `tagConfig` to `shouldShowRecurringEvent` |
| `components/event-card.tsx` | Modify | Add `useTagData()`, pass `tagConfig` to `formatRecurrence` |
| `components/events-view.tsx` | Modify | Add `useTagData()`, pass `tagConfig` to `formatRecurrence` |
| `scripts/migrate-dates.ts` | Create | CLI migration tool: prompts for missing startDates, converts events in-place |
| `scripts/migrate-dates.test.ts` | Create | Tests for migration conversion logic (pure functions extracted from the tool) |

---

## Task 1: Add `resolveRecurrenceDate` to `lib/recurrence-utils.ts`

**Files:**
- Modify: `lib/recurrence-utils.ts`
- Create: `lib/recurrence-utils.test.ts`

- [ ] **Step 1.1: Create the test file**

Create `lib/recurrence-utils.test.ts`:

```typescript
import { strict as assert } from "node:assert"
import { test } from "node:test"
import { resolveRecurrenceDate } from "./recurrence-utils"
import { formatInAppTimezone } from "./date-utils"

test("resolveRecurrenceDate: offset 0 returns the tag startDate itself", () => {
  const tagConfig = { tags: { s4: { startDate: "2026-01-01" } } }
  const result = resolveRecurrenceDate("s4", 0, tagConfig)
  assert.equal(formatInAppTimezone(result, "yyyy-MM-dd"), "2026-01-01")
})

test("resolveRecurrenceDate: positive offset adds days", () => {
  const tagConfig = { tags: { s4: { startDate: "2026-01-01" } } }
  const result = resolveRecurrenceDate("s4", 5, tagConfig)
  assert.equal(formatInAppTimezone(result, "yyyy-MM-dd"), "2026-01-06")
})

test("resolveRecurrenceDate: uses overridden startDate when child tag overrides ancestor", () => {
  const tagConfig = { tags: { s4: { startDate: "2024-10-10" } } }
  const result = resolveRecurrenceDate("s4", 5, tagConfig)
  assert.equal(formatInAppTimezone(result, "yyyy-MM-dd"), "2024-10-15")
})

test("resolveRecurrenceDate: throws when tag not in tagConfig", () => {
  const tagConfig = { tags: {} }
  assert.throws(
    () => resolveRecurrenceDate("missing", 5, tagConfig),
    /No startDate found for tag/
  )
})
```

- [ ] **Step 1.2: Run tests to confirm they fail**

```bash
cd LWSerenity && npx tsx --test lib/recurrence-utils.test.ts
```

Expected: error — `resolveRecurrenceDate` is not exported from `recurrence-utils.ts`.

- [ ] **Step 1.3: Add `TagConfig` type and `resolveRecurrenceDate` to `lib/recurrence-utils.ts`**

In `lib/recurrence-utils.ts`, extend the existing `date-utils` import to include `addAppDays`:

```typescript
import { formatInAppTimezone, getDayOfWeek as getAppDayOfWeek, getStartOfAppDay, addAppDays } from "./date-utils"
```

Then, after the existing imports, add:

```typescript
export type TagConfig = {
  tags?: Record<string, { startDate?: string }>
}

/**
 * Resolve an absolute Date from a tag-relative offset.
 * actualDate = tags[startTag].startDate + offsetDays
 */
export function resolveRecurrenceDate(
  startTag: string,
  offsetDays: number,
  tagConfig: TagConfig,
): Date {
  const startDateStr = tagConfig?.tags?.[startTag]?.startDate
  if (!startDateStr) {
    throw new Error(`No startDate found for tag "${startTag}" in tagConfig`)
  }
  const base = getStartOfAppDay(parseISO(startDateStr))
  return addAppDays(base, offsetDays)
}
```

- [ ] **Step 1.4: Run tests to confirm they pass**

```bash
npx tsx --test lib/recurrence-utils.test.ts
```

Expected: 4 passing.

- [ ] **Step 1.5: Add test script to `package.json`**

In `package.json`, inside `"scripts"`, add after `"test:tz"`:

```json
"test:recurrence": "tsx --test lib/recurrence-utils.test.ts",
```

- [ ] **Step 1.6: Commit**

```bash
git add lib/recurrence-utils.ts lib/recurrence-utils.test.ts package.json
git commit -m "feat: add resolveRecurrenceDate helper for tag-relative date offsets"
```

---

## Task 2: Update `convertNewRecurrenceFormat`, `shouldShowRecurringEvent`, and `formatRecurrence` in `lib/recurrence-utils.ts`

**Files:**
- Modify: `lib/recurrence-utils.ts`
- Modify: `lib/recurrence-utils.test.ts`

- [ ] **Step 2.1: Add failing tests for the updated signatures**

Append to `lib/recurrence-utils.test.ts`:

```typescript
import { shouldShowRecurringEvent, formatRecurrence } from "./recurrence-utils"

const tagConfig = { tags: { s4: { startDate: "2026-01-01" } } }

test("shouldShowRecurringEvent: shows on offset day with daily recurrence", () => {
  const event = {
    recurrence: {
      type: "days",
      startTag: "s4",
      startOffset: 0,
      onPeriods: 1,
      offPeriods: 0,
      daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    },
  }
  // 2026-01-01 is a Thursday — should show on that date
  const date = new Date("2026-01-01T12:00:00Z")
  assert.equal(shouldShowRecurringEvent(event, date, false, tagConfig), true)
})

test("shouldShowRecurringEvent: hides before offset start day", () => {
  const event = {
    recurrence: {
      type: "days",
      startTag: "s4",
      startOffset: 5,
      onPeriods: 1,
      offPeriods: 0,
      daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    },
  }
  // 2026-01-01 is before offset 5 (2026-01-06)
  const date = new Date("2026-01-01T12:00:00Z")
  assert.equal(shouldShowRecurringEvent(event, date, false, tagConfig), false)
})

test("formatRecurrence: returns human label for daily event", () => {
  const event = {
    recurrence: {
      type: "days",
      startTag: "s4",
      startOffset: 0,
      onPeriods: 1,
      offPeriods: 0,
      daysOfWeek: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
    },
  }
  assert.equal(formatRecurrence(event, tagConfig), "Daily")
})
```

- [ ] **Step 2.2: Run tests to confirm they fail**

```bash
npx tsx --test lib/recurrence-utils.test.ts
```

Expected: the new tests fail because `shouldShowRecurringEvent` and `formatRecurrence` don't accept `tagConfig` yet.

- [ ] **Step 2.3: Update `convertNewRecurrenceFormat` in `lib/recurrence-utils.ts`**

Replace the existing `convertNewRecurrenceFormat` function (currently lines 106–145) with:

```typescript
function convertNewRecurrenceFormat(
  event: any,
  tagConfig: TagConfig,
): {
  startDate: Date
  periodDays: number
  onPeriods: number
  offPeriods: number
  allowedWeekdays?: string[]
  endDate?: Date
} | null {
  if (!event.recurrence) return null

  if (
    event.recurrence.startTag === undefined ||
    event.recurrence.startOffset === undefined ||
    event.recurrence.onPeriods === undefined ||
    event.recurrence.offPeriods === undefined
  ) {
    return null
  }

  let periodDays: number
  if (event.recurrence.type === "days") {
    periodDays = 1
  } else if (event.recurrence.type === "weeks") {
    periodDays = 7
  } else {
    return null
  }

  let endDate: Date | undefined
  if (event.recurrence.endOffset !== undefined) {
    endDate = normalizeToAppDay(
      resolveRecurrenceDate(event.recurrence.startTag, event.recurrence.endOffset, tagConfig),
    )
  }

  return {
    startDate: normalizeToAppDay(
      resolveRecurrenceDate(event.recurrence.startTag, event.recurrence.startOffset, tagConfig),
    ),
    periodDays,
    onPeriods: event.recurrence.onPeriods,
    offPeriods: event.recurrence.offPeriods,
    allowedWeekdays:
      event.recurrence.daysOfWeek && event.recurrence.daysOfWeek.length > 0
        ? event.recurrence.daysOfWeek
        : undefined,
    endDate,
  }
}
```

- [ ] **Step 2.4: Update `shouldShowRecurringEvent` signature**

Replace the existing `shouldShowRecurringEvent` function signature and the `convertNewRecurrenceFormat` call inside it:

```typescript
export function shouldShowRecurringEvent(
  event: any,
  date: Date,
  adminModeView = false,
  tagConfig: TagConfig = {},
): boolean {
  const dateString = formatInAppTimezone(date, "yyyy-MM-dd")

  if (!adminModeView && event.dateIncludeOverrides && event.dateIncludeOverrides[dateString] !== undefined) {
    return event.dateIncludeOverrides[dateString]
  }

  const normalizedTargetDate = normalizeToAppDay(date)

  if (event.recurrence?.startTag !== undefined && event.recurrence?.startOffset !== undefined) {
    const startDate = normalizeToAppDay(
      resolveRecurrenceDate(event.recurrence.startTag, event.recurrence.startOffset, tagConfig),
    )
    if (normalizedTargetDate.getTime() < startDate.getTime()) return false
  }

  if (event.recurrence?.endOffset !== undefined) {
    const endDate = normalizeToAppDay(
      resolveRecurrenceDate(event.recurrence.startTag, event.recurrence.endOffset, tagConfig),
    )
    if (normalizedTargetDate.getTime() > endDate.getTime()) return false
  }

  if (!event.recurrence || event.recurrence.type === "none") {
    return false
  }

  const params = convertNewRecurrenceFormat(event, tagConfig)
  if (!params) return false

  return shouldShowOnDate(
    date,
    params.startDate,
    params.periodDays,
    params.onPeriods,
    params.offPeriods,
    params.allowedWeekdays,
    params.endDate,
  )
}
```

- [ ] **Step 2.5: Update `formatRecurrence` signature**

Replace the existing `formatRecurrence` function signature and the `endDate` section inside it:

```typescript
export function formatRecurrence(event: any, tagConfig: TagConfig = {}): string | null {
  if (!event.recurrence || event.recurrence.type === "none") {
    return null
  }

  let periodDays: number
  let onPeriods: number
  let offPeriods: number
  let weekdays: string[] = []

  onPeriods = event.recurrence.onPeriods || 1
  offPeriods = event.recurrence.offPeriods || 0
  periodDays = event.recurrence.type === "days" ? 1 : 7
  weekdays = event.recurrence.daysOfWeek || []

  if (onPeriods === 1 && offPeriods === 0) {
    const baseLabel = periodDays === 1 ? "Daily" : "Weekly"
    const weekdayFilter = formatWeekdaysCompact(weekdays)
    return weekdayFilter ? `${baseLabel} on ${weekdayFilter}` : baseLabel
  }

  let label: string

  if (onPeriods === 1) {
    const total = onPeriods + offPeriods
    if (periodDays === 1) {
      label = `Every ${total} days`
    } else if (periodDays === 7) {
      label = `Every ${total} weeks`
    } else {
      label = `Every ${total} ${periodDays}-day periods`
    }
  } else {
    if (periodDays === 1) {
      label = `${onPeriods} days on, ${offPeriods} off`
    } else if (periodDays === 7) {
      label = `${onPeriods} weeks on, ${offPeriods} off`
    } else {
      label = `${onPeriods} periods on, ${offPeriods} off (${periodDays}-day period)`
    }
  }

  const weekdayFilter = formatWeekdaysCompact(weekdays)
  if (weekdayFilter) {
    label += ` on ${weekdayFilter}`
  }

  if (event.recurrence?.endOffset !== undefined && event.recurrence?.startTag) {
    try {
      const endDate = resolveRecurrenceDate(
        event.recurrence.startTag,
        event.recurrence.endOffset,
        tagConfig,
      )
      label += ` (ends ${formatInAppTimezone(endDate, "MMM d, yyyy")})`
    } catch {
      // startTag not in tagConfig — omit end date label
    }
  }

  return label
}
```

- [ ] **Step 2.6: Run tests**

```bash
npx tsx --test lib/recurrence-utils.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 2.7: Commit**

```bash
git add lib/recurrence-utils.ts lib/recurrence-utils.test.ts
git commit -m "feat: update recurrence-utils to resolve dates from tagConfig"
```

---

## Task 3: Update `Event.recurrence` interface in `hooks/use-events.ts`

**Files:**
- Modify: `hooks/use-events.ts`

- [ ] **Step 3.1: Replace the `recurrence` block in the `Event` interface**

In `hooks/use-events.ts`, locate the `recurrence` field inside the `Event` interface (currently lines 38–47). Replace it:

```typescript
  recurrence?: {
    type: "days" | "weeks" | "none"
    startTag: string
    startOffset: number
    endOffset?: number
    onPeriods: number
    offPeriods: number
    daysOfWeek: string[]
  }
```

- [ ] **Step 3.2: Verify no TypeScript errors**

```bash
cd LWSerenity && pnpm lint
```

Expected: lint passes (or only pre-existing errors unrelated to this change).

- [ ] **Step 3.3: Commit**

```bash
git add hooks/use-events.ts
git commit -m "feat: update Event.recurrence interface to startTag/startOffset fields"
```

---

## Task 4: Update `RecurrenceEditor` component

**Files:**
- Modify: `components/recurrence-editor.tsx`

The editor no longer needs `convertLegacyToNew`. It receives `tagConfig` and `activeTag` as props, uses them to convert between calendar dates and offsets, and always writes `startTag = activeTag` on date change.

- [ ] **Step 4.1: Update imports, replace `RecurrenceData` interface and `RecurrenceEditorProps`**

In `components/recurrence-editor.tsx`, the file currently imports from `"date-fns"` and `"@/lib/date-utils"`. Make these additions/changes to the import block:

```typescript
// Update the date-fns import to include differenceInDays and parseISO (parseISO may already be imported)
import { differenceInDays, parseISO } from "date-fns"
// Add to the @/lib/date-utils import: getStartOfAppDay
import { formatInAppTimezone, getStartOfAppDay } from "@/lib/date-utils"
// Add these new imports
import type { TagConfig } from "@/lib/recurrence-utils"
import { resolveRecurrenceDate } from "@/lib/recurrence-utils"
```

Then replace the interface block at lines 18–31:

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
```

- [ ] **Step 4.2: Replace `toDateOnly`, `convertLegacyToNew`, and the component body preamble**

Delete the `toDateOnly` and `convertLegacyToNew` functions entirely (lines 34–70 in the original). Replace the start of the `RecurrenceEditor` function:

```typescript
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
    recurrence.daysOfWeek = ["monday"]
  }
```

- [ ] **Step 4.3: Update the date change handlers**

Replace `handleStartDateChange` and `handleEndDateChange` and `handleClearEndDate`:

```typescript
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
```

- [ ] **Step 4.4: Update `renderStartDatePicker` and `renderEndDatePicker`**

Replace the two render helpers to use offset→date conversion for display:

```typescript
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
```

- [ ] **Step 4.5: Verify lint passes**

```bash
pnpm lint
```

Expected: passes (or only pre-existing unrelated errors).

- [ ] **Step 4.6: Commit**

```bash
git add components/recurrence-editor.tsx
git commit -m "feat: update RecurrenceEditor to use startTag/startOffset instead of absolute dates"
```

---

## Task 5: Update `event-dialog.tsx`

**Files:**
- Modify: `components/event-dialog.tsx`

- [ ] **Step 5.1: Import `useTagData`**

In `components/event-dialog.tsx`, add to the imports section:

```typescript
import { useTagData } from "@/hooks/use-tag-data"
```

- [ ] **Step 5.2: Add `tagConfig` from `useTagData` inside the component**

Inside `EventDialog`, add after the existing hooks at the top of the function body (after line `const { toast } = useToast()`):

```typescript
  const { tagConfig } = useTagData()
```

- [ ] **Step 5.3: Update the fallback object in `handleRecurrenceChange`**

Replace lines 423–431 (the fallback `newRecurrence` object) inside `handleRecurrenceChange`:

```typescript
  const handleRecurrenceChange = (recurrence: any) => {
    const newRecurrence = recurrence
      ? JSON.parse(JSON.stringify(recurrence))
      : {
          type: "none",
          daysOfWeek: ["monday"],
          onPeriods: 1,
          offPeriods: 0,
          startTag: selectedTag || activeTag,
          startOffset: 0,
        }
    setFormData((prev) => {
      const allowedDays = new Set(newRecurrence.daysOfWeek)
      return {
        ...prev,
        days: [...allowedDays],
        recurrence: newRecurrence,
      }
    })
  }
```

- [ ] **Step 5.4: Update `normalizeRecurrenceDates` and `handleSubmit` fallback**

Replace `normalizeRecurrenceDates` (lines 445–458) with a no-op passthrough — the new format needs no date normalization:

```typescript
  const normalizeRecurrenceDates = (recurrence: any) => recurrence
```

Replace the fallback object inside `handleSubmit` (lines 465–471):

```typescript
    const recurrence = normalizeRecurrenceDates(formData.recurrence) || {
      type: "none",
      daysOfWeek: formData.recurrence?.daysOfWeek || ["monday"],
      onPeriods: 0,
      offPeriods: 0,
      startTag: selectedTag || activeTag,
      startOffset: 0,
    }
```

- [ ] **Step 5.5: Pass `tagConfig` and `activeTag` to `RecurrenceEditor`**

Find the `RecurrenceEditor` usage (line 816):

```tsx
<RecurrenceEditor value={formData.recurrence} onChange={handleRecurrenceChange} isNewEvent={!isEditing} />
```

Replace with:

```tsx
<RecurrenceEditor
  value={formData.recurrence}
  onChange={handleRecurrenceChange}
  isNewEvent={!isEditing}
  tagConfig={tagConfig ?? {}}
  activeTag={selectedTag || activeTag}
/>
```

- [ ] **Step 5.6: Verify lint passes**

```bash
pnpm lint
```

- [ ] **Step 5.7: Commit**

```bash
git add components/event-dialog.tsx
git commit -m "feat: pass tagConfig and activeTag to RecurrenceEditor in event dialog"
```

---

## Task 6: Thread `tagConfig` through recurrence call sites

**Files:**
- Modify: `components/day-agenda.tsx`
- Modify: `components/read-only-day-agenda.tsx`
- Modify: `components/email-generator.tsx`
- Modify: `components/reminders.tsx`
- Modify: `components/event-card.tsx`
- Modify: `components/events-view.tsx`

All six components follow the same pattern: import `useTagData`, call it inside the component, pass `tagConfig` to `shouldShowRecurringEvent` or `formatRecurrence`.

- [ ] **Step 6.1: Update `components/day-agenda.tsx`**

Add import:
```typescript
import { useTagData } from "@/hooks/use-tag-data"
```

Inside `DayAgenda`, add after `const { diffIndex } = useOverrideDiff()`:
```typescript
  const { tagConfig } = useTagData()
```

Update the `shouldShowRecurringEvent` call (line 91):
```typescript
      return shouldShowRecurringEvent(event, date, true, tagConfig ?? {})
```

- [ ] **Step 6.2: Update `components/read-only-day-agenda.tsx`**

Add import:
```typescript
import { useTagData } from "@/hooks/use-tag-data"
```

Near the top of the component body, add:
```typescript
  const { tagConfig } = useTagData()
```

Find the line containing `shouldShowRecurringEvent(event, date, false)` (around line 63) and update it:
```typescript
      const shouldShow = !event.archived && shouldShowRecurringEvent(event, date, false, tagConfig ?? {})
```

- [ ] **Step 6.3: Update `components/email-generator.tsx`**

Add import:
```typescript
import { useTagData } from "@/hooks/use-tag-data"
```

Near the top of the component body, add:
```typescript
  const { tagConfig } = useTagData()
```

Find the two `shouldShowRecurringEvent` calls (lines ~204 and ~255) and add `tagConfig ?? {}` as the fourth argument to each:
```typescript
// Line ~204 — inside the date range loop
if (shouldShowRecurringEvent(event, currentDate, false, tagConfig ?? {})) {

// Line ~255 — in the filter
return shouldShowRecurringEvent(event, currentDate, false, tagConfig ?? {}) && shouldIncludeEventForDate(event, currentDate)
```

- [ ] **Step 6.4: Update `components/reminders.tsx`**

Add import:
```typescript
import { useTagData } from "@/hooks/use-tag-data"
```

Inside the component, destructure `tagConfig` from `useTagData()`. The `shouldShowRecurringEvent` call is inside `shouldIncludeEventOnDate` which is defined outside the component. Change the approach: move `shouldIncludeEventOnDate` inside the component (it already takes `event`/`date`/`dayKey` params), or pass `tagConfig` as a fourth argument.

Simplest: convert `shouldIncludeEventOnDate` to accept `tagConfig` as a fourth parameter and update the call site:

```typescript
const shouldIncludeEventOnDate = (
  event: any,
  date: Date,
  dayKey: string,
  tagConfig: Record<string, unknown>,
): boolean => {
  if (!event || event.archived) return false
  if (!shouldShowRecurringEvent(event, date, false, tagConfig as any)) {
    return false
  }
  // ... rest of function unchanged
}
```

Inside the component, add `const { tagConfig } = useTagData()` and update all calls to `shouldIncludeEventOnDate` to pass `tagConfig ?? {}`.

- [ ] **Step 6.5: Update `components/event-card.tsx`**

Add import:
```typescript
import { useTagData } from "@/hooks/use-tag-data"
```

Inside the component where `formatRecurrence` is called, add `const { tagConfig } = useTagData()` near the top. Update both calls (lines 529 and 531):

```tsx
{formatRecurrence(event, tagConfig ?? {}) && (
  <div className="text-xs text-primary/70 mt-1 flex items-center">
    <span className="mr-1">↻</span> {formatRecurrence(event, tagConfig ?? {})}
  </div>
)}
```

- [ ] **Step 6.6: Update `components/events-view.tsx`**

Add import:
```typescript
import { useTagData } from "@/hooks/use-tag-data"
```

Inside the component, add `const { tagConfig } = useTagData()` and update both `formatRecurrence` calls (lines 520 and 522) to pass `tagConfig ?? {}`.

- [ ] **Step 6.7: Verify lint passes**

```bash
pnpm lint
```

Expected: passes.

- [ ] **Step 6.8: Commit**

```bash
git add components/day-agenda.tsx components/read-only-day-agenda.tsx components/email-generator.tsx components/reminders.tsx components/event-card.tsx components/events-view.tsx
git commit -m "feat: thread tagConfig through all recurrence display call sites"
```

---

## Task 7: Build the migration tool

**Files:**
- Create: `scripts/migrate-dates.ts`
- Create: `scripts/migrate-dates.test.ts`

- [ ] **Step 7.1: Create the test file for pure conversion logic**

Create `scripts/migrate-dates.test.ts`:

```typescript
import { strict as assert } from "node:assert"
import { test } from "node:test"
import { computeOffset, convertEventRecurrence, addTagsBlock } from "./migrate-dates"

test("computeOffset: returns 0 when event date equals tag startDate", () => {
  assert.equal(computeOffset("2026-01-01", "2026-01-01"), 0)
})

test("computeOffset: returns positive offset for later date", () => {
  assert.equal(computeOffset("2026-01-06", "2026-01-01"), 5)
})

test("computeOffset: returns negative offset for earlier date", () => {
  assert.equal(computeOffset("2025-12-27", "2026-01-01"), -5)
})

test("convertEventRecurrence: converts startDate to startTag + startOffset", () => {
  const event = {
    id: "abc",
    recurrence: { type: "days", startDate: "2026-01-06", onPeriods: 1, offPeriods: 0 },
  }
  const result = convertEventRecurrence(event, "s4", "2026-01-01")
  assert.equal(result.recurrence.startTag, "s4")
  assert.equal(result.recurrence.startOffset, 5)
  assert.equal(result.recurrence.startDate, undefined)
})

test("convertEventRecurrence: converts endDate to endOffset", () => {
  const event = {
    id: "abc",
    recurrence: { type: "days", startDate: "2026-01-06", endDate: "2026-02-05", onPeriods: 1, offPeriods: 0 },
  }
  const result = convertEventRecurrence(event, "s4", "2026-01-01")
  assert.equal(result.recurrence.endOffset, 35)
  assert.equal(result.recurrence.endDate, undefined)
})

test("convertEventRecurrence: skips events already in new format", () => {
  const event = {
    id: "abc",
    recurrence: { type: "days", startTag: "s4", startOffset: 5, onPeriods: 1, offPeriods: 0 },
  }
  const result = convertEventRecurrence(event, "s4", "2026-01-01")
  assert.deepEqual(result, event) // unchanged
})

test("convertEventRecurrence: returns event unchanged if no recurrence", () => {
  const event = { id: "abc", title: "No recurrence" }
  const result = convertEventRecurrence(event, "s4", "2026-01-01")
  assert.deepEqual(result, event)
})

test("addTagsBlock: adds tags block when missing", () => {
  const conf = { parent: "main", brand: { name: "Test" } }
  const result = addTagsBlock(conf, "s4", "2026-01-01")
  assert.deepEqual(result.tags, { s4: { startDate: "2026-01-01" } })
})

test("addTagsBlock: does not overwrite existing tags block", () => {
  const conf = { tags: { s4: { startDate: "2025-06-01" } } }
  const result = addTagsBlock(conf, "s4", "2026-01-01")
  assert.equal(result.tags.s4.startDate, "2025-06-01") // preserved
})
```

- [ ] **Step 7.2: Run tests to confirm they fail**

```bash
npx tsx --test scripts/migrate-dates.test.ts
```

Expected: error — module not found.

- [ ] **Step 7.3: Create `scripts/migrate-dates.ts` with exported pure functions and the CLI entry point**

Create `scripts/migrate-dates.ts`:

```typescript
#!/usr/bin/env node
/**
 * One-time migration: convert all events.json files from absolute recurrence.startDate
 * to tag-relative startTag + startOffset, and ensure conf.json has a tags block.
 *
 * Run: npx tsx scripts/migrate-dates.ts
 */

import * as fs from "node:fs"
import * as path from "node:path"
import * as readline from "node:readline"
import { differenceInDays, parseISO } from "date-fns"

// ---------------------------------------------------------------------------
// Pure functions (exported for testing)
// ---------------------------------------------------------------------------

export function computeOffset(eventDateStr: string, tagStartDateStr: string): number {
  return differenceInDays(parseISO(eventDateStr), parseISO(tagStartDateStr))
}

export function convertEventRecurrence(
  event: any,
  tagName: string,
  tagStartDate: string,
): any {
  if (!event?.recurrence) return event
  const r = event.recurrence

  // Already converted — skip
  if (r.startTag !== undefined || r.startOffset !== undefined) return event

  // No startDate to convert — skip
  if (!r.startDate) return event

  const { startDate, endDate, ...rest } = r
  const converted: any = {
    ...rest,
    startTag: tagName,
    startOffset: computeOffset(startDate, tagStartDate),
  }
  if (endDate) {
    converted.endOffset = computeOffset(endDate, tagStartDate)
  }

  return { ...event, recurrence: converted }
}

export function addTagsBlock(
  conf: any,
  tagName: string,
  startDate: string,
): any {
  if (conf?.tags?.[tagName]?.startDate) {
    // Already has a startDate for this tag — preserve it
    return conf
  }
  return {
    ...conf,
    tags: {
      ...(conf.tags ?? {}),
      [tagName]: { startDate },
    },
  }
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

async function prompt(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve))
}

function isValidDate(str: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(str) && !isNaN(parseISO(str).getTime())
}

async function run() {
  const confDir = path.resolve("public/conf")
  if (!fs.existsSync(confDir)) {
    console.error(`Directory not found: ${confDir}`)
    process.exit(1)
  }

  const tagDirs = fs
    .readdirSync(confDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })

  // Phase 1: collect missing startDates via prompts before writing anything
  const startDates: Record<string, string> = {}
  for (const tagName of tagDirs) {
    const confPath = path.join(confDir, tagName, "conf.json")
    if (!fs.existsSync(confPath)) continue
    const conf = JSON.parse(fs.readFileSync(confPath, "utf-8"))
    const existing = conf?.tags?.[tagName]?.startDate
    if (existing) {
      startDates[tagName] = existing
    } else {
      let input = ""
      while (!isValidDate(input)) {
        input = await prompt(rl, `Enter startDate for tag "${tagName}" (YYYY-MM-DD): `)
        if (!isValidDate(input)) console.log("  Invalid date, try again.")
      }
      startDates[tagName] = input
    }
  }

  rl.close()

  // Phase 2: write conf.json and events.json for each tag
  for (const tagName of tagDirs) {
    const tagDir = path.join(confDir, tagName)
    const confPath = path.join(tagDir, "conf.json")
    const eventsPath = path.join(tagDir, "events.json")
    const startDate = startDates[tagName]

    // Update conf.json
    if (fs.existsSync(confPath)) {
      const conf = JSON.parse(fs.readFileSync(confPath, "utf-8"))
      const updated = addTagsBlock(conf, tagName, startDate)
      if (JSON.stringify(updated) !== JSON.stringify(conf)) {
        fs.writeFileSync(confPath, JSON.stringify(updated, null, 2) + "\n")
        console.log(`  Updated conf.json for ${tagName}`)
      }
    }

    // Update events.json
    if (fs.existsSync(eventsPath)) {
      const payload = JSON.parse(fs.readFileSync(eventsPath, "utf-8"))
      const events: any[] = Array.isArray(payload) ? payload : (payload.events ?? [])
      const converted = events.map((e) => convertEventRecurrence(e, tagName, startDate))
      const changed = JSON.stringify(converted) !== JSON.stringify(events)
      if (changed) {
        const output = Array.isArray(payload)
          ? converted
          : { ...payload, events: converted }
        fs.writeFileSync(eventsPath, JSON.stringify(output, null, 2) + "\n")
        console.log(`  Updated events.json for ${tagName}`)
      }
    }
  }

  console.log("\nMigration complete.")
}

// Only run CLI when executed directly
import { fileURLToPath } from "node:url"
const __filename = fileURLToPath(import.meta.url)
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  run().catch((err) => {
    console.error(err)
    process.exit(1)
  })
}
```

- [ ] **Step 7.4: Add test script to `package.json`**

In `package.json` scripts, add:

```json
"test:migrate": "tsx --test scripts/migrate-dates.test.ts",
```

- [ ] **Step 7.5: Run tests to confirm they pass**

```bash
npx tsx --test scripts/migrate-dates.test.ts
```

Expected: 8 passing tests.

- [ ] **Step 7.6: Commit**

```bash
git add scripts/migrate-dates.ts scripts/migrate-dates.test.ts package.json
git commit -m "feat: add migration tool to convert recurrence dates to tag-relative offsets"
```

---

## Task 8: Run migration and verify

**Files:**
- Modify: `public/conf/*/conf.json` (written by tool)
- Modify: `public/conf/*/events.json` (written by tool)

- [ ] **Step 8.1: Run the migration tool**

From `LWSerenity/`:

```bash
npx tsx scripts/migrate-dates.ts
```

The tool will prompt for `startDate` for any tags missing them. Enter the correct dates for each tag as prompted. Tags that already have `tags[tagName].startDate` in their conf.json will be processed silently.

- [ ] **Step 8.2: Verify the output files look correct**

Spot-check a few converted files. For example, `public/conf/s4/events.json` should have `startTag: "s4"` and `startOffset: N` (integer) on all events that previously had `recurrence.startDate`. No event should still have a `recurrence.startDate` string.

- [ ] **Step 8.3: Run lint**

```bash
pnpm lint
```

Expected: passes.

- [ ] **Step 8.4: Start dev server and do a manual smoke test**

```bash
pnpm dev
```

Open `http://localhost:3000` and verify:
- Events display on the correct days
- Admin mode: opening an event's edit dialog shows the correct calendar date in the recurrence start date picker
- Changing the date in the editor and saving stores the new `startTag`/`startOffset` in local overrides

- [ ] **Step 8.5: Commit migrated files**

```bash
git add public/conf/
git commit -m "chore: migrate all event recurrence dates to tag-relative startOffset format"
```

---

## Completion Checklist

- [ ] `resolveRecurrenceDate` exported and tested
- [ ] `shouldShowRecurringEvent` and `formatRecurrence` accept `tagConfig`
- [ ] `Event.recurrence` interface uses `startTag`/`startOffset`/`endOffset`
- [ ] `RecurrenceEditor` uses offset↔date conversion; `convertLegacyToNew` removed
- [ ] `event-dialog.tsx` passes `tagConfig` and effective `activeTag` to editor
- [ ] All 6 display components thread `tagConfig` through
- [ ] Migration tool converts all conf and events files
- [ ] `pnpm lint` passes
- [ ] Manual smoke test confirms correct date display and editing

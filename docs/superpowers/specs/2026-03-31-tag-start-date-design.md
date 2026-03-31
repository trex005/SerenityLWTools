# Tag-Relative Start Dates Design

**Date:** 2026-03-31
**Status:** Approved

## Overview

Replace absolute ISO date strings in event recurrence (`recurrence.startDate`) with tag-relative integer offsets (`startOffset`). Each tag declares its own anchor date (`startDate`) in `conf.json`. Events store their schedule start as a number of days from their owning tag's anchor. Children can override ancestor anchor dates via the existing `deepMerge` config chain.

A one-time migration tool converts all existing events before deployment. No legacy fallback is needed at runtime.

---

## Data Structures

### `conf.json` — `tags` block

Each tag adds a `tags` object keyed by tag name. The active tag always names itself. A child tag can also override an ancestor's `startDate` by including that ancestor's name as an additional key.

```json
// s4/conf.json
{
  "parent": "main",
  "tags": { "s4": { "startDate": "2026-01-01" } },
  "brand": { "name": "LW Season 4", "favicon": "/conf/main/favicon.ico" }
}

// 996/conf.json
{
  "parent": "s4",
  "tags": { "996": { "startDate": "2026-01-01" } },
  "brand": { "name": "Server 996", "favicon": "/conf/996/favicon.ico" }
}

// serenity996/conf.json — overrides s4's startDate for viewers of this tag
{
  "parent": "996",
  "tags": {
    "serenity996": { "startDate": "2024-10-10" },
    "s4": { "startDate": "2024-10-10" }
  },
  "brand": { "name": "Serenity", "favicon": "/conf/serenity996/favicon.ico" }
}
```

`deepMerge` already handles this — child `tags` entries override ancestor entries with no new merge logic needed.

### Event recurrence fields

`recurrence.startDate` (absolute ISO string) and `recurrence.endDate` are replaced:

| Old field | New field | Type | Description |
|---|---|---|---|
| `recurrence.startDate` | `recurrence.startOffset` | `number` | Days after `tags[startTag].startDate` |
| `recurrence.endDate` | `recurrence.endOffset` | `number` (optional) | Days after `tags[startTag].startDate` |
| _(new)_ | `recurrence.startTag` | `string` | Tag name whose `startDate` is the anchor |

```json
{
  "id": "abc",
  "recurrence": {
    "type": "days",
    "startTag": "s4",
    "startOffset": 5,
    "endOffset": 35,
    "onPeriods": 1,
    "offPeriods": 0,
    "daysOfWeek": ["monday", "tuesday", "wednesday"]
  }
}
```

#### `startTag` + `startOffset` atomicity constraint

These two fields are always written together. Updating one without the other produces incorrect dates. The admin save path and recurrence editor must enforce this.

#### Multi-level override chain

Each layer that changes the recurrence start date writes both `startTag` (set to that layer's own tag name) and `startOffset` (relative to that layer's `startDate`). `deepMerge` replaces both atomically.

```json
// s4/events.json
{ "id": "abc", "recurrence": { "startTag": "s4", "startOffset": 5 } }

// 996/events.json — 996 admin overrides the date
{ "id": "abc", "recurrence": { "startTag": "996", "startOffset": 3 } }

// serenity996/events.json — serenity996 admin overrides again
{ "id": "abc", "recurrence": { "startTag": "serenity996", "startOffset": 7 } }

// resolved for serenity996 viewer → startTag: "serenity996", startOffset: 7 ✓
```

---

## One-Time Migration Tool

**Location:** `scripts/migrate-dates.ts`

**Purpose:** Convert all `recurrence.startDate` / `recurrence.endDate` fields in every tag's `events.json` to the new `startTag` / `startOffset` / `endOffset` fields. Also adds the `tags` block to any `conf.json` that is missing it.

**Algorithm:**

1. Scan `public/conf/` for all tag directories (each directory with a `conf.json`, including archived ones such as `archive-2025-11-30` — they are converted for consistency)
2. For each tag, read `conf.json`
3. If `tags[tagName].startDate` is missing:
   - Prompt: `"Enter startDate for tag '<tagName>' (YYYY-MM-DD): "`
   - Validate format; re-prompt on invalid input
4. Collect all prompts before writing any files
5. For each tag, read `events.json`
6. For each event with `recurrence.startDate` present:
   - Compute `startOffset = dayDiff(recurrence.startDate, tags[tagName].startDate)`
   - Compute `endOffset = dayDiff(recurrence.endDate, tags[tagName].startDate)` if `endDate` present
   - Set `recurrence.startTag = tagName`
   - Replace `startDate` → `startOffset`, `endDate` → `endOffset`
7. Write `conf.json` and `events.json` back (only files that changed)
8. Events already in the new format (`startOffset` present) are skipped — tool is idempotent

**Day diff:** Uses `differenceInDays` from `date-fns` (already in the project). No new packages.

**Usage:** Run once before deploying the updated app. Commit the resulting file changes.

```bash
npx tsx scripts/migrate-dates.ts
```

---

## Runtime Resolution

**Location:** `lib/recurrence-utils.ts` — `convertNewRecurrenceFormat`

```
actualStartDate = tagConfig.tags[event.recurrence.startTag].startDate + startOffset
actualEndDate   = tagConfig.tags[event.recurrence.startTag].startDate + endOffset  (if present)
```

`tagConfig` is the fully resolved (deep-merged) config for the active tag, already available via `useTagData`. No ancestry walk needed at runtime.

The `tagConfig` is threaded through to `convertNewRecurrenceFormat` as a new parameter. All call sites (`shouldShowRecurringEvent`, `formatRecurrence`) pass it through.

---

## Admin UI & Save Path

### Recurrence editor (`recurrence-editor.tsx`)

No visible change to the user. The date picker continues to show and accept calendar dates.

- **Display:** `displayDate = tagConfig.tags[startTag].startDate + startOffset`
- **On date change:** `startOffset = dayDiff(pickedDate, tagConfig.tags[activeTag].startDate)`, `startTag = activeTag`

The `RecurrenceData` interface gains `startTag: string` and `startOffset: number` / `endOffset?: number`, replacing `startDate: string` / `endDate?: string`. The `convertLegacyToNew` function in the editor is removed — all events are in the new format post-migration.

### Save path

`saveEventForTag` in `tag-overrides.ts` requires no special handling. The event object already carries the correct `startTag` and `startOffset` from the editor.

### Export (`buildChildDeltaFiles`)

`computeDelta` naturally includes both `startTag` and `startOffset` in the delta whenever the date changes. No changes needed.

---

## Files to Change

| File | Change |
|---|---|
| `lib/recurrence-utils.ts` | Replace `parseISO(startDate)` with tag-relative resolution; accept `tagConfig` param |
| `components/recurrence-editor.tsx` | Update `RecurrenceData` interface; convert date↔offset in handlers; accept `tagConfig` prop |
| `hooks/use-events.ts` | Update `Event.recurrence` interface |
| `scripts/migrate-dates.ts` | New file — migration tool |
| `public/conf/*/conf.json` | Add `tags` block (written by migration tool) |
| `public/conf/*/events.json` | Convert `startDate`→`startOffset`, add `startTag` (written by migration tool) |

Call sites that pass recurrence data to `shouldShowRecurringEvent` or `formatRecurrence` will need to thread `tagConfig` through. Known call sites: `components/event-card.tsx`, `components/day-agenda.tsx`, `components/read-only-day-agenda.tsx`, `components/email-generator.tsx`, `components/reminders.tsx`.

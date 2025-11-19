# Changelog

All notable changes to this project will be documented in this file.

## 2025-11-19

### Changed
- **Unified Event Files**: Removed `events_archive.json` handling across config fetching, admin exports, and stored data so archived entries live inside `events.json` with `archived: true`. Migrated all seeded configs to the single-file format.

## 2025-10-28

### Added
- **Tag-Aware Config Loader**: Introduced `lib/config-fetcher` along with `lib/config-tag` and `lib/scoped-storage` to resolve configurations by URL tag or domain, splitting data into `config/events/events_archive/tips` per tag and recording each file's `updated` timestamp.
- **Scoped Client Storage**: Namespaced all localStorage usage (events, tips, admin state, UI preferences) so data is isolated per configuration tag.
- **Serenity Config Seed**: Imported the legacy Serenity backup into `public/conf/serenity/` with dedicated `config.json`, `events.json`, `events_archive.json`, and `tips.json` files.
- **ESLint Baseline**: Added `.eslintrc.json` and installed the Next.js ESLint config to enable `npm run lint`.

### Fixed
- **Config Export Includes Parent**: Child-delta export now writes the leaf tag's `config.json` with all tag-specific keys including `"parent"` and a fresh `updated` value (`lib/config-fetcher.ts`).
- **Admin Local Edits Persist**: Event/tip stores now load from tag-scoped localStorage first and only fall back to config when needed, ensuring admin changes are not overwritten on reload (`hooks/use-events.ts`, `hooks/use-tips.ts`, `components/storage-initializer.tsx`).

### Changed
- **Config Layout**: Replaced the monolithic `public/config-init.json` with the new `public/conf/{tag}/` folder structure and root `public/conf/default.json` domain map.
- **Hooks & Admin Tools**: Updated config and data management hooks plus admin UI components to consume the new bundle format without altering their external APIs.
- **Event Inclusion Controls**: Grouped Scheduled/Website/Briefing/Reminder toggles in the event editor, introduced a dedicated website flag, and kept scheduling as the master gate for all downstream surfaces.
- **Reminders Admin Tab**: Added a dedicated regenerate control, persisted textarea content to scoped localStorage per day, filtered out archived/hidden events, and ensured tomorrow's times respect per-date overrides.

## 2025-10-02

### Added
- **Repository Guidelines**: Documented contributor expectations in `AGENTS.md`, covering structure, tooling, testing, and deployment practices.
- **Event End Dates**: Added optional inclusive end-date support across scheduling logic and the admin editor.
- **Documentation Maintenance Rule**: Required every new feature or bug fix to update `AGENTS.md` or explain why no change is needed.

### Changed
- **Changelog Ordering**: Clarified that entries are grouped by date with newest releases first.
- **Recurring Schedules**: Updated recurrence calculations and date filtering to respect inclusive start/end spans.

## 2025-09-10

### Changed
- **Simplified Date Controls**: Completely replaced complex calendar components with native HTML date inputs
  - **Date Range Selector**: Clean button-based interface with native date inputs for custom ranges
    - Streamlined to just "Today", "Next 3 days", and "Custom" options
    - Default view changed from 7 days to 3 days for better focus
- **Enhanced Regenerate Agenda Dialog**: Added "Remember this decision" functionality
  - New checkbox to remember user's choice (regenerate or keep current content)
  - Remembered decisions are automatically applied on future date changes
  - Reset option available in Command tab to clear the remembered setting
  - Improves workflow by reducing repetitive dialog confirmations
- **Fixed Server Import Issue**: Server-loaded events now properly preserve reminder field data
  - Server initialization now uses the same import logic as manual import
  - Ensures `remindTomorrow` and `remindEndOfDay` fields are preserved from config-init.json
  - Fixed inconsistency between manual import (working) and server import (not working)
    - Custom option uses simple date inputs instead of complex calendar widget
    - Navigation arrows work when complete range is selected
    - Clean horizontal layout with date display
  - **Reminders Date Picker**: Replaced calendar popover with simple date input field
  - **Removed Dependencies**: No longer uses react-day-picker or complex calendar styling
  - **Better UX**: Native date inputs provide consistent, familiar interface across all devices

### Added
- **Simplified Reminders Feature**: Streamlined reminder functionality for events/operations
  - Two simple checkboxes: "Remind previous day" and "Remind at end of day"
  - New "Reminders" tab in admin/command mode only
  - Date selector to view reminders for any day
  - Editable textarea showing formatted reminders list
  - Copy-to-clipboard functionality for reminders
  - Smart time formatting: "Reset in X hours Y minutes!" (omits zero values)
  - Unified format: "Time-Name" or "• Name" for both reminder types
  - Full import/export support for reminder fields
  - Character counter (500 character limit) with visual feedback
- **Smart Time Display**: 
  - Events with times: "09:00-Event Name"
  - Events without times or all-day events: "• Event Name"
  - Proper handling of `isAllDay: true` events (ignores startTime if present)
  - Tomorrow's reminders appear in "Tomorrow:" section
  - End-of-day reminders appear in "Reminders:" section (only if present)

### Changed
- **Unified timezone handling**: Consolidated all UTC-2 date handling into a single `getAppTimezoneDate()` function in `lib/date-utils.ts`
- **Generalized function naming**: Renamed `getUtcMinus2Date()` to `getAppTimezoneDate()` for better maintainability
- **Centralized timezone configuration**: App timezone can now be changed in one location by modifying the `timezoneOffsetHours` variable
- **Event interface**: Added `remindTomorrow?: boolean` and `remindEndOfDay?: boolean` fields to Event type
- **User interface**: Removed Reminders tab from user mode (admin/command mode only)

### Removed
- Duplicate UTC-2 date calculation code from multiple components:
  - `components/date-range-selector.tsx`
  - `components/user-interface.tsx` 
  - `components/admin-interface.tsx`
  - `components/email-generator.tsx`

### Technical Details
- All components now import and use `getAppTimezoneDate()` from `@/lib/date-utils`
- Timezone offset is configurable via `timezoneOffsetHours` constant (-2 for UTC-2)
- Function provides consistent timezone handling across the entire application
- New `getMinutesUntilNextDay()` and `formatTimeRemaining()` functions for time calculations
- Reminders component uses recurring event logic to properly display daily reminders
- Event creation/editing forms simplified to two checkboxes instead of complex text fields
- Smart `isAllDay` handling prevents time display conflicts in reminder formatting

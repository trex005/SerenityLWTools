# Changelog

All notable changes to this project will be documented in this file.

## 2025-09-10

### Added
- **Reminders Feature**: New reminder functionality for events/operations
  - Optional `reminder` text field added to all events
  - New "Reminders" tab in both user and admin interfaces
  - Date selector to view reminders for any day
  - Editable textarea showing formatted reminders list
  - Copy-to-clipboard functionality for reminders
  - "Reset in X minutes!" countdown showing minutes until next day (rounded to nearest 5)
  - Reminders listed in same order as daily operations
  - Full import/export support for reminder field
  - Character counter (500 character limit) with visual feedback
- **Previous Day Reminders**: Advanced reminder scheduling
  - Optional "Remind on previous day" checkbox for events
  - Tomorrow's events appear in today's reminders when enabled
  - Format: "[Start Time] Event Name" for tomorrow's reminders
  - Events without start times appear at bottom of tomorrow's list
  - Tomorrow reminders appear above regular reminders in textarea

### Changed
- **Unified timezone handling**: Consolidated all UTC-2 date handling into a single `getAppTimezoneDate()` function in `lib/date-utils.ts`
- **Generalized function naming**: Renamed `getUtcMinus2Date()` to `getAppTimezoneDate()` for better maintainability
- **Centralized timezone configuration**: App timezone can now be changed in one location by modifying the `timezoneOffsetHours` variable
- **Event interface**: Added optional `reminder?: string` and `remindOnPreviousDay?: boolean` fields to Event type

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
- New `getMinutesUntilNextDay()` function calculates countdown with 5-minute rounding
- Reminders component uses recurring event logic to properly display daily reminders
- Event creation/editing forms now include reminder field with auto-resizing textarea
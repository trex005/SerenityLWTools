# Changelog

All notable changes to this project will be documented in this file.

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
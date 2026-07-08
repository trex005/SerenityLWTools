# LWSerenity AWS Rewrite Design Document

## 1. Purpose

This document describes a from-scratch replacement for LWSerenity using AWS.

The new system should provide a backend API first. A web frontend should be built against that API, with the option to add a mobile app frontend later.

For low-cost read delivery, normal resolved reads may also be served from materialized JSON files in S3 or CloudFront. In that model, the API remains responsible for writes, validation, protected admin behavior, previews, and rebuilding resolved read files.

The system will support reusable event schedules, tips, reports, branding, users, permissions, and inherited group-specific views.

### 1.1 Decision Process

Minor implementation decisions that have minimal user experience impact may be decided during specification updates without pausing for approval.

Examples include:

- field ordering in JSON examples
- exact wording of debug-only metadata
- choosing a conventional hash algorithm when the architecture already requires a hash
- small naming clarifications that do not change public URLs, permissions, or data ownership
- cache/deployment plumbing needed to support already-approved cache behavior
- write/rebuild consistency mechanics that preserve already-approved save semantics

Decisions should still be discussed before they materially affect:

- user-facing workflows
- public URL shapes
- permissions or security boundaries
- source or resolved data ownership
- cache behavior visible to users
- AWS cost or operational complexity
- migration difficulty

## 2. Main Object Types

The system has four main object types:

- Groups
- Users
- Events
- Tips

There is also a reusable Text object used by events, tips, and branding.

## 3. Terminology

### Common Data Conventions

Unless a section says otherwise:

- Timestamps should be UTC ISO-8601 strings with a `Z` suffix.
- Dates should use `YYYY-MM-DD`.
- Times should use 24-hour `HH:MM`.
- Generated UUIDs should use lowercase canonical UUID text.
- New generated object IDs and write IDs should use UUIDv7.
- Examples may use readable placeholder IDs such as `event-123`.
- JSON files should be UTF-8 encoded.
- Public JSON should use `Content-Type: application/json; charset=utf-8`.
- JSON object field order should not be semantically meaningful.

Canonical JSON used for content hashing should be deterministic:

- sort object keys lexicographically
- preserve array order
- use UTF-8
- omit insignificant whitespace
- use the exact generated values that will be written to S3

Human-authored source JSON does not need to be manually sorted, but generated files should be stable so unchanged content produces unchanged hashes.

Generated arrays should use stable ordering:

- events and tips by UUID unless a specific view requires another order
- tag and text index UUID lists by UUID
- domain map entries by normalized lookup value
- dependency lists by group ID
- audit object references by type then UUID

### Group

A group is the main inheritance and view object.

Examples:

- General
- Holidays
- Season1
- Season2
- Server1
- Server2
- Alliance1
- Alliance2

### Tags

Events and tips may have searchable tags.

### Current Group

The current group is the group the user is actively viewing or editing.

All writes happen only to the current group.

If a user has access to multiple groups, the UI should let the user switch to the group they want to view or edit.

### Source Object

A source object is the raw object stored directly inside one group.

Example:

- The version of Event1 stored in group_id "General"
- The override for Event1 stored in group_id "Alliance1"

### Resolved Object

A resolved object is the final object after all inheritance and deep merging has been applied for the current group.

This is what normal users see.

### Effective Start Date

The effective start date is the start date a group uses while being resolved in a specific inheritance context.

A parent group can be resolved with a different start date when inherited by another group.

## 4. High-Level System Behavior

Each group defines its own content and may inherit from other groups.

When a group is viewed, the backend resolves the group by:

1. Resolving each parent group completely.
2. Deep merging the resolved parents in order.
3. Deep merging the current group’s own objects last.
4. Returning the final resolved view.

This allows shared content to be defined once and customized later.

Example use cases:

- General defines a common event.
- Season1 changes the title or date.
- Server1 changes the start date used for Season1.
- Holidays disables the event on specific dates.
- Alliance1 overrides the title for its own alliance.

## 5. Group Inheritance

### 5.1 Merge Stack

Each group has a `merge_stack`.

The merge stack is an ordered list of parent groups to inherit from.

Groups are merged in listed order.

Later groups override earlier groups.

The current group is merged last.

Example:

```json
{
  "group_id": "Alliance1",
  "start_date": "2026-01-01",
  "merge_stack": [
    {
      "group_id": "Server1",
      "start_date": "2026-01-01"
    },
    {
      "group_id": "Holidays"
    }
  ]
}
```

Resolution order:

```text
Server1 resolves itself completely using the override start date.
Holidays resolves itself completely.
Holidays result is merged over Server1.
Alliance1 is merged last.
```

### 5.2 Parent Resolution Rule

Each parent group must fully resolve itself before returning data to the child group.

A child group does not need to know the parents of its parents.

Example:

```text
Alliance1 inherits from Server1.
Server1 inherits from Season1.
Season1 inherits in order from General and Holiday.

Alliance1 does not need to know about Season1, General, or Holiday.
Alliance1 only asks Server1 for its resolved result.
```

This allows infinite nesting as long as circular inheritance is prevented.

### 5.3 Circular Inheritance

The backend must prevent circular inheritance.

Invalid examples:

```text
Alliance1 inherits from Server1.
Server1 inherits from Alliance1.
```

```text
A inherits from B.
B inherits from C.
C inherits from A.
```

The resolver should track the group IDs currently being resolved. If it sees the same group twice in the same chain, it should stop and return a validation error.

### 5.4 Date Scope on Parent References

A parent reference may include a date scope.

Parent references can include:

- group_id
- start_date
- duration_days

Example:

```json
{
  "group_id": "Season1",
  "start_date": "2026-01-01",
  "duration_days": 40
}
```

When resolving with a date scope:

- A parent outside the requested date range is ignored.
- A parent inside the requested date range is resolved normally.
- A parent start_date override is used as that parent’s effective start date in this context.
- The parent fully resolves itself before returning.

### 5.5 Current Group Should Not Be Inside Its Own Merge Stack

The current group should store its own:

- group_id
- start_date
- duration_days

The current group should not need to list itself inside `merge_stack`.

This avoids duplicate data and prevents conflicts where the top-level start date and self-listed start date disagree.

## 6. Deep Merge Rules

All inherited objects use ordered deep merge inheritance.

### 6.1 General Deep Merge Rule

When merging two objects:

- Objects merge recursively.
- Primitive values replace earlier values.
- Arrays replace earlier arrays.
- `null` is a real value and replaces earlier values.
- Missing keys do not replace earlier values.
- Events merge by `uuid`.
- Tips merge by `uuid`.
- Later groups override earlier groups.
- The current group overrides all inherited groups.

### 6.2 Primitive Values

Primitive values include:

- strings
- numbers
- booleans
- null

Example:

```json
{
  "title": "Old Title"
}
```

merged with:

```json
{
  "title": "New Title"
}
```

becomes:

```json
{
  "title": "New Title"
}
```

### 6.3 Null Values

`null` means intentionally overwrite the inherited value with empty/no value.

Example:

```json
{
  "favicon": "favicon-a.ico"
}
```

merged with:

```json
{
  "favicon": null
}
```

becomes:

```json
{
  "favicon": null
}
```

### 6.4 Missing Keys

A missing key does not overwrite anything.

Example:

```json
{
  "title": "Original Title",
  "description": "Original Description"
}
```

merged with:

```json
{
  "title": "New Title"
}
```

becomes:

```json
{
  "title": "New Title",
  "description": "Original Description"
}
```

### 6.5 Arrays

Arrays replace earlier arrays.

Example:

```json
{
  "tags": ["season", "daily"]
}
```

merged with:

```json
{
  "tags": ["alliance"]
}
```

becomes:

```json
{
  "tags": ["alliance"]
}
```

If append behavior is ever needed, it should be added as a separate explicit feature later. The default should remain replacement.

### 6.6 Events and Tips

Events and tips are matched by `uuid`.

If two groups define an event with the same `uuid`, those event objects are deep merged.

If a group defines an event with a new `uuid`, that event is added.

The same rule applies to tips.

## 7. Enabled and Disabled Objects

Events and tips include an `enabled` boolean.

### 7.1 Enabled

If `enabled` is true or missing, the event or tip is active unless overridden later.

Recommended default:

```text
enabled defaults to true.
```

### 7.2 Disabled

If `enabled` is false, the event or tip is disabled in the current resolved view.

Example:

```json
{
  "uuid": "12341234",
  "enabled": false
}
```

This can be used by Holidays or a specific alliance to disable inherited content.

### 7.3 Delete vs Disable

Hard delete and disable should be different actions.

Disable:

- Used for owned or inherited objects.
- Creates or updates a local override with `enabled:false`.
- Can be reversed later.

Delete:

- Used only for objects owned directly by the current group.
- Removes the source object from the current group.
- Should not delete inherited parent content.

### 7.4 Search Default

Search should default to only returning enabled events and tips.

The API should allow disabled objects to be included for admin/editing screens.

Example:

```text
include_disabled=false
```

or:

```text
status=enabled
status=disabled
status=all
```

## 8. Field Source Tracking

The resolver should track which group last wrote each field.

This metadata is critical for editing, debugging, inheritance display, and undelete behavior.

### 8.1 Field Source Map

Each resolved event, tip, or group may include metadata like:

```json
{
  "_meta": {
    "object_source_group": "General",
    "field_sources": {
      "/uuid": "General",
      "/title/en/content": "Alliance1",
      "/title/en/type": "General",
      "/description/en/content": "General",
      "/days_until_start": "Season1",
      "/enabled": "Holidays"
    },
    "overridden_by_current_group": [
      "/title/en/content"
    ],
    "inherited_fields": [
      "/description/en/content",
      "/days_until_start"
    ]
  }
}
```

Field source paths should use JSON Pointer syntax, matching patch write paths.

### 8.2 Object Source Group

The group that first wrote the `uuid` can be treated as the original source group for that object.

Example:

```text
General first creates event uuid 12341234.
Season1 overrides title.
Alliance1 overrides description.

object_source_group = General
title source = Season1
description source = Alliance1
```

### 8.3 owner_group_id

- When resolving events or tips, if the current group is the owner, include `group_id` as `source_group_id`

### 8.4 Why Field Source Tracking Matters

Field source tracking allows the UI to show:

- This field is inherited.
- This field is overridden here.
- This event was disabled by Holidays.
- This title came from Alliance1.
- This date came from Season1.
- This object was originally created by General.

It also allows the editor to distinguish:

- Editing a local value.
- Creating a new local override.
- Removing a local override to reveal the inherited value again.

## 9. Groups

### 9.1 Group Attributes

```json
{
  "group_id": "Alliance1",
  "start_date": "2026-01-01",
  "duration_days": null,
  "merge_stack": [],
  "brand": {},
  "default_language": "en",
  "events": [],
  "tips": []
}
```

### 9.2 group_id

`group_id` is the unique ID for the group.

Rules:

- Alphanumeric recommended.
- Hyphens may be allowed if desired.
- Must be unique.
- Should be stable.

Examples:

```text
General
Holidays
Season1
Server996
Serenity
Alliance1
```

### 9.3 start_date

`start_date` is required.

It is used as the default anchor for date calculations.

Format:

```text
YYYY-MM-DD
```

Example:

```json
{
  "start_date": "2026-01-01"
}
```

### 9.4 duration_days

`duration_days` is optional.

It can be used to limit when a group applies.

Format: integer

### 9.5 merge_stack

`merge_stack` is an ordered list of parent groups.

Example:

```json
{
  "merge_stack": [
    {
      "group_id": "General"
    },
    {
      "group_id": "Season1",
      "start_date": "2026-01-01"
    },
    {
      "group_id": "Holidays"
    }
  ]
}
```

### 9.6 brand

Brand controls display settings for the group.

Brand fields are local to the group and are not inherited.

Brand attributes:

- name
- background
- favicon
- domains

Example:

```json
{
  "brand": {
    "name": "Serenity",
    "background": "background.png",
    "favicon": "favicon.ico",
    "domains": [
      {
        "display": "LWSerenity.com"
      },
      {
        "display": "serenity.LWSerenity.com"
      }
    ]
  }
}
```

`domains` is an array so multiple hostnames can point to the same group.

Brand asset fields such as `background` and `favicon` should resolve by prefix:

```text
http:// or https:// = use as full URL
/ = resolve from domain root
anything else = resolve from /groups/{group_id}/assets/
```

Examples:

```text
https://cdn.example.com/bg.png -> https://cdn.example.com/bg.png
/shared/favicon.ico -> /shared/favicon.ico
background.png -> /groups/{group_id}/assets/background.png
```

Source `group.json` should store the original asset reference.

Resolved `manifest.json` should store the resolved asset URL/path.

Group-uploaded assets should be stored under:

```text
groups/{group_id}/assets/{filename}
```

Uploading group assets requires group write permission.

For group-uploaded assets, source brand fields may store only the filename or relative path.

Uploaded asset filenames should be normalized.

Recommended normalization:

```text
lowercase
trim whitespace
convert spaces to hyphens
allow only a-z, 0-9, hyphen, underscore, and dot
preserve file extension
```

If a normalized filename already exists, add a numeric suffix.

Example:

```text
My Background.PNG -> my-background.png
logo.png conflict -> logo-2.png
```

Uploads should not overwrite existing assets by default.

Uploaded asset object keys should be treated as immutable once written.

If the user uploads a replacement, create a new normalized filename or suffixed filename and update the relevant brand field to point to it.

Group-uploaded public assets may use long cache lifetimes because filename changes act as cache busting.

User-uploaded brand assets should allow only:

```text
.png
.jpg
.jpeg
.webp
.ico
```

SVG uploads should not be allowed through the normal UI.

If an SVG is required, it may be uploaded manually and referenced by editing the source file.

Recommended upload size limits:

```text
favicon/icon assets: 512 KB max
background/image assets: 5 MB max
```

Uploaded assets should be kept by default.

Changing or removing a brand field should not automatically delete the old asset.

Manual cleanup may be added later.

Uploading an asset alone should not create an audit record.

Changing a source brand field to reference an uploaded asset should create an audit record because it modifies `group.json`.

`display` should preserve human-readable casing for copied links.

Domain comparisons should use lowercase normalized lookup values.

Domain matching uses suffix matching, and the most specific matching domain wins.

Domain normalization should happen when `brand.domains` is saved or rebuilt.

The stored `display` value should preserve human-readable casing.

The generated lookup value should:

```text
trim whitespace
lowercase
remove a trailing dot
strip protocol if a full URL is pasted
strip path/query/hash if a full URL is pasted
```

During client resolution, normalize the current hostname once and compare it to generated lookup values.

### 9.7 default_language

Each group can define a default language.

Example:

```json
{
  "default_language": "en"
}
```

The final language stack is built from the current group back through inherited groups.

Example:

```text
Alliance1 default_language = ko
Server1 default_language = en
General default_language = es
```

Language order:

```text
ko -> en -> es
```

Use standard language codes where possible.

Examples:

- en = English
- es = Spanish
- ko = Korean
- fr = French
- de = German

## 10. Events

Events are scheduled items that may recur and may appear in reports.

### 10.1 Event Attributes

```json
{
  "uuid": "12341234",
  "enabled": true,
  "title": {},
  "friendly_id": "event-1",
  "days_until_start": 10,
  "days_until_end": 20,
  "start_time": "18:00",
  "duration": {
    "count": 1,
    "type": "hours"
  },
  "recurrence": {
    "interval": 1,
    "type": "days",
    "days_of_week": [1, 2, 3, 4, 5]
  },
  "reports": {
    "calendar": true,
    "agenda": true,
    "end_of_day": false,
    "tomorrow": true
  },
  "description": {},
  "tips": [],
  "tags": []
}
```

### 10.2 uuid

`uuid` identifies the logical event across inheritance.

Events with the same `uuid` are deep merged.

A group can override an inherited event by writing an event with the same `uuid` in the current group.

### 10.3 enabled

`enabled` controls whether the event appears in normal views.

Default:

```text
true
```

A group can disable an inherited event by writing:

```json
{
  "uuid": "12341234",
  "enabled": false
}
```

### 10.4 title

`title` is required only on the top-level/source version of an event.

Overrides may include only the fields they want to change.

`title` uses the Text object format.

Example:

```json
{
  "title": {
    "en": {
      "content": "Capitol War",
      "type": "text"
    }
  }
}
```

### 10.5 friendly_id

`friendly_id` is optional.

Rules:

- Alphanumeric and hyphen.
- Easier for humans to recognize than uuid.
- Should be unique within the relevant object type and group context.

Example:

```text
capitol-war
desert-storm
frontline-breakthrough
```

### 10.6 days_until_start

`days_until_start` is required only on the top-level/source event.

It stores how many days after the effective group start date the event window begins.

Example:

```text
effective_group_start_date = 2026-01-01
days_until_start = 10
event_window_start = 2026-01-11
```

### 10.7 days_until_end

`days_until_end` is optional.

It stores the final possible recurrence date relative to the effective group start date.

Example:

```text
effective_group_start_date = 2026-01-01
days_until_end = 20
event_window_end = 2026-01-21
```

`event_window_end` is inclusive.

### 10.8 start_time

`start_time` is optional.

If `start_time` is missing, the event is treated as all-day.

Recommended format:

```text
HH:MM
```

Examples:

```text
12:00
18:30
```

The backend should not apply timezone conversion. The client is responsible for display and timezone handling.

### 10.9 duration

`duration` is optional.

It controls the length of each occurrence.

It does not control the recurrence window.

Format:

```json
{
  "count": 1,
  "type": "hours"
}
```

Allowed duration types:

The allowed duration type set is `minutes`, `hours`, `days`, `weeks`, `months`, and `years`.

This explicit set is authoritative.

- minutes
- days
- weeks
- months
- years

Examples:

```json
{
  "count": 30,
  "type": "minutes"
}
```

```json
{
  "count": 2,
  "type": "weeks"
}
```

```json
{
  "count": 1,
  "type": "days"
}
```

### 10.10 recurrence

`recurrence` is optional.

It controls how often the event repeats within the event window.

Format:

```json
{
  "interval": 1,
  "type": "days",
  "days_of_week": [1, 3, 5]
}
```

Allowed recurrence types:

The allowed recurrence type set is `minutes`, `hours`, `days`, `weeks`, `months`, and `years`.

This explicit set is authoritative.

Minute or hour recurrence should require `start_time`.

All-day events should use day, week, month, or year recurrence.

- minutes
- days
- weeks
- months
- years

### 10.11 recurrence.interval

`interval` controls how often the recurrence repeats.

Examples:

Every day:

```json
{
  "interval": 1,
  "type": "days"
}
```

Every 2 days:

```json
{
  "interval": 2,
  "type": "days"
}
```

Every 1 week:

```json
{
  "interval": 1,
  "type": "weeks"
}
```

### 10.12 recurrence.days_of_week

`days_of_week` is optional.

If set, it filters out occurrences that do not fall on those days.

Recommended format:

```text
0 = Sunday
1 = Monday
2 = Tuesday
3 = Wednesday
4 = Thursday
5 = Friday
6 = Saturday
```

Example:

```json
{
  "days_of_week": [1, 2, 3, 4, 5]
}
```

This means Monday through Friday.

### 10.13 reports

Reports control where the event appears.

Format:

```json
{
  "calendar": true,
  "agenda": true,
  "end_of_day": true,
  "tomorrow": true
}
```

Report types:

- calendar
- agenda
- end_of_day
- tomorrow

#### calendar

If true, the event appears in calendar views.

#### agenda

If true, the event appears in agenda reports.

#### end_of_day

If true, the event appears in end-of-day reports.

#### tomorrow

If true, the event appears in tomorrow reports.

### 10.14 description

`description` uses the Text object format.

It may also include report-specific display settings if needed.

Example:

```json
{
  "description": {
    "text": {
      "en": {
        "content": "Prepare before reset.",
        "type": "markdown"
      }
    },
    "reports": {
      "calendar": true,
      "agenda": true,
      "end_of_day": false,
      "tomorrow": true
    },
    "tips": ["tip-uuid-1", "tip-uuid-2"],
    "tags": ["reset", "prep"]
  }
}
```

A simpler model is also allowed:

```json
{
  "description": {
    "en": {
      "content": "Prepare before reset.",
      "type": "markdown"
    }
  }
}
```

Recommendation:

Use the simpler model unless report-specific descriptions are definitely needed.

### 10.15 tips

`tips` is an optional array of related tip IDs.

Example:

```json
{
  "tips": ["tip-uuid-1", "tip-uuid-2"]
}
```

### 10.16 tags

`tags` is an optional array of searchable tags.

Tags should be stored normalized.

Recommended normalization:

```text
lowercase
trim whitespace
convert spaces to hyphens
allow only a-z, 0-9, and hyphen
deduplicate per object
```

Example:

```json
{
  "tags": ["season", "combat", "reset"]
}
```

## 11. Event Date Calculation

### 11.1 Event Window

The event window is calculated from the effective group start date.

```text
event_window_start = effective_group_start_date + days_until_start
event_window_end = effective_group_start_date + days_until_end
```

`event_window_end` is inclusive.

### 11.2 Occurrence Generation

Occurrences are generated inside the event window.

```text
event_occurrence = event_window_start filtered by recurrence and not after event_window_end
```

A clearer version:

```text
1. Calculate event_window_start.
2. Calculate event_window_end.
3. Generate possible recurrence dates from event_window_start.
4. Remove dates after event_window_end.
5. If days_of_week is set, remove dates that do not match.
6. Apply start_time if present.
7. Apply duration if present.
```

For monthly or yearly recurrence, if the target month does not contain the original day number, clamp to the last valid day of the target month.

Example:

```text
January 31 + 1 month = February 28, or February 29 in a leap year
```

Occurrence generation should be deterministic and timezone-neutral because source dates are plain dates.

### 11.3 All-Day Events

If an event has no `start_time`, it is an all-day event.

Example:

```json
{
  "title": {
    "en": {
      "content": "Season Begins",
      "type": "text"
    }
  },
  "days_until_start": 0
}
```

### 11.4 Duration

Duration applies to each occurrence.

Example:

```text
Event occurs every day for 10 days.
Each occurrence lasts 2 hours.
```

The recurrence window controls which days the event can start.

The duration controls how long each occurrence lasts.

Duration is optional, on events without a start time, if Duration is omitted, it is "all day"

### 11.5 days_until_end

`days_until_end` controls the last possible recurrence start date.

It does not include the duration.

Example:

```text
start_date = 2026-01-01
days_until_start = 10
days_until_end = 15
recurrence = every 1 day
duration = 2 hours
```

Occurrence starts:

```text
2026-01-11
2026-01-12
2026-01-13
2026-01-14
2026-01-15
2026-01-16
```

Date math rule:

```text
2026-01-01 + 0 days = 2026-01-01
2026-01-01 + 1 day = 2026-01-02
2026-01-01 + 10 days = 2026-01-11
2026-01-01 + 15 days = 2026-01-16
```

Therefore, `days_until_end = 15` means the final possible recurrence start date is `2026-01-16`.

If `days_until_end` is missing, the recurrence has no source-defined end date.

The client should still generate occurrences only for the visible or requested date range.

### 11.6 Editing Dates in the UI

Users should edit dates as actual dates.

When a user saves an event date from the current group:

```text
days_until_start = chosen_start_date - current_group_effective_start_date
```

If the user edits the end date:

```text
days_until_end = chosen_end_date - current_group_effective_start_date
```

Example:

```text
Current group effective start date = 2026-01-01
User chooses event start date = 2026-01-11
Stored days_until_start = 10
```

This write happens only in the current group.

If the event was inherited, this creates or updates a local override in the current group using the same `uuid`.

### 11.7 Parent Date Override Example

Example source:

```json
{
  "group_id": "Season1",
  "start_date": "2025-01-01",
  "events": [
    {
      "uuid": "12341234",
      "title": {
        "en": {
          "content": "Event1 Original",
          "type": "text"
        }
      },
      "days_until_start": 10
    }
  ]
}
```

Server1 inherits Season1 using a different start date:

```json
{
  "group_id": "Server1",
  "start_date": "2024-01-01",
  "merge_stack": [
    {
      "group_id": "Season1",
      "start_date": "2026-01-01"
    }
  ],
  "events": [
    {
      "uuid": "12341234",
      "title": {
        "en": {
          "content": "Event1 New",
          "type": "text"
        }
      }
    }
  ]
}
```

Resolution:

```text
Season1 resolves using effective start date 2026-01-01.
Event1 Original has days_until_start 10.
Resolved date is 2026-01-11.
Server1 then overrides title to Event1 New.
Final Server1 view shows Event1 New on 2026-01-11.
```

## 12. Tips

Tips are reusable advice or instructions.

Tips may be attached to events or searched independently.

### 12.1 Tip Attributes

```json
{
  "uuid": "tip-1234",
  "enabled": true,
  "friendly_id": "capitol-tip",
  "title": {},
  "description": {},
  "tags": []
}
```

### 12.2 uuid

`uuid` identifies the logical tip across inheritance.

Tips with the same `uuid` are deep merged.

### 12.3 enabled

`enabled` controls whether the tip appears in normal views.

Default:

```text
true
```

### 12.4 friendly_id

`friendly_id` is optional.

Rules:

- Alphanumeric and hyphen.
- Easier for humans to recognize than uuid.
- Should be unique within the relevant object type and group context.

### 12.5 title

`title` uses the Text object format.

Example:

```json
{
  "title": {
    "en": {
      "content": "Capitol Tip",
      "type": "text"
    }
  }
}
```

### 12.6 description

`description` uses the Text object format.

Example:

```json
{
  "description": {
    "en": {
      "content": "Save stamina before Capitol War.",
      "type": "markdown"
    }
  }
}
```

### 12.7 tags

`tags` is an optional array of searchable tags.

Tags should follow the same normalization rules as event tags.

Example:

```json
{
  "tags": ["capitol", "combat", "stamina"]
}
```

## 13. Text Object

Text fields support multiple languages.

### 13.1 Format

```json
{
  "en": {
    "content": "Text goes here.",
    "type": "markdown"
  }
}
```

### 13.2 Language Key

The language key should use standard language codes.

Examples:

- en
- es
- ko
- fr
- de

### 13.3 content

`content` contains the actual text.

### 13.4 type

Allowed text types:

- text
- markdown
- html

### 13.5 text

Plain text.

Safest option.

### 13.6 markdown

Markdown text.

Must be sanitized before display.

### 13.7 html

HTML text.

Must be heavily sanitized before display.

HTML should only be allowed if truly needed.

### 13.8 Language Selection

Each group may define a default language.

During inheritance, the resolver should build a language stack.

The most specific group’s language comes first.

Example:

```json
{
  "group_id": "Alliance1",
  "default_language": "ko"
}
```

inherits from:

```json
{
  "group_id": "Server1",
  "default_language": "en"
}
```

inherits from:

```json
{
  "group_id": "General",
  "default_language": "es"
}
```

Language order:

```text
ko -> en -> es
```

When displaying text:

1. Try the current group’s default language.
2. Try inherited default languages in order.
3. If no matching language exists, the client may show the first available language object it finds.

## 14. Users

Users authenticate into the system and receive permissions through group memberships.

### 14.1 User Attributes

```json
{
  "authentication": {},
  "groups": [
    {
      "group_id": "Alliance1",
      "permissions": {
        "events": {
          "read": true,
          "write": true
        },
        "tips": {
          "read": true,
          "write": true
        }
      }
    }
  ]
}
```

### 14.2 Authentication

Authentication details depend on the final auth provider.

This may use AWS Cognito or another provider.

The authentication object should not be used for app permissions directly. App permissions should come from group memberships.

### 14.3 Group Memberships

A user may belong to one or more groups.

Each group membership grants permissions for that group.

Permissions are scoped to the group membership.

Example:

```text
groups.write for sswc does not grant groups.write for serenity.
```

If the user can edit multiple groups, the UI should allow the user to switch current group.

Writes always happen to the selected current group.

### 14.4 Permissions

Initial permission structure:

Permission structure:

```json
{
  "events": {
    "read": true,
    "write": true,
    "delete": true
  },
  "tips": {
    "read": true,
    "write": true,
    "delete": true
  },
  "groups": {
    "read": true,
    "write": false,
    "admin": false
  },
  "users": {
    "read": false,
    "write": false
  }
}
```

`groups.write` allows ordinary local group edits such as brand display fields and default_language.

`groups.admin` is reserved for higher-impact group changes such as start_date edits, duration_days edits, brand domain edits, merge_stack edits, group deletion, and future group administration features.

Brand writes use `groups.write` because brand lives inside `group.json`.

Brand domain edits require `groups.admin` because they affect URL routing.

## 15. API Design

The backend should expose APIs for groups, events, tips, and users.

Normal reads should return resolved data from the current group’s perspective.

Editing screens may need source data and metadata.

### 15.1 General API Rules

- All writes happen to the current group.
- Reads default to resolved mode.
- Search defaults to enabled objects only.
- Disabled objects can be included for admin views.
- Write with uuid updates or creates a local override.
- Write without uuid creates a new object in the current group.
- Delete owned objects only if they belong to the current group.
- Disable owned or inherited objects by writing `enabled:false` in the current group.
- Preview should show the resolved result before saving.

Direct S3/CloudFront reads may be used for public or public-enough resolved chunks when the permission model allows it.

### 15.1.1 API Route Shape

Protected API routes should be grouped under the target group.

Example route shape:

```text
GET    /api/groups
POST   /api/groups
GET    /api/groups/{group_id}/source
PATCH  /api/groups/{group_id}/source
GET    /api/groups/{group_id}/events/{uuid}
POST   /api/groups/{group_id}/events
PATCH  /api/groups/{group_id}/events/{uuid}
DELETE /api/groups/{group_id}/events/{uuid}
GET    /api/groups/{group_id}/tips/{uuid}
POST   /api/groups/{group_id}/tips
PATCH  /api/groups/{group_id}/tips/{uuid}
DELETE /api/groups/{group_id}/tips/{uuid}
POST   /api/groups/{group_id}/preview
POST   /api/groups/{group_id}/assets
GET    /api/groups/{group_id}/audit
```

Route names may change during implementation, but the important rule is that protected writes and admin reads are explicitly scoped to a `group_id`.

The API should authorize against the route `group_id`, not a client-supplied group name inside the request body.

Public S3/CloudFront group resolution may use `?g=group_id`, but protected API calls should use explicit group-scoped routes.

### 15.2 Read Modes

The API may support read modes:

```text
mode=resolved
mode=source
```

`resolved` means final inherited/coalesced result.

`source` means only what is directly stored in the current group.

Default:

```text
mode=resolved
```

### 15.3 Groups API

Suggested operations:

- search groups
- read group
- read resolved group
- create group
- write group
- delete group
- validate group inheritance
- preview resolved group

### 15.4 Events API

Suggested operations:

- search events
- read event
- write event
- create event
- delete event
- disable event
- enable event
- preview event

### 15.5 Event Search

Event search is read-only.

Search should return a list with requested attributes.

Search options:

- title substring
- description substring
- friendly_id
- report type
- date range
- tags
- enabled status

Event search usually includes a date range.

The resolver should use that date range to decide which date-scoped parent groups apply.

Example filters:

```json
{
  "title": "Capitol",
  "report": "agenda",
  "date_range": {
    "start": "2026-01-01",
    "end": "2026-01-31"
  },
  "include_disabled": false
}
```

### 15.6 Event Read

Event read should find by `uuid`.

It may optionally fall back to `friendly_id`.

Recommended behavior:

1. Try uuid if provided.
2. If no uuid match and friendly_id is provided, try friendly_id.
3. Return resolved event by default.
4. Include metadata if requested.

### 15.7 Event Write

Event write writes only to the current group.

If `uuid` is provided:

- Update existing local source event if it exists.
- Otherwise create a local override using that uuid.

If `uuid` is not provided:

- Create a new source event in the current group.
- Generate a new uuid.

When writing dates:

- User provides actual date.
- Backend calculates days from current group effective start date.
- Backend stores `days_until_start` and/or `days_until_end`.

### 15.8 Event Delete

Delete should only hard-delete events owned by the current group.

### 15.9 Event Disable

Disable creates or updates a local override:

```json
{
  "uuid": "12341234",
  "enabled": false
}
```

### 15.10 Event Enable

Enable should reverse local disabling.

Possible implementations:

- Set `enabled:true` locally

### 15.11 Tips API

Suggested operations:

- search tips
- read tip
- write tip
- create tip
- delete tip
- disable tip
- enable tip
- preview tip

### 15.12 Tip Search

Tip search is read-only.

Search options:

- title substring
- description substring
- friendly_id
- tags
- enabled status

Tips date scope should usually be "now".

The resolver should use the current date to decide which date-scoped parent groups apply.

### 15.13 Tip Read

Tip read should find by `uuid`, falling back to `friendly_id`.

Tip read does not need a date scope because it works with a single uuid, unless the UI specifically needs to know whether that tip is active today.

### 15.14 Tip Write

Tip write writes only to the current group.

If `uuid` is provided:

- Update existing local source tip if it exists.
- Otherwise create a local override using that uuid.

If `uuid` is not provided:

- Create a new source tip in the current group.
- Generate a new uuid.

### 15.15 Preview API

Preview should show what the resolved object would look like after a proposed write, without saving it.

Preview is useful for:

- checking inheritance impact
- showing which fields would be overridden
- validating recurrence
- checking report output
- checking language selection
- testing disabled/enabled behavior

### 15.16 Patch Write Format

Write APIs should support explicit patch operations.

Recommended patch format:

```json
{
  "expected_version": 7,
  "set": {
    "/title/en/content": "New Title",
    "/tags": ["combat", "reset"],
    "/enabled": true
  },
  "unset": [
    "/description/en/content"
  ]
}
```

`expected_version` should match the source file's current `version.count`.

If `expected_version` does not match, the write should fail with a version conflict.

`set` writes or replaces local source values.

`unset` removes local source values so inherited values can become visible again.

Patch paths should use JSON Pointer syntax.

`unset` is field-level only.

It should remove fields or local field overrides inside a source object.

Hard delete is object-level.

Hard delete should remove an owned source event or tip from `events.json` or `tips.json` by UUID.

Hard delete should only be allowed for objects owned directly by the current group.

Normal UI field changes should always write local values in the current group.

For enable/disable changes made in the UI:

```text
enable = set /enabled true locally
disable = set /enabled false locally
```

This applies even when the inherited value came from a parent group.

The UI may also provide a reset-to-default action for individual fields.

Reset-to-default should use `unset`.

Reset-to-default applies to inherited event, tip, and group fields.

Examples include:

```text
title
description
tags
reports
dates
recurrence
enabled
```

Brand fields are not inherited and should not use reset-to-default inheritance behavior.

For enabled state:

```text
reset enabled to default = unset /enabled locally
```

Arrays should be replaced as whole arrays for v1.

Patch APIs should not support individual array item add/remove operations initially.

Example:

```json
{
  "set": {
    "/tags": ["combat", "reset"]
  }
}
```

replaces the entire local `tags` array.

`null` is different from `unset`.

Use `null` when the current group intentionally overrides an inherited value with no value.

Use `unset` when the current group wants to remove its local override.

Examples:

```json
{
  "set": {
    "/favicon": null
  }
}
```

means:

```text
set the local favicon override to null
```

```json
{
  "unset": ["/favicon"]
}
```

means:

```text
remove the local favicon value
```

### 15.17 Write Response

Successful write responses should include the updated source file version and the resolved freshness state produced by the synchronous rebuild.

Recommended response shape:

```json
{
  "ok": true,
  "group_id": "Alliance1",
  "source": {
    "file": "events.json",
    "version": {
      "count": 8,
      "modified": "2026-06-20T15:30:00Z"
    }
  },
  "resolved": {
    "status_path": "groups/Alliance1/resolved/status.json",
    "status_version": {
      "count": 43,
      "modified": "2026-06-20T15:30:02Z"
    },
    "changed_outputs": {
      "event-dates.json": {
        "hash": "sha256:dates456"
      },
      "event-friendly-ids.json": {
        "hash": "sha256:eventfriendly456"
      }
    }
  },
  "async_rebuilds": {
    "queued": 3
  }
}
```

`changed_outputs` may include only the top-level/index files that changed during the synchronous rebuild.

The client may still refetch `status.json` after a write, but the response should provide enough information to update editor state immediately.

Version-conflict responses should include the current source file version so the editor can offer reload or conflict handling.

### 15.18 Error Response Format

API errors should use a consistent response envelope.

Recommended shape:

```json
{
  "ok": false,
  "error": {
    "code": "version_conflict",
    "message": "The source file changed after the editor loaded it.",
    "details": {}
  }
}
```

`code` should be stable and machine-readable.

`message` should be safe to show in logs or a generic UI error surface.

`details` may contain structured information for editor-specific handling.

Version conflict example:

```json
{
  "ok": false,
  "error": {
    "code": "version_conflict",
    "message": "The source file changed after the editor loaded it.",
    "details": {
      "source": {
        "file": "events.json",
        "expected_version": 7,
        "current_version": {
          "count": 8,
          "modified": "2026-06-20T15:35:00Z"
        }
      }
    }
  }
}
```

Validation error example:

```json
{
  "ok": false,
  "error": {
    "code": "validation_failed",
    "message": "The submitted changes are not valid.",
    "details": {
      "fields": [
        {
          "path": "/tags/0",
          "code": "invalid_tag",
          "message": "Tags may only contain lowercase letters, numbers, and hyphens."
        }
      ]
    }
  }
}
```

Common error codes should include:

- `validation_failed`
- `version_conflict`
- `permission_denied`
- `not_found`
- `domain_conflict`
- `rebuild_failed`

### 15.19 HTTP Status Codes

API responses should use HTTP status codes consistently with the JSON error envelope.

Recommended mapping:

- `200 OK`: successful read, write, preview, or validation request
- `201 Created`: create request that creates a new group, event, tip, user, or asset
- `400 Bad Request`: malformed JSON, malformed query, or invalid route parameters
- `401 Unauthorized`: missing or invalid authentication
- `403 Forbidden`: authenticated user lacks permission for the current group/action
- `404 Not Found`: requested source object, resolved object, group, asset, or route does not exist
- `409 Conflict`: `version_conflict`, `domain_conflict`, duplicate friendly ID, or other write conflict
- `422 Unprocessable Content`: syntactically valid request failed validation
- `500 Internal Server Error`: unexpected server failure
- `503 Service Unavailable`: temporary dependency failure or repairable rebuild infrastructure failure

The JSON body should still use the same `{ ok:false, error:{ code, message, details } }` shape for non-2xx responses.

Validation and permission failures should not expose private source data from groups the user cannot access.

### 15.20 Idempotency

Write APIs should accept an optional client-generated `request_id`.

`request_id` should be unique per attempted write from a client.

If the same authenticated user repeats the same `request_id` for the same group and operation, the API may return the original result instead of applying the write again.

Idempotency is especially useful for asset uploads, object creates, and retrying after network failures.

If implementing full idempotency storage is too much for v1, creates should still avoid accidental duplicate object creation by generating the UUID server-side only after validation succeeds.

## 16. S3-First Materialized Read Model

The v1 system may use S3 as the primary storage and read-delivery layer.

The goal is to avoid running backend compute for normal reads.

Normal users should be able to fetch prebuilt resolved JSON files from S3 or CloudFront.

Lambda should run mainly for writes, validation, preview, resolution rebuilds, and protected admin APIs.

### 16.0 S3 Object Conventions

All JSON objects should be written with:

- `Content-Type: application/json; charset=utf-8`
- server-side encryption enabled
- stable UTF-8 JSON encoding

Every source, resolved, global generated, status, config, dependency, and audit JSON file should include the nested `version` object unless the file is an externally supplied asset or a non-JSON object.

Public resolved JSON and public assets may be readable through CloudFront/S3 according to the public read model.

Source JSON, audit records, private admin state, and repair/debug state should remain private.

S3 bucket versioning should be enabled for source, audit, and generated JSON buckets or prefixes when practical.

Versioning is not the primary conflict-control mechanism, but it provides useful recovery for accidental overwrites and failed deployments.

Source writes should use conditional object writes based on the current S3 ETag or an equivalent compare-and-swap mechanism.

The source file's embedded `version.count` is the application-level conflict value shown to clients.

The S3 ETag or equivalent storage precondition prevents two Lambda executions from overwriting each other between read and write.

When a source file is successfully written:

- increment `version.count` by 1
- set `version.modified` to the commit timestamp
- preserve unrelated source fields

Generated resolved files should update their own `version.modified` when generated.

Generated `version.count` may increment when the file is regenerated, even if the content hash remains the same.

Clients should use content hashes for cache invalidation, not generated `version.count`.

### 16.1 Storage Roles

S3 can store several categories of JSON:

- source group data
- resolved group chunks
- resolved event date index
- optional search indexes
- tag indexes
- friendly_id maps
- manifests
- public domain map
- public search config
- generated dependency index
- audit records
- brand assets

Suggested layout:

```text
groups/domain-map.json
groups/search-config.json
groups/dependencies.json

groups/General/source/group.json
groups/General/source/events.json
groups/General/source/tips.json

groups/Season1/source/group.json
groups/Season1/source/events.json
groups/Season1/source/tips.json

groups/Alliance1/source/group.json
groups/Alliance1/source/events.json
groups/Alliance1/source/tips.json

groups/Alliance1/resolved/manifest.json
groups/Alliance1/resolved/status.json
groups/Alliance1/resolved/event-dates.json
groups/Alliance1/resolved/events/id/event-123.json
groups/Alliance1/resolved/tips/id/tip-123.json
groups/Alliance1/resolved/event-friendly-ids.json
groups/Alliance1/resolved/tip-friendly-ids.json
groups/Alliance1/resolved/event-tags.json
groups/Alliance1/resolved/tip-tags.json
groups/Alliance1/resolved/event-text.json
groups/Alliance1/resolved/tip-text.json

groups/Alliance1/audit/2026/06/20/write-uuid.json
```

### 16.2 Source Data

Source data is the editable truth.

Source files store only what belongs directly to one group.

Source data should be split by type to reduce write conflicts and avoid rewriting unrelated data.

Example:

```text
groups/Alliance1/source/group.json
groups/Alliance1/source/events.json
groups/Alliance1/source/tips.json
```

`group.json` contains group-level settings such as group_id, start_date, duration_days, default_language, merge_stack, and brand.

`events.json` contains source events and local event overrides owned by that group.

`tips.json` contains source tips and local tip overrides owned by that group.

All split source files should include a `version` object.

`version.count` is used for conditional writes and conflict detection.

`version.modified` is used for display, debugging, and audit context.

Example `group.json`:

```json
{
  "version": {
    "count": 1,
    "modified": "2026-06-20T15:30:00Z"
  },
  "group_id": "Alliance1",
  "start_date": "2026-01-01",
  "duration_days": null,
  "default_language": "en",
  "merge_stack": [],
  "brand": {
    "name": "Serenity",
    "background": "/groups/Alliance1/assets/background.png",
    "favicon": "/groups/Alliance1/assets/favicon.ico",
    "domains": [
      {
        "display": "LWSerenity.com"
      },
      {
        "display": "sswc.LWSerenity.com"
      }
    ]
  }
}
```

`domains` is an array so multiple hostnames can point to the same group.

`display` should preserve human-readable casing for copied links.

Domain comparisons should use lowercase normalized lookup values.

Domain matching should use suffix matching.

```text
www.LWSerenity.com matches LWSerenity.com
www.sswc.LWSerenity.com matches sswc.LWSerenity.com
```

If more than one configured domain matches, the most specific domain wins.

Most specific means the matching lookup with the most labels or longest normalized suffix.

Example `events.json`:

```json
{
  "version": {
    "count": 1,
    "modified": "2026-06-20T15:30:00Z"
  },
  "events": []
}
```

Example `tips.json`:

```json
{
  "version": {
    "count": 1,
    "modified": "2026-06-20T15:30:00Z"
  },
  "tips": []
}
```

Inherited data should not be copied into source files.

Audit records should be stored under the group they affect:

```text
groups/{group_id}/audit/{YYYY}/{MM}/{DD}/{write_uuid}.json
```

Audit records should be created for direct source writes in the edited group.

Derived resolved-output rebuilds in child or dependent groups should not create audit records unless a source file in that group is actually changed.

Audit records should contain metadata, a human-readable summary, and before/after write data.

`before` and `after` should contain only the changed object or changed fields.

They should not duplicate the entire source file unless the entire file is the write scope.

Audit records should be kept indefinitely by default.

Audit `write_id` values should use UUIDv7.

Audit records should be written only after the source write is committed.

If audit writing fails after a successful source/resolved commit, the API should log and alarm.

The system may retry audit creation using the write response context or private logs.

Audit failure should not require rolling back already committed public resolved output.

Example:

```json
{
  "version": {
    "count": 1,
    "modified": "2026-06-20T15:30:00Z"
  },
  "write_id": "write-uuid",
  "group_id": "Alliance1",
  "source_file": "events.json",
  "action": "patch",
  "actor": {
    "user_id": "user-123",
    "display_name": "Example User"
  },
  "version_before": 7,
  "version_after": 8,
  "modified": "2026-06-20T15:30:00Z",
  "summary": "Updated event title",
  "object_refs": [
    {
      "type": "event",
      "uuid": "event-123",
      "friendly_id": "capitol-war"
    }
  ],
  "before": {
    "title": {
      "en": {
        "content": "Old Title",
        "type": "text"
      }
    }
  },
  "after": {
    "title": {
      "en": {
        "content": "New Title",
        "type": "text"
      }
    }
  }
}
```

### 16.3 Materialized Resolved Chunks

Resolved data should be written as smaller chunks instead of one large group file.

The client should fetch only the chunks needed for the current view.

Resolved event and tip detail data should use one file per object for v1.

Examples:

```text
groups/Alliance1/resolved/events/id/event-123.json
groups/Alliance1/resolved/tips/id/tip-456.json
groups/Alliance1/resolved/event-dates.json
```

Event and tip detail chunks may include heavier fields:

- full description text
- related tips
- resolved report settings
- field source metadata
- inherited/overridden metadata
- debug metadata for editors

Public resolved event and tip detail files should include `_meta`.

This allows the frontend to show inheritance/debug information without a separate admin-only metadata fetch.

Resolved event detail files should include both relative scheduling fields and resolved window dates.

Include:

```text
days_until_start
days_until_end
resolved_window_start
resolved_window_end
```

The relative fields help explain inheritance and field-source behavior.

The resolved window dates are convenient for display and client-side scheduling.

Any resolved file that references event or tip objects should include enabled state.

If an object is disabled, include:

```json
{
  "enabled": false
}
```

Normal public views should filter disabled objects out by default.

Disabled resolved event and tip detail files should remain publicly fetchable if the user knows the URL.

For normal public direct links, disabled objects should show an unavailable or disabled view rather than appearing in normal discovery views.

Admin/editor views may use the same files to show disabled inherited or local state.

If a previously resolved event or tip no longer resolves for a group after a hard delete or inheritance change, the rebuild may write a small tombstone detail file at the old deterministic detail path.

Example:

```json
{
  "version": {
    "count": 43,
    "modified": "2026-06-20T15:30:00Z"
  },
  "uuid": "event-123",
  "enabled": false,
  "deleted": true
}
```

Tombstone detail files should not appear in friendly ID maps, event date indexes, tag indexes, or text search indexes.

The frontend should treat tombstone details as not found or unavailable.

This is not a security boundary; it only helps avoid stale canonical detail reads after a public object disappears.

The resolved event date index should contain only the data needed for the client to calculate occurrences.

For v1, use one resolved event date index per group.

Daily agenda, tomorrow, end-of-day, and calendar views should be calculated by the client from the resolved event date index.

The event date index should not include full markdown descriptions or heavy field-source metadata.

Recurrence rules remain part of resolved event detail data and are also copied into the event date index for lightweight client-side occurrence generation.

The client should generate occurrences only for the visible or requested date range.

### 16.4 Group Manifest

Each resolved group should have a small manifest file.

The manifest should include resolved brand data directly so the client can style the page without a separate brand request.

Resolved output files should use the same `version` object shape as source files.

For resolved outputs, `version.count` changes when that output is regenerated and `version.modified` records generation time.

When the same resolved file hash appears in both `manifest.json` and `status.json`, the values must match.

`status.json` is the cache freshness entry point.

`manifest.json` is the group configuration and chunk-discovery entry point.

Example:

```json
{
  "group_id": "Alliance1",
  "version": {
    "count": 42,
    "modified": "2026-06-20T15:30:00Z"
  },
  "default_language": "en",
  "brand": {
    "name": "Serenity",
    "background": "background.png",
    "favicon": "favicon.ico",
    "domains": [
      {
        "display": "LWSerenity.com"
      },
      {
        "display": "serenity.LWSerenity.com"
      }
    ]
  },
  "chunks": {
    "event_friendly_ids": {
      "path": "event-friendly-ids.json",
      "hash": "sha256:eventfriendly123"
    },
    "tip_friendly_ids": {
      "path": "tip-friendly-ids.json",
      "hash": "sha256:tipfriendly123"
    },
    "event_dates": {
      "path": "event-dates.json",
      "hash": "sha256:dates123"
    },
    "event_tags": {
      "path": "event-tags.json",
      "hash": "sha256:eventtags123"
    },
    "tip_tags": {
      "path": "tip-tags.json",
      "hash": "sha256:tiptags123"
    },
    "event_text": {
      "path": "event-text.json",
      "hash": "sha256:eventtext123"
    },
    "tip_text": {
      "path": "tip-text.json",
      "hash": "sha256:tiptext123"
    }
  }
}
```

Client read flow:

```text
1. Fetch status.json with no-cache/no-store behavior.
2. Compare output file hashes in status.json with the client's remembered local state.
3. Invalidate any cached file whose state changed.
4. Fetch manifest.json or other needed files with a hash query string when the hash is known.
5. Keep unchanged files in browser or app cache.
```

### 16.4.1 Client Cache Strategy

`groups/{group_id}/resolved/status.json` should be the freshness sentinel for the resolved group.

The client should always fetch `status.json` without using a cached copy.

Other public resolved files may use long cache lifetimes because the client can invalidate top-level/index files when their state changes in `status.json`, and detail files when their state changes in the relevant lookup/index `details` map.

This includes:

- `manifest.json`
- `event-dates.json`
- friendly_id maps
- tag indexes
- optional text search indexes

The client should remember the last seen output state from `status.json`.

When a top-level or index file's hash changes in `status.json`, the client should delete or bypass its local cached copy of that file before fetching it again.

If a file's state has not changed, the client may continue using the cached copy.

When the client knows a file's hash, it should append that hash as a cache-busting query string when fetching the file.

Examples:

```text
manifest.json?h=sha256:manifest123
event-dates.json?h=sha256:dates123
events/id/event-123.json?h=sha256:eventdetail123
```

The canonical S3 object path should remain unchanged.

The `h` query parameter is only for browser/CDN cache separation when the content hash changes.

The hash value should be URL-encoded when used as a query parameter.

CloudFront cache behavior for public resolved JSON paths should include query strings in the cache key so `?h=` creates a distinct cached response when content changes.

`status.json` does not need query-string cache separation because it should be served with no-cache/no-store behavior.

This keeps the always-fresh read very small while allowing heavier JSON files to be cached aggressively.

If `status.json` cannot be fetched, public read-only views may fail soft by using previously cached resolved files.

This may show stale data, but it is better than breaking public schedules, tips, or search views during a temporary network or CDN problem.

Admin/editor views should require a current `status.json` response before showing write-sensitive state, previews, or save flows.

If admin/editor freshness cannot be confirmed, the UI should show an error or retry state instead of relying on stale resolved data.

### 16.4.2 Cache Headers

Recommended cache headers:

- `groups/{group_id}/resolved/status.json`: `Cache-Control: no-store`
- `groups/domain-map.json`: `Cache-Control: public, max-age=60`
- `groups/search-config.json`: `Cache-Control: public, max-age=60`
- public resolved JSON fetched with `?h={hash}`: `Cache-Control: public, max-age=31536000, immutable`
- public group assets with immutable filenames: `Cache-Control: public, max-age=31536000, immutable`

The client should still fetch `status.json` without cache and should use hash query strings for long-cached resolved JSON.

Authenticated API responses for writes, previews, source reads, audit reads, and admin-only data should use no-store behavior unless a later endpoint has a specific reason to cache.

### 16.5 Client Group Resolution

For normal public reads, the client should determine the current group from the URL before fetching resolved chunks.

Group resolution priority:

```text
1. Query string group override: ?g=group_id
2. Most specific matching domain suffix from groups/domain-map.json
```

If `?g=` is present, it wins over domain mapping.

Examples:

```text
LWSerenity.com maps to group serenity
www.LWSerenity.com maps to group serenity
ph3x.LWSerenity.com maps to group serenity
sswc.LWSerenity.com maps to group sswc
www.sswc.LWSerenity.com maps to group sswc
LWSerenity.com?g=sswc maps to group sswc
```

Domain mapping uses lowercase suffix matching.

If multiple configured domains match the current hostname, the longest matching normalized lookup wins.

Example mapping data:

```json
{
  "version": {
    "count": 42,
    "modified": "2026-06-20T15:30:00Z"
  },
  "domains": [
    {
      "display": "LWSerenity.com",
      "lookup": "lwserenity.com",
      "group_id": "serenity"
    },
    {
      "display": "SSWClub.com",
      "lookup": "sswclub.com",
      "group_id": "sswc"
    },
    {
      "display": "sswc.LWSerenity.com",
      "lookup": "sswc.lwserenity.com",
      "group_id": "sswc"
    }
  ]
}
```

The domain mapping should be generated from group source `brand.domains` data and stored in a public S3/CloudFront JSON file.

The generated map should preserve display casing and include lowercase lookup values.

Normalized domain lookup values must be unique.

If two groups claim the same normalized domain lookup value, validation or rebuild should fail with a domain conflict.

Domain edits should validate and rebuild `groups/domain-map.json` as part of the write.

If the generated domain map would contain a duplicate normalized lookup value, the write should fail and source data should not be saved.

Suggested path:

```text
groups/domain-map.json
```

This file does not need to be private because it only maps public hostnames to public group IDs.

`groups/domain-map.json` is needed before the client knows the current group.

Because of that, it should not use the per-group `status.json` cache invalidation model.

The domain map may use a short cache lifetime, such as 60 seconds.

The client should also be able to refresh it when group resolution fails or when the cached file is stale.

After resolving the group, the client fetches:

```text
groups/{group_id}/resolved/manifest.json
```

If no group can be resolved, the client should show a not-found or group-selection view.

### 16.6 Friendly ID Maps

General event and tip listing indexes are not required for v1.

Tags, title, start_time, duration, descriptions, and other display fields should live in the resolved event or tip detail files.

The one additional lookup file needed for convenience is a friendly_id-to-uuid map.

This keeps user-facing URLs and references readable without requiring users to see or type UUIDs.

Friendly ID map entries should include `enabled` state.

Friendly ID maps should include a `details` map for the object detail files referenced by the map.

The `details` map lets the client invalidate or bypass a long-cached event or tip detail file without requiring every detail file to appear in `status.json`.

The `details` map should include every resolved object of that type, even objects that do not have a friendly ID.

The `items` map only contains friendly_id-to-uuid entries.

This lets direct UUID routes such as `/e/{uuid}` and `/t/{uuid}` fetch the type's friendly ID map first, validate the object exists, and check the detail file hash before loading the long-cached detail file.

Suggested files:

```text
groups/Alliance1/resolved/event-friendly-ids.json
groups/Alliance1/resolved/tip-friendly-ids.json
```

Example:

```json
{
  "version": {
    "count": 42,
    "modified": "2026-06-20T15:30:00Z"
  },
  "group_id": "Alliance1",
  "details": {
    "event-123": {
      "path": "events/id/event-123.json",
      "hash": "sha256:eventdetail123"
    },
    "event-456": {
      "path": "events/id/event-456.json",
      "hash": "sha256:eventdetail456"
    },
    "event-789": {
      "path": "events/id/event-789.json",
      "hash": "sha256:eventdetail789"
    }
  },
  "items": {
    "capitol-war": {
      "uuid": "event-123",
      "enabled": true
    },
    "desert-storm": {
      "uuid": "event-456",
      "enabled": false
    }
  }
}
```

Friendly IDs are not a security boundary.

They are a convenience layer over UUID-based storage.

Friendly IDs are optional.

Friendly IDs must be unique per resolved group and object type.

An event and a tip may use the same friendly_id, but two resolved events in the same group cannot share a friendly_id, and two resolved tips in the same group cannot share a friendly_id.

User-facing object URLs should use friendly IDs:

```text
/e/{event_friendly_id}
/t/{tip_friendly_id}
```

Examples:

```text
/e/capitol-war
/t/capitol-war
```

AWS URL rewriting may route these paths to the frontend app.

The frontend should resolve the friendly_id through the appropriate map for the current group.

For `/e/{id}`, the client should load `event-friendly-ids.json` before fetching the event detail file.

For `/t/{id}`, the client should load `tip-friendly-ids.json` before fetching the tip detail file.

The client should first check the map's `items` for a friendly ID match.

If `/e/{id}` or `/t/{id}` does not match a friendly_id, the client should try treating `{id}` as a UUID by checking the map's `details`.

If neither friendly_id nor UUID resolves, the client should show a not-found view.

If the ID resolves to a disabled object, normal public views should show an unavailable or disabled view.

Admin/editor views may show the disabled object detail and editing metadata.

Friendly_id fallback and any auto-generation behavior can be handled client-side during implementation.

After the client resolves a UUID, it should use the `details` entry to check the detail file path and hash before fetching the long-cached detail file.

Deterministic detail paths are:

```text
groups/Alliance1/resolved/events/id/{uuid}.json
groups/Alliance1/resolved/tips/id/{uuid}.json
```

### 16.7 Resolved Event Date Index and Report Views

Report files should not be treated as permanent daily source data.

Recurring events can produce many occurrences over time, so the canonical resolved read data should contain recurrence rules rather than precomputed infinite occurrences.

For v1, the materialized read layer should write one lightweight event date index per resolved group:

```text
groups/Alliance1/resolved/event-dates.json
```

The event date index should be a minimal entry point for occurrence calculation.

It should not duplicate search or display data that already exists in event detail files or optional search indexes.

The event date index should include only fields needed to generate occurrences and apply report filters:

- uuid
- enabled
- resolved_window_start
- resolved_window_end
- recurrence
- reports

The event date index should include disabled events with `enabled:false`.

Normal public calendar/report views should filter disabled events out by default.

Admin/editor views may include disabled entries to show inherited or local disabled state.

The event date index should include a `details` map for event detail files referenced by the index.

The `details` map stores each referenced event detail path and content hash so clients can invalidate cached detail files when needed.

Example:

```json
{
  "version": {
    "count": 42,
    "modified": "2026-06-20T15:30:00Z"
  },
  "group_id": "Alliance1",
  "details": {
    "event-123": {
      "path": "events/id/event-123.json",
      "hash": "sha256:eventdetail123"
    }
  },
  "events": [
    {
      "uuid": "event-123",
      "enabled": true,
      "resolved_window_start": "2026-01-11",
      "resolved_window_end": "2026-02-10",
      "recurrence": {
        "interval": 1,
        "type": "weeks",
        "days_of_week": [6]
      },
      "reports": {
        "calendar": true,
        "agenda": true,
        "end_of_day": false,
        "tomorrow": true
      }
    }
  ]
}
```

Calendar, agenda, tomorrow, and end-of-day screens should generate occurrences on the client for the visible or requested date range, then filter by date and report flag.

If a view needs titles, tags, start_time, duration, full title text, description, field sources, tips, or editor metadata, it should fetch the event detail file.

Example:

```text
Agenda for 2026-01-11:
1. Load event-dates.json.
2. Generate occurrences for the visible/requested date range.
3. Keep occurrences with date = 2026-01-11.
4. Keep occurrences where reports.agenda = true.
5. Check the event's detail hash in event-dates.json details.
6. Fetch full event detail only when needed.
```

The system may later add prebuilt occurrence chunks or daily report files if performance or presentation needs justify them, but they should be derived files.

### 16.8 Tag Indexes

Tag search should use dedicated tag index files.

Tags should still live on the resolved event and tip detail files as the source display data.

Tags should be normalized before being written to source or resolved data.

The tag indexes exist so tag-only search does not require downloading full detail files or the heavier text search index.

Tag index entries should include `enabled` state.

Tag indexes should include a `details` map for detail files referenced by the tag results.

The `details` map stores each referenced event or tip detail path and content hash once per index file.

Suggested files:

```text
groups/Alliance1/resolved/event-tags.json
groups/Alliance1/resolved/tip-tags.json
```

Example:

```json
{
  "version": {
    "count": 42,
    "modified": "2026-06-20T15:30:00Z"
  },
  "group_id": "Alliance1",
  "details": {
    "event-123": {
      "path": "events/id/event-123.json",
      "hash": "sha256:eventdetail123"
    },
    "event-456": {
      "path": "events/id/event-456.json",
      "hash": "sha256:eventdetail456"
    }
  },
  "tags": {
    "combat": [
      {
        "uuid": "event-123",
        "enabled": true
      },
      {
        "uuid": "event-456",
        "enabled": false
      }
    ],
    "reset": [
      {
        "uuid": "event-123",
        "enabled": true
      }
    ],
    "alliance": [
      {
        "uuid": "event-456",
        "enabled": false
      }
    ]
  }
}
```

Client tag search flow:

```text
1. Fetch the relevant tag index if missing or changed.
2. Normalize selected tags.
3. Resolve matching UUIDs from the tag index.
4. Check matching detail hashes in the tag index details map.
5. Fetch detail chunks for matching results when display data is needed.
```

Multi-tag search should default to AND behavior.

Example:

```text
tags = combat, reset
```

means:

```text
return objects that have both combat and reset
```

OR behavior may be added later as an explicit UI/search option.

Default tag search result order should be title in display language, then UUID, unless the active view applies a date/report sort.

When doing text search, the client may also fetch the tag index and include tag matches in the result set or ranking.

The text search index may still include normalized tags as searchable terms so plain text searches can find tagged objects.

This does not replace the dedicated tag index for explicit tag filtering.

### 16.9 Optional Inverted Text Search Indexes

Substring, prefix, or exact text search may use compact inverted text indexes.

These files are optional for v1 if the data set is small enough to search from already-fetched detail files.

If the data set grows, the client should not download every full event or tip only to search.

If optional text indexes are not generated for a group, omit them from that group's `manifest.json` chunks and `status.json.outputs`.

The client should treat missing text indexes as "text index unavailable" and fall back to already-fetched detail data or a future Lambda search endpoint.

Suggested files:

```text
groups/Alliance1/resolved/event-text.json
groups/Alliance1/resolved/tip-text.json
```

Example:

```json
{
  "version": {
    "count": 42,
    "modified": "2026-06-20T15:30:00Z"
  },
  "group_id": "Alliance1",
  "details": {
    "event-123": {
      "path": "events/id/event-123.json",
      "hash": "sha256:eventdetail123"
    },
    "event-456": {
      "path": "events/id/event-456.json",
      "hash": "sha256:eventdetail456"
    }
  },
  "terms": {
    "capitol": [
      {
        "uuid": "event-123",
        "enabled": true
      }
    ],
    "war": [
      {
        "uuid": "event-123",
        "enabled": true
      }
    ],
    "season1": [
      {
        "uuid": "event-123",
        "enabled": true
      },
      {
        "uuid": "event-456",
        "enabled": false
      }
    ],
    "reset": [
      {
        "uuid": "event-456",
        "enabled": false
      }
    ]
  }
}
```

The inverted index stores each normalized term once and maps it to matching UUIDs.

Text index entries should include `enabled` state.

Text indexes should include a `details` map for detail files referenced by text search results.

The `details` map stores each referenced event or tip detail path and content hash once per index file.

Terms should be normalized when generated.

Recommended normalization:

- lower case
- remove duplicate whitespace
- tokenize title text
- tokenize friendly_id
- tokenize normalized tags as searchable terms
- tokenize selected description/plain-text snippets if useful
- skip duplicate terms per object
- skip a small stop-word list for normal text terms
- do not skip tag or friendly_id terms even if they match a stop word
- exclude large markdown bodies unless search quality requires them
- do not duplicate the full tag-to-uuid index structure

The same stop-word list should be applied to user text queries.

Example:

```text
the capitol war
```

normalizes to:

```text
capitol war
```

Stop words should come from a public search config file.

Suggested path:

```text
groups/search-config.json
```

The search config is global, not per group.

It should not use the per-group `status.json` cache invalidation model.

The search config may use a short cache lifetime, such as 60 seconds, similar to `groups/domain-map.json`.

The search config should support per-language stop-word lists.

`min_term_length` applies to normal text terms during indexing and query normalization.

It should not remove tag terms or friendly_id terms.

Example:

```json
{
  "version": {
    "count": 1,
    "modified": "2026-06-20T15:30:00Z"
  },
  "min_term_length": 2,
  "stop_words": {
    "en": ["a", "an", "and", "at", "is", "of", "the", "to"],
    "es": ["de", "el", "la", "los", "las", "y"],
    "fr": ["de", "des", "du", "et", "la", "le", "les"]
  }
}
```

When indexing text, use the language of the text object if known.

When normalizing a user query, use the current group's `default_language` from its resolved manifest if possible.

If no stop-word list exists for a language, skip only generic normalization and do not remove language-specific stop words.

For languages that do not separate words with spaces, such as Chinese, Japanese, Korean, or Thai, v1 may use simple normalization and rely on full detail search or future language-specific tokenization if needed.

Client search flow:

```text
1. Fetch the search index if missing or changed.
2. Fetch the tag index too if tag matches should be included.
3. Normalize the user's query the same way.
4. Tokenize the query.
5. Match query tokens against index term keys using exact, prefix, or substring matching.
6. Intersect matching UUID sets by default.
7. Merge or rank tag-index matches if used.
8. Check matching detail hashes in the relevant index details map.
9. Fetch detail chunks for matching results when display data is needed.
```

Multi-token text search should default to AND behavior.

Because the full inverted index is downloaded client-side, the client can choose exact, prefix, or substring matching behavior over the term keys without changing the index format.

Default text search result ranking:

1. exact friendly_id match
2. exact tag match
3. exact title term match
4. prefix term match
5. substring term match
6. title in display language
7. UUID

If search indexes become too large, they may be split later by object type, language, first letter, or token shard.

If client-side search becomes too limited, a Lambda search endpoint may read the inverted S3 text index and return matching rows.

### 16.10 Write Flow

Writes should go through Lambda or another protected backend.

The client should not write directly to source JSON in S3.

Recommended write flow:

```text
1. User edits an event, tip, group, brand, or permission.
2. Client sends patch/write request to Lambda.
3. Lambda authenticates and authorizes the user.
4. Lambda loads the current source group file and records its storage precondition, such as S3 ETag.
5. Lambda validates the write.
6. Lambda applies the patch to source data.
7. Lambda builds the affected resolved chunks, reports, indexes, manifest, and status from the would-be source data in memory or temporary storage.
8. If the synchronous rebuild fails, Lambda returns `rebuild_failed` and does not commit the source write.
9. Lambda writes the source file using a conditional storage precondition and `version.count` check.
10. Lambda writes the rebuilt resolved outputs for the edited group, writing `status.json` last.
11. Lambda writes an audit record.
12. Lambda queues async descendant rebuild jobs if needed.
13. Client updates from the write response or reloads status and changed chunks.
```

Conditional writes are important because two editors may save changes at nearly the same time.

If the source file's `version.count` changed after the editor loaded it, the write should fail with a version conflict instead of silently overwriting another user's work.

If the conditional source write fails after resolved outputs were staged, the staged resolved outputs should be discarded and should not be published.

For the edited group, a successful write should mean both source and synchronously rebuilt resolved outputs were committed.

The implementation should avoid returning success after saving source if the edited group's resolved outputs could not be generated.

Because S3 does not provide a native multi-object transaction, the write process should be designed so rebuild output is staged before source commit and any partial commit failure is detectable and recoverable.

If a failure occurs after source commit but before all resolved outputs are written, the API should return an error if possible and enqueue or trigger a repair rebuild for the edited group.

`status.json` should be written last during any resolved output commit.

Clients use `status.json` as the freshness pointer, so it should not reference new output hashes until those output files have already been written.

If a partial resolved-output write fails before `status.json` is updated, public clients should continue seeing the previous coherent resolved state until repair completes.

### 16.11 Rebuild Scope

The resolver should rebuild only the affected output chunks when practical.

The system should generate a dependency index from group merge stacks.

Suggested path:

```text
groups/dependencies.json
```

`groups/dependencies.json` is generated backend state.

It does not need to be publicly readable by clients.

Rebuild workers and protected admin tooling may read it.

Example:

```json
{
  "version": {
    "count": 42,
    "modified": "2026-06-20T15:30:00Z"
  },
  "depends_on": {
    "Season1": ["General"],
    "Server1": ["Season1"],
    "Alliance1": ["Server1", "Holidays"]
  },
  "dependents": {
    "General": ["Season1", "Server1", "Alliance1"],
    "Season1": ["Server1", "Alliance1"],
    "Server1": ["Alliance1"],
    "Holidays": ["Alliance1"]
  }
}
```

`dependents` should include transitive descendants so a parent change can quickly find all affected groups.

The dependency index is generated data.

Group source `merge_stack` remains the source of truth.

Rebuild timing:

```text
current edited group = rebuild synchronously during the write
descendant/dependent groups = rebuild asynchronously after the write
```

This keeps write responses fast while still updating inherited resolved views.

Async descendant rebuild jobs should be queued in SQS.

Each SQS rebuild job should target one group.

If a source change affects 30 descendant groups, enqueue 30 rebuild jobs.

Example rebuild job:

```json
{
  "job_id": "rebuild-uuid",
  "reason": "source-write",
  "changed_group_id": "General",
  "target_group_id": "Alliance1",
  "changed_source_file": "events.json",
  "requested_at": "2026-06-20T15:30:00Z"
}
```

SQS should be configured with retries and a dead-letter queue.

If an async descendant rebuild fails, the worker should not update that group's public `status.json`.

The previous coherent resolved output should remain visible to public clients until a retry or repair rebuild succeeds.

Failed async jobs should be visible through logs, alarms, and the dead-letter queue.

Private admin tooling may expose rebuild failure information, but public resolved JSON should not need to expose transient worker failures.

Each resolved group may have a small rebuild status file:

```text
groups/{group_id}/resolved/status.json
```

Example:

```json
{
  "version": {
    "count": 42,
    "modified": "2026-06-20T15:30:00Z"
  },
  "group_id": "Alliance1",
  "outputs": {
    "manifest.json": {
      "hash": "sha256:manifest123"
    },
    "event-dates.json": {
      "hash": "sha256:dates123"
    },
    "event-friendly-ids.json": {
      "hash": "sha256:eventfriendly123"
    },
    "tip-friendly-ids.json": {
      "hash": "sha256:tipfriendly123"
    },
    "event-tags.json": {
      "hash": "sha256:eventtags123"
    },
    "tip-tags.json": {
      "hash": "sha256:tiptags123"
    },
    "event-text.json": {
      "hash": "sha256:eventtext123"
    },
    "tip-text.json": {
      "hash": "sha256:tiptext123"
    }
  },
  "last_rebuild_hash": "sha256:rebuildinput123",
  "last_rebuild_inputs": [
    {
      "group_id": "General",
      "effective_start_date": "2026-01-01",
      "versions": {
        "group": 12,
        "events": 40,
        "tips": 9
      }
    },
    {
      "group_id": "Season1",
      "effective_start_date": "2026-01-01",
      "versions": {
        "group": 8,
        "events": 15,
        "tips": 4
      }
    },
    {
      "group_id": "Alliance1",
      "effective_start_date": "2026-01-01",
      "versions": {
        "group": 3,
        "events": 7,
        "tips": 2
      }
    }
  ],
  "last_rebuilt_at": "2026-06-20T15:30:00Z"
}
```

Before doing a full rebuild, a worker may compute the current rebuild inputs from the target group and its inherited source versions.

Worker flow:

1. Build the current readable rebuild inputs.
2. Canonicalize those inputs into a stable representation.
3. Hash the canonical inputs.
4. Compare the hash to `last_rebuild_hash`.
5. If the hash matches, acknowledge the job without rewriting resolved outputs.
6. If the hash differs, rebuild resolved outputs and write the new `last_rebuild_hash`, `last_rebuild_inputs`, and `last_rebuilt_at`.

The rebuild inputs should identify the full resolution inputs.

They should include:

- target group id
- each group in the resolution chain
- effective start date used for each group in that context
- relevant source file `version.count` values for each group

The hash is used programmatically for comparison.

The inputs are stored for reading and debugging.

`outputs` stores the current state of public resolved files so clients can safely use long cache lifetimes for those files.

`outputs` should use resolved-folder-relative file paths as keys.

Example keys:

- `manifest.json`
- `event-dates.json`
- `event-friendly-ids.json`
- `tip-friendly-ids.json`
- `event-tags.json`
- `tip-tags.json`
- `event-text.json`
- `tip-text.json`

The path key is both the cache identifier and the fetch path relative to `groups/{group_id}/resolved/`.

The value should contain the current content hash and may later include optional metadata if needed.

`outputs` hashes should be based on the final generated file content, not only source versions.

If a rebuild runs but produces identical file content, the output hash should remain the same so clients do not invalidate unchanged cached files.

This is separate from `last_rebuild_hash`, which is a hash of canonical rebuild inputs used by workers to decide whether a rebuild is needed.

All hashes should use SHA-256 with a `sha256:` prefix and lowercase hexadecimal digest text.

`status.json` itself should be served with no-cache/no-store behavior.

When a top-level or index file's hash in `outputs` differs from the client's remembered value, the client should invalidate that file's cached copy.

When fetching a file with a known hash from `outputs` or a `details` map, the client should append the hash as `?h={hash}`.

The hash query parameter should not change the S3 object key; it only changes the request URL used by browser/CDN caches.

The hash query parameter value should be URL-encoded.

CloudFront cache policies for public resolved JSON should include query strings in the cache key.

Rebuild writers should write `status.json` after all other resolved outputs for the group have been written.

This keeps `status.json` from advertising hashes for files that are not available yet.

For v1, `outputs` should include top-level resolved files and indexes, not every event or tip detail file.

Detail file freshness should be discovered through the map or index that led the client to fetch the detail file.

This keeps `status.json` small even when a group has many events or tips.

If detail freshness later needs direct tracking, it can be moved into separate generated state chunks while keeping `status.json` as the no-cache entry point.

Example canonical input content:

```text
Alliance1|
General(group=12,events=40,tips=9,start=2026-01-01)|
Season1(group=8,events=15,tips=4,start=2026-01-01)|
Server1(group=5,events=2,tips=1,start=2026-01-01)|
Alliance1(group=3,events=7,tips=2,start=2026-01-01)
```

Effective start dates are included because the same parent source can resolve differently when inherited with a different effective start date.

For v1, duplicate rebuild jobs are acceptable.

Rebuild workers should be idempotent.

Rebuild jobs should read the latest source files when they execute.

They should not attempt to rebuild from the source version that existed when the job was queued.

This makes old or duplicate rebuild jobs safe.

For v1, rebuilds may rewrite resolved outputs even if the generated content is identical.

Idempotent means rebuild jobs are safe and correct, not that they avoid every identical rewrite.

Queue deduplication or job coalescing may be added later if rebuild volume becomes a problem.

Examples:

- Editing one event should rebuild that event detail chunk.
- Editing event or tip tags should rebuild affected detail files and tag indexes.
- Editing event or tip text/friendly_id should rebuild optional text search indexes if text search indexes are enabled.
- Editing friendly_id should rebuild the relevant friendly_id map.
- Editing recurrence/date/report flags should rebuild the resolved event date index.
- Editing a parent group may require rebuilding child groups that inherit from it.
- Editing brand should rebuild the resolved manifest but not event or tip detail chunks.

The implementation may start with broader rebuilds for simplicity, then optimize.

For v1, it is acceptable to rebuild all chunks for a group after a write if the data size is small.

### 16.12 Read Privacy

S3/CloudFront direct reads are the default for normal resolved event, tip, report, index, and search chunks.

Resolved event and tip data may be publicly readable if the user knows the JSON URL.

Most normal users do not need to log in to read schedules, tips, reports, friendly_id maps, tag indexes, or optional text search indexes.

The client may determine the current group from the URL and then fetch that group's public resolved chunks directly.

If a group's resolved schedule is private, options include:

- serve those chunks through a Lambda read API
- use signed CloudFront URLs or signed cookies
- keep public groups in public paths and private groups behind API reads

Private group reads are not required for v1 unless a specific group needs them later.

The architecture should not expose private source files directly.

Source files, audit records, and admin-only metadata should stay private.

Public resolved JSON and public group assets may allow cross-origin `GET` and `HEAD` reads without credentials.

Because these files are public or public-enough by design, `Access-Control-Allow-Origin: *` is acceptable for them.

Authenticated API routes, source reads, writes, previews, audit reads, and admin-only data should not use wildcard credentialed CORS.

Those routes should restrict allowed origins to approved frontend domains and should require normal authentication/authorization.

### 16.13 Operations and Repair

The system should provide protected repair/rebuild operations for administrators.

Useful operations:

```text
rebuild one group
rebuild one group and descendants
rebuild groups/domain-map.json
rebuild groups/dependencies.json
validate all source group files
compare status.json outputs against generated files
replay or inspect failed rebuild jobs
```

Repair operations should use the same resolver and output writer as normal writes.

They should also write `status.json` last.

Repair operations should not create audit records unless they change source files.

Operational alarms should exist for:

- SQS dead-letter queue depth greater than zero
- repeated rebuild failures for the same group
- failed synchronous write/rebuild attempts
- failed domain-map rebuilds
- failed dependency-index rebuilds
- unexpectedly old `status.json` for active groups

Logs should include:

- request id
- actor user id when available
- group id
- source file
- target group id for rebuilds
- write id or rebuild job id
- error code

Private admin tooling may show last rebuild time, last rebuild hash, and failure information.

Public resolved JSON should continue to expose only public read state.

Optional private admin state path:

```text
groups/{group_id}/admin/rebuild-status.json
```

This file should be private and may include last failure time, last error code, failed job id, retry count, and repair status.

### 16.14 S3 Limitations

S3 is not a relational database.

This model works best when:

- normal reads are frequent
- writes are occasional
- data can be represented as JSON documents
- search can use compact prebuilt indexes
- resolved views can be materialized after writes

This model is weaker when:

- many users edit at the same time
- complex server-side search is required
- many-object transactions are required
- every read needs user-specific permission checks
- inheritance must be resolved dynamically on every read

If these limits become painful, the system can add DynamoDB, PostgreSQL, OpenSearch, or another database later while keeping S3 materialized resolved chunks as the public read cache.

## 17. Reports

Events can appear in multiple report types.

Report types:

- calendar
- agenda
- end_of_day
- tomorrow

### 17.1 Calendar Report

Calendar reports show events in a calendar-style view.

Use `reports.calendar`.

### 17.2 Agenda Report

Agenda reports show events in agenda format.

Use `reports.agenda`.

### 17.3 End-of-Day Report

End-of-day reports show events relevant at the end of the day.

Use `reports.end_of_day`.

### 17.4 Tomorrow Report

Previous-day reports show events that should be announced or prepared for the day before.

Use `reports.tomorrow`.

### 17.5 Report Filtering

When generating a report:

1. Resolve the current group.
2. Filter by the requested report type.
3. Generate event occurrences for the requested date range.
4. Exclude disabled events by default.
5. Include related tips if requested.
6. Render text using the language stack.

Default occurrence sort:

1. occurrence date
2. all-day events before timed events
3. start_time
4. title in display language
5. uuid

Example:

```text
Generate agenda for Alliance1 for 2026-01-11.
Resolve Alliance1.
Keep only events where reports.agenda = true.
Generate occurrences for that date.
Render in Alliance1 language order.
```

## 18. Timezone Policy

The backend should not handle timezone conversion.

The backend should store:

- dates as YYYY-MM-DD
- times as HH:MM
- durations as count and type

The client is responsible for timezone handling and display.

This avoids backend timezone complexity.

Important rule:

Do not store ambiguous full timestamps

Prefer:

```json
{
  "date": "2026-01-11",
  "start_time": "18:00"
}
```

over:

```json
{
  "start_datetime": "2026-01-11T18:00:00"
}
```

## 19. Validation Rules

The backend should validate data before saving.

Validation errors should use JSON Pointer paths when possible.

Validation should run after applying normalizers such as tag normalization, domain lookup normalization, and asset filename normalization.

If normalization changes a user-supplied value, the normalized value is what should be stored.

If normalization would produce an empty value, a duplicate value, or a value outside the allowed character set, validation should fail.

### 19.1 Group Validation

Check:

- group_id exists and is valid
- start_date exists
- merge_stack parent groups exist
- no circular inheritance
- default_language is valid
- brand fields are valid

Brand domain lookup values must be normalized and unique across groups.

New group IDs should use a stable URL-safe format:

```text
^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$
```

Group IDs are case-sensitive in storage paths, but new production group IDs should prefer lowercase for readability and fewer URL mistakes.

`start_date` must be a valid calendar date.

`duration_days`, if present, must be a positive integer.

`merge_stack` entries must reference existing groups and must not duplicate the same parent group in the same stack.

Language codes should use standard BCP 47-style language tags where practical.

### 19.2 Event Validation

Check:

- uuid exists for updates
- friendly_id is alphanumeric plus hyphen
- title exists for new top-level events
- days_until_start exists for new top-level scheduled events
- days_until_end is not before days_until_start
- start_time uses HH:MM if present
- duration count is positive
- duration type is valid
- recurrence interval is positive
- recurrence type is valid
- days_of_week values are valid
- report keys are valid
- text fields are valid
- html/markdown is sanitized before display

Event tags must be normalized and deduplicated before save.

Production event UUIDs should use canonical lowercase UUID text.

Imported legacy IDs may be accepted only if they are unique and do not conflict with generated UUIDs.

Friendly IDs should normalize to lowercase alphanumeric plus hyphen:

```text
^[a-z0-9]+(-[a-z0-9]+)*$
```

Friendly IDs must be unique per resolved group and object type.

`days_until_start` and `days_until_end` should be integers.

`start_time` must be a valid 24-hour time from `00:00` through `23:59`.

Duration types should be one of:

```text
minutes
hours
days
weeks
months
years
```

Recurrence types should use the same allowed duration type vocabulary where applicable.

`days_of_week` values should use integers `0` through `6`, where `0` is Sunday and `6` is Saturday.

### 19.3 Tip Validation

Check:

- uuid exists for updates
- friendly_id is alphanumeric plus hyphen
- title exists for new top-level tips
- description exists for new top-level tips
- tags are valid
- text fields are valid
- html/markdown is sanitized before display

Tip tags must be normalized and deduplicated before save.

Production tip UUIDs should use canonical lowercase UUID text.

Imported legacy IDs may be accepted only if they are unique and do not conflict with generated UUIDs.

Friendly IDs should normalize to lowercase alphanumeric plus hyphen and must be unique per resolved group and object type.

### 19.4 User Validation

Check:

- authentication identity exists
- group memberships reference valid groups
- permissions use valid permission keys

Permission keys not recognized by the backend should be rejected rather than ignored.

The same user should not have duplicate memberships for the same group.

## 20. Sanitization

All user-provided display text should be treated as unsafe until sanitized.

### 20.1 Plain Text

Plain text should be escaped before display.

### 20.2 Markdown

Markdown should be parsed and sanitized before display.

Unsafe HTML inside markdown should be removed or escaped unless explicitly allowed.

Allowed markdown output should avoid scripts, inline event handlers, unsafe URL protocols, and arbitrary embedded iframes.

Links should allow only safe protocols such as `http:`, `https:`, and `mailto:`.

Images in markdown should either be disabled for v1 or restricted to safe `http:` and `https:` URLs plus approved group asset paths.

### 20.3 HTML

HTML should only be allowed if there is a strong reason.

For v1, normal editor-created content should use `text` or `markdown`.

Raw `html` text objects should be limited to trusted imports or admin-only workflows.

If HTML is allowed:

- remove scripts
- remove event handlers
- remove unsafe URLs
- restrict allowed tags
- restrict allowed attributes
- sanitize server-side or at display time

## 21. Example Full Resolution

### 21.1 General

```json
{
  "group_id": "General",
  "start_date": "2026-01-01",
  "events": [
    {
      "uuid": "event-1",
      "enabled": true,
      "title": {
        "en": {
          "content": "General Event Title",
          "type": "text"
        }
      },
      "days_until_start": 10,
      "reports": {
        "calendar": true,
        "agenda": true,
        "end_of_day": false,
        "tomorrow": true
      }
    }
  ]
}
```

### 21.2 Season1

```json
{
  "group_id": "Season1",
  "start_date": "2026-01-01",
  "merge_stack": [
    {
      "group_id": "General"
    }
  ],
  "events": [
    {
      "uuid": "event-1",
      "title": {
        "en": {
          "content": "Season1 Event Title",
          "type": "text"
        }
      }
    }
  ]
}
```

### 21.3 Server1

```json
{
  "group_id": "Server1",
  "start_date": "2026-01-01",
  "merge_stack": [
    {
      "group_id": "Season1",
      "start_date": "2026-01-01"
    }
  ],
  "events": []
}
```

### 21.4 Alliance1

```json
{
  "group_id": "Alliance1",
  "start_date": "2026-01-01",
  "merge_stack": [
    {
      "group_id": "Server1"
    }
  ],
  "events": [
    {
      "uuid": "event-1",
      "title": {
        "en": {
          "content": "Alliance1 Event Title",
          "type": "text"
        }
      }
    }
  ]
}
```

### 21.5 Final Alliance1 Result

```json
{
  "uuid": "event-1",
  "enabled": true,
  "title": {
    "en": {
      "content": "Alliance1 Event Title",
      "type": "text"
    }
  },
  "days_until_start": 10,
  "resolved_start_date": "2026-01-11",
  "reports": {
    "calendar": true,
    "agenda": true,
    "end_of_day": false,
    "tomorrow": true
  },
  "_meta": {
    "object_source_group": "General",
    "field_sources": {
      "uuid": "General",
      "enabled": "General",
      "title.en.content": "Alliance1",
      "title.en.type": "General",
      "days_until_start": "General",
      "reports.calendar": "General",
      "reports.agenda": "General",
      "reports.end_of_day": "General",
      "reports.tomorrow": "General"
    }
  }
}
```

## 22. Recommended Build Order

### Phase 1: Core Data Model

Build:

- groups
- users
- events
- tips
- text objects
- basic permissions

Do not start with Discord or app frontend.

### Phase 2: Resolver

Build the inheritance resolver.

Required features:

- parent resolves completely before returning
- merge stack order
- deep merge
- event merge by uuid
- tip merge by uuid
- enabled false
- date scope
- field source tracking
- circular inheritance prevention

### Phase 3: Event Scheduling

Build:

- days_until_start
- days_until_end
- actual date to offset conversion
- recurrence
- duration
- all-day events
- report filtering

### Phase 4: S3 Materialized Read Layer

Build:

- split source JSON file layout by group/type
- resolved group manifest
- event detail chunks
- tip detail chunks
- resolved event date index for client-side recurrence/report calculation
- event and tip friendly_id maps
- event and tip tag indexes
- optional inverted event and tip text search indexes
- chunk hash/version tracking
- rebuild process after writes
- repair/rebuild admin operations
- cache headers and CloudFront cache-policy behavior

### Phase 5: APIs

Build:

- group read/write
- event search/read/write
- tip search/read/write
- delete/disable/enable
- preview
- metadata return

Additional API build details:

- standardized error responses
- idempotent create/write handling where practical
- protected repair/rebuild endpoints

APIs should support protected writes and admin reads.

Normal public or public-enough resolved reads may use S3/CloudFront chunks directly.

### Phase 6: Web Frontend

Build UI for:

- viewing current group
- switching groups
- viewing resolved schedule
- editing local overrides
- showing inherited fields
- disabling inherited events/tips
- undeleting disabled events/tips
- viewing field source metadata

### Phase 7: Reports

Build:

- calendar report
- agenda report
- end-of-day report
- previous-day report


### Phase 8: Mobile App

Build app frontend after the API is stable.

## 23. Summary of Key Rules

S3-first read rules:

- S3/CloudFront should serve materialized resolved chunks for normal reads.
- Resolved event details, tip details, event date indexes, friendly_id maps, and optional search chunks may be publicly readable if the user knows the JSON URL.
- Most users do not need to log in for read-only event date and tip access.
- The client may determine the current group from the URL before fetching resolved chunks.
- Group URL resolution order is `?g=group_id`, then most specific matching domain suffix.
- Domain-to-group mappings should be generated from `brand.domains` into a public S3/CloudFront JSON file.
- `groups/domain-map.json` should use a short cache lifetime because it is needed before group `status.json` can be resolved.
- `groups/search-config.json` should be global and may use a short cache lifetime because it is outside per-group `status.json` invalidation.
- `groups/dependencies.json` is generated backend state and does not need to be publicly readable.
- Brand domains should be stored as an array with display casing and generated lowercase lookup values.
- Duplicate normalized domain lookup values across groups should fail validation/rebuild.
- Domain edits should rebuild `groups/domain-map.json` during the write and fail before saving on conflicts.
- `groups/dependencies.json` should be generated from merge stacks and used to find descendant groups for rebuilds.
- Writes should rebuild the edited group's resolved outputs synchronously and descendant groups asynchronously.
- A successful write should mean the edited group's source and synchronous resolved outputs were committed; rebuild failure should prevent source commit when possible.
- Rebuild writers should write `status.json` last so clients never see hashes for files that are not available yet.
- Async descendant rebuilds should use SQS with retries and a dead-letter queue.
- Failed async rebuilds should leave previous public resolved output/status in place until retry or repair succeeds.
- Each async rebuild job should target one group; workers may skip work by checking `groups/{group_id}/resolved/status.json`.
- Protected admin repair tools should support rebuilding groups, domain maps, dependency indexes, and inspecting failed rebuild jobs.
- `status.json` should be fetched with no-cache/no-store behavior and should expose top-level/index output file state for client cache invalidation.
- `status.json.outputs` hashes should be content hashes; `last_rebuild_hash` should hash canonical rebuild inputs.
- Hashes should use SHA-256 with a `sha256:` prefix and lowercase hexadecimal digest text.
- Public resolved files may use long cache lifetimes; top-level/index files invalidate through `status.json`, and detail files invalidate through lookup/index `details` maps.
- Clients should append known file hashes as `?h={hash}` when fetching long-cached resolved files.
- CloudFront cache policies for public resolved JSON should include query strings in the cache key so `?h=` separates cached file versions.
- Cache headers should be no-store for `status.json`, short-cache for global bootstrap files, and long immutable cache for hash-qualified public resolved JSON.
- Public resolved JSON/assets may allow wildcard CORS for unauthenticated GET/HEAD; authenticated APIs and private/admin data should use restricted origins.
- Public read-only views may use cached resolved files if `status.json` cannot be fetched; admin/editor views should require current status before write-sensitive actions.
- Every source, resolved, global generated, status, config, dependency, and audit JSON file should include the nested `version` object.
- JSON used for content hashing should be canonicalized with deterministic key ordering and stable generated array ordering.
- Source writes should use both application `version.count` checks and storage-level conditional writes such as S3 ETag preconditions.
- Lambda/API should handle writes, validation, preview, rebuilds, and protected admin operations.
- Permissions are scoped per group membership; `groups.write` includes ordinary brand display/default-language edits and `groups.admin` covers start-date/domain/inheritance/high-impact group administration.
- Write APIs should use explicit `set`/`unset` patch semantics with JSON Pointer paths; `null` is an intentional value and `unset` removes a local override.
- Successful write responses should include updated source version info and synchronous resolved output freshness state.
- API errors should use a stable `{ ok:false, error:{ code, message, details } }` envelope.
- API errors should use consistent HTTP status codes, including 409 for write conflicts and 422 for validation failures.
- UI enable/disable changes should write local `/enabled` values; reset-to-default should `unset /enabled`.
- Reset-to-default uses `unset` for inherited event, tip, and group fields; brand fields are local-only and not inherited.
- Clients should use `status.json`, group manifests, and chunk hashes to fetch only changed data.
- Resolved brand data should be embedded directly in the group manifest.
- Brand fields are local to each group and are not inherited.
- Brand asset fields resolve full URLs as-is, root paths from `/`, and relative paths from `/groups/{group_id}/assets/`.
- Source brand stores original asset references; resolved manifest stores resolved asset URL/path values.
- Uploaded brand asset filenames should be immutable; replacements should create a new filename and update the brand reference.
- Tag search should use dedicated compact event/tip tag indexes.
- Tags should be normalized, restricted to lowercase alphanumeric plus hyphen, and deduplicated per object.
- Multi-tag search defaults to AND behavior; OR can be added later as an explicit option.
- Text search may use optional inverted event/tip text search indexes rather than full event/tip detail files.
- Multi-token text search defaults to AND behavior.
- Text search should skip the same stop words during indexing and query normalization, except for tag and friendly_id terms.
- Search config `min_term_length` applies to normal text terms, not tag or friendly_id terms.
- Stop words should live in a public language-aware search config file.
- Recurring events should be represented in the resolved event date index and expanded by the client for the visible/requested date range.
- Event date offsets use `start_date + 0 days = start_date`; `days_until_end` is an inclusive final recurrence start offset.
- Monthly/yearly recurrence should clamp invalid target days to the last valid day of the target month.
- `event-dates.json` should include disabled events with `enabled:false`; normal views filter them out by default.
- Disabled event/tip detail files should remain fetchable by direct URL; public direct links should show unavailable/disabled instead of normal discovery.
- Tombstone detail files may be written for resolved objects that disappear, but tombstones should not appear in maps or indexes.
- Friendly ID maps, tag indexes, and text indexes should include `enabled` state for every referenced event or tip.
- Friendly ID maps should include `details` entries for every resolved object of that type, including objects without friendly IDs.
- General event/tip listing indexes are not required for v1.
- Friendly_id maps should provide convenient friendly_id-to-uuid lookup.
- User-facing object URLs should use `/e/{event_friendly_id}` and `/t/{tip_friendly_id}`.
- Friendly IDs are optional; if `/e/{id}` or `/t/{id}` does not match a friendly_id, the client should try `{id}` as a UUID before showing not found.
- Source files, audit records, and admin-only metadata should stay private.
- Audit records should be group-scoped, include before/after write data, and be kept indefinitely by default.
- Audit records should use UUIDv7 write IDs and should be written only after source commit.
- Editable source data should be split by group/type, using group.json, events.json, and tips.json; brand lives inside group.json.
- All split source files should include `version.count` for conflict detection and `version.modified` for display/debugging.
- Resolved output files should also use the `version.count` and `version.modified` object shape.
- Resolved event and tip details should use one file per object for v1.
- Public resolved event and tip detail files should include `_meta`.
- Field source metadata paths should use JSON Pointer syntax.

- Each group has a merge stack.
- Each parent resolves itself completely before returning.
- Later groups in merge stack deep merge on top of earlier groups.
- The current group merges last.
- Objects deep merge recursively.
- Primitives and arrays overwrite.
- null overwrites.
- Missing keys do not overwrite.
- Events and tips merge by uuid.
- enabled:false disables inherited content.
- Writes only happen to the current group.
- Writing with uuid updates or creates a local override.
- Writing without uuid creates a new object.
- Users edit actual dates.
- Backend stores days relative to the current group effective start date.
- Event end date is inclusive.
- No start_time means all-day.
- Duration controls each occurrence.
- days_until_end controls the final possible recurrence date.
- Search defaults to enabled content only.
- Event search usually uses a date range.
- Tip search usually uses now as the date scope.
- Field source metadata should be tracked during resolution.
- Language stack should be built from current group back through inherited groups.
- Markdown and HTML must be sanitized.
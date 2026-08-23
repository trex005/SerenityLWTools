# Date-Scoped Parent Chain Design

**Date:** 2026-08-16  
**Status:** Implemented  
**Applies to:** LWSerenity and LWMinions

## Summary

Allow a local tag to declare an ordered parent lineage whose event layers are active only during their effective date windows. The lineage remains recursively composed from the root toward the local tag, but event composition is performed independently for every requested day.

For this configuration:

```json
{
  "updated": "2026-07-07T22:49:31-02:00",
  "parents": [
    "s5_preview",
    "s4",
    "main"
  ],
  "brand": {
    "name": "Server 996",
    "favicon": "/conf/996/favicon.ico"
  },
  "tags": {
    "996": {
      "startDate": "2024-10-10"
    },
    "s4": {
      "startDate": "2025-12-22",
      "endDate": "2026-01-01"
    },
    "s5_preview": {
      "startDate": "2026-01-02"
    }
  }
}
```

the lineage is:

```text
996 -> s5_preview -> s4 -> main
```

and merge precedence is the reverse:

```text
main -> s4 -> s5_preview -> 996
```

On 2026-01-01, `s4` contributes event data and `s5_preview` does not. On 2026-01-02, `s5_preview` contributes event data and `s4` does not. `main` remains beneath both when its window includes the requested date. The local `996` event layer is always applied last.

This design deliberately separates two operations:

1. Resolve and cache the full configuration lineage and effective tag metadata.
2. Select and compose the event layers applicable to one specific date.

The shared Serenity engine owns the deterministic selection and composition rules. LWSerenity and LWMinions remain responsible for loading trusted JSON layers and passing them to that engine.

Implementation completed on 2026-08-16. The live 11-tag configuration graph was converted to explicit lineages and schema-version-2 event operations under storage suffix `schema-v2-20260816`. The ownership audit classified 96 complete records as owned and retained nine partial legacy records as dormant overrides. The TypeScript source and LWMinions bundled runtime share the same golden fixture and byte-identical engine artifact.

---

## Goals

- Let a local tag explicitly define its nearest-to-root parent lineage.
- Preserve root-to-leaf recursive merging across server, alliance, season, preview, and base layers.
- Give each parent event layer an inclusive effective start and optional inclusive end date.
- Use a parent tag's required self `startDate` when the local context does not override that start date.
- Compose external event reports independently for each day.
- Keep inherited overrides persistent but dormant whenever no active parent supplies their event ID; overrides must never create or resurrect events.
- Treat only events explicitly created on or copied to a tag as locally owned events.
- Keep localStorage and export ownership scoped to the local tag.
- Avoid fetching event documents for parent layers that cannot overlap a requested report range.
- Use one set of golden fixtures against the TypeScript engine and the exact bundled artifact executed by LWMinions.
- Convert every downloaded live configuration to the new parent and event-operation schemas before cutover; runtime loaders do not support legacy shapes.

## Non-goals

- No UI for authoring `conf.json`, parent lineages, or tag date windows.
- No server-tag generation or update tool in this change.
- No date scoping for tips. Tips continue to use ordinary full-lineage composition unless a separate design adds temporal tip behavior.
- No execution of JavaScript downloaded from a Serenity host.
- No change to event recurrence's `startTag`, `startOffset`, or `endOffset` representation.
- No attempt to make one already-flattened event array represent several dates.

---

## Terminology

**Local tag**  
The tag requested by the user or report, such as `996`.

**Parent lineage**  
The ordered `parents` array on the local tag. It is stored nearest parent first and root last.

**Source tag**  
The tag whose `events.json`, tombstone, or browser-local override contributes a particular layer operation.

**Self anchor**  
The required `tags[tagName].startDate` declared by a tag for itself in its own `conf.json`.

**Contextual tag metadata**  
The effective `tags[tagName]` entry after the selected lineage's configuration layers are deep-merged root-to-leaf. A descendant may override an ancestor's anchor or end date for that descendant's context.

**Active event layer**  
A parent source tag whose effective window contains the date being composed. The local tag is always active and is applied last.

**Locally owned event**  
A complete event explicitly created on or copied to a tag. It exists independently of the parent chain and remains available whenever its owning layer is active.

**Inherited override**  
A persistent patch to an inherited event ID. It applies only when the active lower parent stack supplies that ID. When no active parent supplies the ID, the override is dormant and cannot create an event.

**Inherited deletion**  
A persistent conditional tombstone for an inherited event ID. It hides the event whenever an active lower parent supplies it but cannot delete or create anything while that ID is absent.

---

## Configuration Contract

### Parent lineage

`parents` is an array of tag names ordered from the immediate parent outward to the root:

```json
{
  "parents": ["s5_preview", "s4", "main"]
}
```

The array is an explicit lineage, not a list of sibling mixins. Its adjacency has meaning: `s5_preview` is the parent of the local tag, `s4` is the parent of `s5_preview` in this context, and `main` is the parent of `s4` in this context.

The local tag's explicit lineage is authoritative for that resolution context. Parent tags may have their own `parents` declarations for use when those tags are requested directly, but the loader must not recursively append declarations found inside an already explicit suffix. Doing so could duplicate, reorder, or branch the local tag's chosen chain.

This still preserves recursive composition: every named layer is accumulated from the root through each intermediate parent and finally the local tag. It also lets a generated server or alliance tag select a context-specific season chain without rewriting the referenced parents.

Validation requirements:

- Every entry must match the existing safe tag-name grammar.
- The local tag must not appear in its own lineage.
- Entries must be unique.
- Empty strings and non-string entries are invalid.
- The maximum lineage length remains bounded at 32.
- Failure is explicit; an invalid lineage must not silently fall back to a partial stack.

### Required conversion and cutover

Every tag is converted before deployment:

- Non-root tags contain a complete explicit `parents` lineage.
- Root tags contain `"parents": []`.
- The singular `parent` field is removed.
- Runtime loaders reject missing `parents`, singular `parent`, mixed schemas, duplicate entries, unsafe names, self-reference, and lineages longer than 32.

The conversion tool may read the freshly downloaded legacy configurations to construct each explicit nearest-to-root lineage, but that compatibility logic exists only in the offline converter and its tests. It is not shipped in either runtime loader.

The converter validates that explicit adjacency is consistent across generated lineages. For example, if one converted tag contains `["s5_preview", "s4", "main"]`, any other generated lineage that passes through `s5_preview` must use the same outward suffix unless an explicitly reviewed contextual exception is recorded.

### Required self anchor

Every tag participating in a lineage must declare its own start anchor in its own configuration:

```json
{
  "tags": {
    "s4": {
      "startDate": "2025-12-15"
    }
  }
}
```

`tags[tagName].startDate` must be a valid `YYYY-MM-DD` date. A missing or invalid self anchor is a configuration error.

### Contextual date overrides

The local tag may override metadata for any parent in its lineage:

```json
{
  "tags": {
    "s4": {
      "startDate": "2025-12-22",
      "endDate": "2026-01-01"
    }
  }
}
```

The effective window for a source tag is resolved as follows:

```text
effectiveStart(sourceTag) =
  contextual tags[sourceTag].startDate
  or sourceTag's required self startDate

effectiveEnd(sourceTag) =
  contextual tags[sourceTag].endDate when supplied
  or sourceTag's own optional self endDate when supplied
  or unbounded
```

Preserve and validate each source tag's self metadata before merging contextual configuration. Then deep-merge configuration root-to-leaf; any descendant may contextually override an ancestor, and the local tag has final precedence.

Both boundaries are inclusive:

```text
active(sourceTag, date) =
  effectiveStart(sourceTag) <= date
  and (effectiveEnd(sourceTag) is absent or date <= effectiveEnd(sourceTag))
```

An `endDate` earlier than the effective `startDate` is invalid. `startDate: null`, `tags[sourceTag]: null`, and malformed contextual values are errors; they must not silently fall back to otherwise valid self metadata. A genuinely absent contextual `startDate` falls back to the validated self anchor.

JSON `null` explicitly removes an inherited `endDate` and makes the upper bound unbounded. Omitting `endDate` continues to inherit a value already provided by an ancestor or the source tag's self metadata.

`startDate` continues to be the recurrence anchor used by `startTag` plus `startOffset`. This design intentionally also uses it as the event layer's activation boundary. An event with a negative offset cannot produce instances before its source layer becomes active.

### Scope of date windows

Date windows apply to event-layer contributions from the source tag:

- Event definitions
- Event patches
- Event tombstones
- Browser-local event overrides stored for that source tag
- Browser-local event deletions stored for that source tag

Date windows do not remove configuration metadata. The complete deep-merged `tagConfig`, including all anchor dates, brand values, storage suffixes, and other non-event settings from inactive layers, remains available while composing any day so active events can resolve `startTag` references deterministically.

Date windows do not apply to tips in this version.

The local tag is always applied last and is not gated by its own start date. Its self `startDate` remains an anchor for local recurrence offsets. A future requirement to schedule the local tag itself would need a separate explicit design.

---

## Event Operation Contract

### Version 2 published format

Ownership must be serialized explicitly. New and migrated `events.json` files use a versioned operation array:

```json
{
  "schemaVersion": 2,
  "updated": "2026-08-16T12:00:00-02:00",
  "operations": [
    {
      "kind": "owned",
      "event": {
        "id": "alliance-meeting",
        "title": "Alliance Meeting",
        "recurrence": {
          "type": "weeks",
          "startTag": "996",
          "startOffset": 0,
          "onPeriods": 1,
          "offPeriods": 0,
          "daysOfWeek": ["monday"]
        }
      }
    },
    {
      "kind": "override",
      "id": "seasonal-event",
      "set": {
        "/title": "Server-specific title",
        "/startTime": "19:00",
        "/recurrence/startOffset": 12
      },
      "remove": ["/description"]
    },
    {
      "kind": "delete",
      "id": "inherited-event-to-hide"
    }
  ]
}
```

Operation meanings:

- `owned`: a complete event explicitly created on or copied to this tag.
- `override`: conditional JSON Pointer changes that apply only when the composed lower stack already contains `id`.
- `delete`: a conditional deletion that applies only when the composed lower stack already contains `id`.
- `set`: an object whose keys are RFC 6901 JSON Pointers and whose values create or replace the addressed values.
- `remove`: optional RFC 6901 JSON Pointers removed after `set`; removing an absent path is an idempotent no-op.

Arrays are replaced as complete values by setting their containing pointer; generated overrides do not target individual array indexes. Root pointer replacement is forbidden for new overrides. A single override cannot contain duplicate pointers, overlapping parent/child pointers, or the same pointer in both `set` and `remove`. Pointer segments capable of prototype mutation, including `__proto__`, `prototype`, and `constructor`, are rejected. `id` is carried outside the pointer changes and cannot be changed. Unknown operation kinds or malformed complete owned events are fatal.

### One operation kind per layer and ID

For each `(sourceTag, eventId)`, a normalized layer has at most one final operation kind. The existence test for conditional operations is captured from the composed lower stack before applying any operation from the current layer. An `owned` operation installed by the current layer cannot make a same-layer override or deletion eligible.

Published and browser-stored operations are normalized before composition:

- A stored edit to a published owned event replaces that layer's `owned` operation with the updated complete owned record.
- Removing a published owned event suppresses that owned operation and reveals the lower inherited event with the same ID, if any; it does not automatically delete the revealed event.
- A stored inherited override replaces the published inherited override for that layer and ID.
- A stored inherited deletion replaces a published inherited patch or deletion for that layer and ID.
- Conflicting stored operation kinds for one layer and ID are invalid rather than resolved by incidental array order.

Explicit ownership is checked before raw-lineage ID existence. Deleting an owned copy removes ownership even when the same ID exists below. If an inherited version is active, it becomes visible; hiding that revealed event requires a separate inherited-delete action.

### Loader normalization

Both loaders normalize published documents and stored browser operations into the same engine ABI:

```text
ownedEventsById
inheritedOverridesById { setByPointer, removePointers }
inheritedDeletedIds
suppressedPublishedOwnedIds (browser/storage normalization only)
```

The shared engine consumes normalized operations and never infers ownership from record shape.

### Offline conversion of downloaded live event files

Runtime loaders accept only `schemaVersion: 2`. A one-time offline converter reads the freshly downloaded live version 1 files and emits version 2 operations:

- `{id, deleted: true}` becomes `{"kind":"delete","id":"..."}`.
- An entry whose ID exists anywhere in the complete lower raw lineage becomes `kind: "override"`, even when it contains `title` or looks complete.
- Each leaf value authored by that inherited entry becomes a JSON Pointer `set`; arrays are emitted as one whole-array set. Version 1 absence does not imply `remove`.
- An entry whose ID exists nowhere below is a candidate `owned` event.

Every candidate owned record is listed in a conversion audit. The converter requires the audit to be explicitly accepted or amended before writing production files, preventing a stale override whose parent disappeared from being promoted accidentally. Conversion is dry-run-first, idempotent, writes no source file until all tags validate, and refuses to complete while classifications or referenced parent tags remain unresolved.

The runtime contains no version 1 event normalization code. Version 1, missing `schemaVersion`, or mixed `events` plus `operations` documents are fatal.

### Browser storage cutover

Existing browser snapshots are not migrated. The conversion increments each affected tag's configured `storage.eventsSuffix`, invalidating the old event-override namespace at cutover. New storage starts with explicit owned/override/delete operation records using JSON Pointers.

Any unpublished browser work that must be retained must be exported before cutover and passed through the same offline conversion/audit process. No heuristic browser-snapshot interpretation is shipped in production.

---

## Date-Aware Event Composition

### Per-date algorithm

Given a requested local tag, loaded configuration layers, loaded event operations, browser-local operation records, and a date key:

1. Validate the date key in app time.
2. Deep-merge all configuration layers root-to-leaf to obtain contextual `tagConfig`.
3. Resolve each parent source tag's effective window from `tagConfig`, falling back to its validated self anchor metadata as necessary.
4. Select parent event layers whose effective windows contain the date.
5. Preserve lineage precedence while removing inactive layers.
6. Apply selected parent event layers root-to-leaf.
7. Within each active source layer, apply operations in this order:
   1. Complete events owned by that tag.
   2. Conditional inherited JSON Pointer overrides, but only for IDs already supplied by the active lower stack.
   3. Conditional inherited deletions, under the same existence rule.
8. Apply the local tag's operations in that same order, last.
9. Return the effective events for that date plus the complete contextual `tagConfig`.
10. Evaluate event recurrence and date-specific include/exclude overrides against that date.

Layer eligibility is based on the source layer, not `event.recurrence.startTag`. An `s4` override remains an `s4` contribution even when the resulting event uses another tag as its recurrence anchor.

Ownership and operation kind must be explicit in the serialized layer/engine ABI. The runtime must never infer that an entry is locally owned merely because it contains a `title` or resembles a complete event. Editing an inherited event can set any pointer, including `/title`, without changing its ownership.

An inherited override applies its validated JSON Pointer `set` values and then its `remove` paths to the active inherited record only when that ID already exists immediately below the owning layer. If the ID is absent, the override is retained but dormant. The same existence test applies to an inherited deletion.

A complete locally owned event is created only by an explicit create or copy operation. It remains an event even when no parent supplies the same ID. If a copy intentionally retains an inherited ID, its explicit owned-event operation—not its shape—gives it independent lifetime.

### Why composition must happen per day

Flattening all layers before report generation loses the provenance of patches and tombstones. If `s4` changes the title of a `main` event and then expires, a pre-flattened event cannot restore the `main` title. Similarly, an expired `s4` tombstone cannot be undone without recomposing from the remaining active layers.

For a report spanning 2026-01-01 through 2026-01-02, the effective stacks may therefore be:

```text
2026-01-01: main -> s4 -> 996
2026-01-02: main -> s5_preview -> 996
```

The report must not reuse the January 1 flattened array on January 2.

### Overlaps and gaps

Overlapping parent windows are valid. When two parents are active, normal lineage precedence applies. In the example lineage, `s5_preview` overrides `s4`, which overrides `main`.

Gaps are also valid. If neither `s4` nor `s5_preview` is active, the remaining active ancestors and the local tag are composed normally.

---

## Local Event Edit Semantics

### Editing inherited events

Editing an inherited event's title, description, time, recurrence, ordering, archive state, visibility, or date-specific include/exclude data creates or updates an inherited override owned by the local tag. It never creates a local event.

- When the active parent stack supplies the ID, apply the override.
- When no active parent supplies the ID, the override is dormant and the event does not appear.
- If the parent removes the event or its source layer expires, the local calendar also loses the event.
- If the same inherited event returns later, the stored override applies again.
- Reset-to-parent removes the inherited override.

Event IDs must never be reused for an unrelated conceptual event. Otherwise a dormant override could incorrectly attach to a different future event.

The editor's pinned composition date determines the inherited baseline used to calculate JSON Pointer changes. Persistence stores only the changed `set` pointers and explicit `remove` pointers, not one complete effective snapshot.

### Creating and copying local events

Only an explicit **Add Event** or **Copy to Tag** action creates a locally owned event. Locally owned events are stored as complete records and do not depend on an inherited ID being active.

- Editing a locally owned event updates its complete owned record.
- Deleting it removes that owned record.
- Copying an inherited event is an explicit ownership transition and should normally allocate a new ID; retaining the ID is allowed only when the operation is still explicitly marked as an owned event.
- No ordinary Edit Event save may silently change an inherited override into an owned event.

### Inherited deletions

Deleting an inherited event creates an inherited deletion, not a local event with independent existence. It hides the ID whenever the active lower parent stack supplies it and is dormant otherwise. Resetting the deletion returns the event to normal date-aware inheritance.

Deletion ownership is determined against the full raw parent lineage, not only the stack active on the pinned date. If the ID exists anywhere in the parent lineage, deletion records an inherited deletion even when its supplying parent is currently inactive. A genuinely locally owned event is deleted by removing its owned record.

### Editing a non-local tag

Existing cross-tag administrative editing remains available, although this feature does not depend on it. An override stored on another tag remains conditional on an inherited event existing below that tag while its source layer is active. The normal active-tag editing path writes an inherited override unless the event was explicitly created or copied locally.

### Export requirements

Export must preserve operation ownership and must not derive ownership from one date-resolved effective event array:

- Preserve unmodified published local event entries exactly as authored.
- Export explicit locally owned additions as complete events.
- Export inherited edits as conditional JSON Pointer `set`/`remove` operations.
- Export inherited deletions as conditional deletions.
- Do not infer ownership from today's active stack.
- Never promote an inherited patch to an owned event because its active parent is absent during export.

This makes export independent of the date on which it is run and preserves browser behavior after deployment. Reset-to-parent removes the conditional inherited operation, allowing future exports to omit it.

Admin diff labels such as “inherited,” “local,” and “overridden fields” are presentation aids only. Correct persistence must rely on explicit layer ownership and stored operation records, not on a date-sensitive visual classification.

---

## LWSerenity UI Behavior

### General event list

The general event-management list uses the effective stack for today in the application timezone (UTC-2). It is recomputed when the UTC-2 day changes, the active tag changes, configuration changes, or relevant local overrides change.

### Agenda and calendar views

Agenda and calendar views compose events for the date being displayed. A multi-day view requests or derives a separate composition for every day rather than filtering one global flattened array.

### Event editor

When an event editor opens, it captures the composition date used to select the inherited event. The dialog keeps that date pinned until it closes so a midnight rollover or calendar navigation cannot change the baseline while the user is editing.

Saving an inherited event through the normal path writes a conditional patch to the local tag. Saving a locally owned event updates its complete owned record. Reset-to-parent resolves the parent stack for the pinned date, removes the conditional patch, and shows the inherited version applicable to that date when one exists.

If no parent version exists on the pinned date, an inherited override is dormant and normally cannot be opened from that date's agenda. Reset remains available from administrative override management and removes the dormant operation without manufacturing an event.

Reset/removal semantics are operation-specific:

- Reset inherited override: remove its conditional JSON Pointer `set`/`remove` operation.
- Reset inherited deletion: remove the conditional deletion.
- Locally owned event: there is no reset-to-parent; delete/remove ownership is a distinct action.
- Owned copy retaining a parent ID: removing ownership reveals the inherited version applicable to the displayed date, when one exists.

### Dormant operation management

Because dormant inherited operations do not appear in today's effective event list, Command mode needs a raw operation-management list. It displays operation type, owning tag, event ID, last known title when available, and whether the operation is active or dormant for the displayed date. Administrators can inspect and reset dormant patches/deletions without manufacturing an event.

This is event-operation administration, not a UI for editing parent-chain JSON.

### UTC-2

All “today” decisions and date comparisons use the existing app-time helpers. Browser-local midnight must not control layer selection.

### Date-consumer inventory

The migration must cover every browser consumer of the current global flattened event store, including:

- Public and admin day agendas
- Multi-day public and admin views
- Email generator
- Browser reminders for today and tomorrow
- Event cards and date-specific editors
- General event-management list
- Reset and diff helpers
- Recurrence utilities reached by any of those consumers

A consumer inventory test or checklist is required before removing the old flattened path. Correct external reports alone are insufficient.

---

## External Reports

All external event reports compose each output day independently.

### Agenda

For an inclusive `[startDate, endDate]` request:

1. Resolve configuration metadata and lineage once.
2. Determine which parent windows overlap any day in the range.
3. Load each potentially active event document once.
4. For each day, select active layers and compose that day's events.
5. Evaluate recurrence and render that day.

### Daily reminders

Today and tomorrow may have different parent stacks. Compose them separately before selecting reminder and briefing fields.

### Other reports

Any new external report that can cover more than one date must consume raw layers or a date-aware composition provider. It must not accept a single flattened event list unless its contract is explicitly limited to one date.

---

## Fetch and Cache Optimization

Configuration documents are small and are required to validate lineage, obtain self anchors, and compute contextual windows. Load and cache the `conf.json` for the local tag and every parent in the selected lineage.

Before fetching event documents for a bounded report:

```text
overlaps(layer, report) =
  layerStart <= reportEnd
  and (layerEnd is absent or reportStart <= layerEnd)
```

If a parent does not overlap the report, do not fetch its `events.json`. The local tag's event document is always fetched.

For unbounded UI browsing, fetch event layers lazily as dates require them or retain the current bounded cache behavior. Cache keys must distinguish:

- Source tag
- Remote versus local-override variant
- Data type
- Published update marker or existing cache invalidation generation

Do not cache only a flattened date-specific result under a tag-only key. A safe date-resolved cache key includes the local tag, date key, lineage/config generation, event-layer generations, and local-override generation.

Optimization must not change results. Golden tests should compare optimized and unoptimized composition for the same fixture.

---

## Shared Engine Contract

### Layer representation

Continue using the shared `ConfigurationLayer` shape as the transport for published and stored operations. Extend the input with enough context to identify the requested local tag and effective lineage. The ABI must distinguish complete owned events, conditional inherited patches, explicit field removals, and conditional inherited deletions. Do not overload one `overridesById` field or infer ownership from record completeness.

The deterministic engine receives data; it does not fetch URLs or read browser storage.

### Operations

Add explicitly versioned operations similar to:

```text
compose-events-for-date
agenda-from-layers
daily-reminders-from-layers
```

The exact ABI name may change during implementation, but there must be one shared implementation of:

- Effective metadata/window resolution
- Active-layer selection
- Root-to-leaf event composition
- Owned-event behavior
- Conditional override and deletion behavior

Agenda and daily-reminder layer operations accept raw layers and invoke the date primitive internally. Keeping the per-day loop inside the trusted engine prevents LWSerenity and LWMinions from drifting.

Remove the old flattened event-report operations from production call paths. An undated composition helper may remain only for non-event consumers such as tips. Bump `ENGINE_VERSION`, update the Python runtime's pinned version and artifact hash, and reject obsolete operation/schema requests explicitly.

LWMinions' undated `configuration(tag)` helper cannot represent date-scoped events correctly and is removed or made configuration-metadata-only. Add `configuration_for_date(tag, date)` for consumers that need effective events, and route every report through the new raw-layer operations.

All date-taking engine operations validate real `YYYY-MM-DD` keys, require `startDate <= endDate`, cap an inclusive report at 366 days, bound layer/event operation counts, and return stable machine-readable error codes in addition to messages.

### Artifact synchronization

After engine changes:

1. Build `artifacts/lw-serenity-engine.js` in LWSerenity.
2. Copy the identical bytes to `LWMinions/src/lwminions/assets/serenity/lw-serenity-engine.js`.
3. Update LWMinions' pinned SHA-256.
4. Run the same golden fixture requests against TypeScript source and the bundled runtime.
5. Assert engine version compatibility through the bounded JSON-string ABI.

---

## Loader Changes

### LWSerenity

Refactor the configuration fetcher so it can return raw ordered layers in addition to date-resolved views.

- Require and validate explicit nearest-to-root `parents` lineages; reject singular or mixed parent schemas.
- Cache configuration and data documents by source tag.
- Keep browser-local operation records associated with their owning source layer.
- Replace singular-immediate-parent assumptions in diff and reset helpers with a date-aware composed parent stack.
- Make event-list initialization request today's UTC-2 composition.
- Make agenda generation pass raw layers to the shared per-day engine path.

### LWMinions

Update `SerenityStaticClient` to:

- Load the local configuration first.
- Require explicit `parents` lineages and reject legacy or mixed schemas identically to LWSerenity.
- Load and validate every required configuration document.
- Accept an optional report range when loading layers.
- Skip parent `events.json` documents whose effective windows do not overlap that range.
- Preserve root-to-leaf layer order in the payload sent to the engine.

Update `SerenityReports` so agenda and daily reminders pass raw layers directly to the date-aware engine operations instead of composing one configuration first.

LWMinions continues to execute only the pinned bundled engine. Remote hosts supply JSON configuration and event data, never executable code.

### Document loading contract

- Every referenced `conf.json` is required. Missing, malformed, oversized, or non-JSON configuration is fatal.
- A missing `events.json` for an active or potentially active layer is treated as an empty event layer only for an HTTP 404/missing-static-object response; malformed or non-JSON event data is fatal.
- An event document proven not to overlap a bounded report is not requested, so its absence is irrelevant to that report.
- Event-only report loading does not request `tips.json`.
- Tip consumers keep their separate existing data-type path.

Both applications must enforce the same maximum ancestry length of 32 and fail explicitly on duplicates, cycles, or excess depth. LWSerenity's current silent cycle/depth truncation is not retained.

---

## Fixture-First Test Oracle

No production algorithm changes begin until the golden fixture and expected results are reviewed and committed.

### Canonical lineage

The primary fixture uses:

```text
local tag: 996
parents: [s5_preview, s4, main]
merge precedence: main -> s4 -> s5_preview -> 996

main self start:       2025-01-01, no end
s4 contextual window: 2025-12-22 through 2026-01-01
s5_preview window:    2026-01-02 onward
996 self anchor:      2024-10-10; local layer always active
```

Primary assertion dates:

| Date | Expected active event stack |
|---|---|
| 2025-12-21 | `main -> 996` |
| 2025-12-22 | `main -> s4 -> 996` |
| 2026-01-01 | `main -> s4 -> 996` |
| 2026-01-02 | `main -> s5_preview -> 996` |

### Canonical events

The fixture must include at least:

| ID | Purpose |
|---|---|
| `main-only` | Base event visible whenever `main` and recurrence allow it. |
| `s4-only` | Event appears exactly within the `s4` window. |
| `preview-only` | Event appears beginning on the preview boundary. |
| `chain-override` | `main` owns the event; `s4`, `s5_preview`, and `996` contribute explicit conditional patches; title/description identify the winning active patch. |
| `scoped-tombstone` | Defined in `main`, tombstoned in `s4`; absent only while `s4` is active and restored afterward. |
| `preview-tombstone` | Defined below preview and deleted by preview beginning on its first active day. |
| `dormant-override` | Inherited event edited locally; disappears when no active parent supplies it and reapplies if it returns. |
| `inherited-delete` | Parent event locally deleted; the deletion is dormant while the inherited ID is absent and reapplies if it returns. |
| `date-include` | Include/exclude override supplied by a date-scoped parent; ignored outside that parent's window. |
| `cross-anchor` | Event contributed by one source tag but using another `startTag`, proving source-window gating is independent of recurrence anchoring. |
| `negative-offset` | Recurrence would begin before the source window; produces no pre-window instances. |
| `long-recurrence` | Recurrence extends past the source layer end; produces no post-window instances. |
| `local-only` | Event explicitly created in the local layer with no parent version. |
| `local-copy` | Inherited event explicitly copied to the local tag; survives parent expiration because ownership was deliberately changed. |

### Window and ancestry edge fixtures

- Inclusive first and last day.
- One-day parent window where start equals end.
- Overlapping `s4` and preview windows, proving nearest-parent precedence.
- Gap between seasonal windows, proving fallback to `main` plus local.
- Missing contextual parent `startDate`, proving fallback to the parent's required self anchor.
- Contextual start override, proving both recurrence anchoring and layer activation shift.
- Contextual end override.
- Explicit `endDate: null`, proving an inherited end is removed.
- Parent with its own optional self end and no local override.
- Root tag with an explicit empty `parents` array.
- Offline conversion expands every singular-parent chain into a complete nearest-to-root array.
- Offline conversion rejects inconsistent generated suffixes and unresolved references.
- Server -> alliance -> local lineage with minor alliance overrides.

### Invalid configuration fixtures

- Missing required self anchor.
- `startDate: null`, `tags[sourceTag]: null`, and malformed contextual values.
- Invalid calendar date.
- End before start.
- Duplicate parent.
- Local tag in its own lineage.
- Unsafe tag name.
- Non-string parent entry.
- Lineage longer than the maximum.
- Inconsistent explicit lineage suffixes detected by conversion or pre-deployment validation.
- Missing parent configuration document.
- Missing `parents`, retained singular `parent`, or mixed parent schemas.
- Missing/wrong event `schemaVersion`, legacy `events`, or mixed `events` plus `operations`.

Every invalid fixture must produce the same stable error category in LWSerenity source tests and the LWMinions integration path.

### Report fixtures

- Agenda entirely before `s4`.
- Agenda entirely within `s4`.
- Agenda crossing the `s4` start.
- Agenda crossing the `s4` end and preview start.
- Reversed, invalid, and oversized report ranges.
- Daily reminders where today is the last `s4` day and tomorrow is the first preview day.
- UTC-2 today differing from the browser/system UTC date.
- Optimized loading skips event documents for non-overlapping parents.
- Optimized and unoptimized results are byte-for-byte equivalent.
- Event-only report loading makes no `tips.json` requests.
- Missing active event document uses the documented empty-layer rule; a skipped inactive document is never requested.

### Admin fixtures

- General event list uses today in UTC-2.
- Agenda mode uses the selected date's stack.
- Editor pins its opening date.
- Editing an inherited event creates a conditional patch and never a local event.
- A conditional patch can explicitly remove an inherited optional field.
- Editing only `title` against the pinned `s4` baseline keeps the local title while untouched description/time values follow the active `main`, `s4`, and preview versions.
- An inherited patch is dormant when its ID is absent and reapplies if the same ID returns.
- An inherited event disappears when its source parent expires or removes it, regardless of stored overrides.
- Only explicit create/copy operations produce complete locally owned events.
- A copied local event survives source-parent expiration and removal.
- Reset on a date with an inherited version restores that date's parent result.
- Reset of a dormant override removes the conditional operation without creating an event.
- An inherited deletion is dormant while its ID is absent and reapplies if it returns.
- Deleting while the supplying parent is inactive still records an inherited deletion.
- Conditional patch and deletion collisions follow the documented operation order.
- An owned event plus inherited patch/delete for the same layer and ID is rejected during normalization.
- A published operation plus a browser-stored operation normalizes to the documented single final operation.
- Removing an owned copy that retained a parent ID reveals the date-applicable inherited event; a separate delete action then creates an inherited deletion.
- Editing and exporting a published locally owned event produces an updated complete owned record.
- Deleting a published locally owned event removes/suppresses its owned record rather than emitting an inherited deletion.
- Export on different dates produces identical local event JSON.
- Exported inherited patches remain conditional when loaded on a date without their parent.
- Exported explicitly owned events remain valid without a parent.
- Export preserves unmodified published entries, locally owned events, conditional patches, and conditional deletions.
- Inactive-layer brand, storage, and anchor configuration continues to merge.
- A full-looking downloaded inherited entry containing `title` converts to JSON Pointer override operations, never owned.
- Parentless downloaded records require audit acceptance; conversion refuses publication while any remain unresolved.
- Conversion is idempotent and atomic across all tag files.
- Event conversion bumps `storage.eventsSuffix` and old browser operation namespaces no longer hydrate.
- Exported pre-cutover browser work can be processed through the offline converter; production does not interpret old snapshots.
- Dormant patches and deletions remain discoverable and resettable in raw operation management.

### Cross-runtime fixture format

Store engine inputs and expected outputs as JSON, without browser or Python-specific behavior. The fixture should contain:

- Local tag
- Ordered lineage
- Configuration layers
- Event layers with explicit owned-event, inherited-patch, and inherited-deletion operations
- Explicit field-removal operations
- Requested dates/ranges
- Expected active source tags
- Expected effective events or rendered report content
- Expected errors for invalid cases

TypeScript tests invoke source functions directly. LWMinions tests send the equivalent request through `SerenityEngine.invoke` using the bundled artifact. A fixture version field allows intentional future schema migrations.

---

## Rollout Safety

There is no mixed-schema runtime period. The freshly downloaded live configuration is conversion input, and the converted graph is staged separately until both consumers and every tag validate.

Cut over in this order:

1. Reconcile the currently checked-in LWSerenity engine artifact and LWMinions packaged artifact; they are not presently byte-identical.
2. Build golden fixtures, new engine/loaders, and the offline converter without altering live configuration.
3. Run the converter across every downloaded tag into a staging directory.
4. Create every newly referenced tag document, including `s5_preview`, in staging.
5. Review and accept/amend every candidate-owned-event classification.
6. Increment `storage.eventsSuffix` for converted tags so old browser snapshots cannot hydrate into the new model.
7. Validate all explicit lineages, anchors/windows, schema versions, pointer paths, event ownership, references, and report fixtures against staging.
8. Build LWSerenity and the byte-identical LWMinions artifact against the final schemas.
9. Publish the converted configuration and compatible LWSerenity/LWMinions versions as one coordinated cutover. Older clients are unsupported after this point.
10. Run boundary-date smoke reports before restoring scheduled external delivery.

No tag file is published partially. Automated pre-deployment validation must prove the entire staged graph is resolvable and all files are version 2 before configuration is released.

---

## Implementation Phases

### Phase 0: Golden fixtures and failing tests

1. Reconcile and byte-compare the two existing engine artifacts as a preflight baseline.
2. Define the canonical lineage, events, edge cases, and expected per-day results.
3. Add TypeScript fixture readers and failing engine tests.
4. Add LWMinions fixture readers and failing bundled-runtime/client tests.
5. Review fixture semantics before changing production code.

### Phase 1: Shared metadata and date-aware composition

1. Extend shared tag metadata with optional `endDate`.
2. Add strict date and lineage validation helpers.
3. Define and validate the version 2 event-operation schema and normalized ABI.
4. Implement effective window resolution.
5. Implement `composeEventsForDate` using raw layers and explicit source ownership.
6. Add per-day agenda and daily-reminder operations.
7. Keep undated composition only for non-event consumers that genuinely do not require a date.

### Phase 2: LWSerenity loading and public views

1. Require explicit parent lineages and version 2 event operations.
2. Expose raw layers and range-aware fetch planning.
3. Replace public event-list and agenda composition paths.
4. Add date-aware cache keys and invalidation.
5. Verify UTC-2 rollover behavior.

### Phase 3: Admin persistence and export

1. Compose the general admin list for today and agenda views per selected date.
2. Pin editor composition dates.
3. Replace browser storage with explicit locally owned events, conditional inherited overrides, and conditional inherited deletions under a new suffix.
4. Calculate inherited JSON Pointer `set`/`remove` changes against the pinned inherited baseline.
5. Make reset-to-parent and deletion ownership date-aware/full-lineage-aware respectively.
6. Add raw dormant-operation management and operation-specific reset/removal actions.
7. Export owned events and conditional inherited operations without date-sensitive ownership inference.
8. Update inherited/local diff labels using the displayed or pinned date.

### Phase 4: LWMinions loader and reports

1. Require explicit parent lineages and version 2 event operations.
2. Add range-aware layer loading and fetch skipping.
3. Pass raw layers to agenda and reminder operations.
4. Add HTTP-client tests proving skipped and required documents.

### Phase 5: Artifact and full verification

1. Convert every downloaded live parent/event file in staging, invalidate old browser storage, and block on ambiguous ownership classification.
2. Build the trusted engine artifact.
3. Copy identical bytes to LWMinions.
4. Update the pinned artifact hash and engine version.
5. Run source, artifact, loader, report, admin, and cross-runtime fixture suites.
6. Run LWSerenity lint/build and targeted LWMinions tests.
7. Document configuration migration and rollout order.

---

## Expected Files and Areas of Change

### LWSerenity

- `lib/serenity-engine/core.ts`
- `lib/serenity-engine/composition.ts`
- New event-operation schema/types and strict version 2 normalization helpers
- `lib/serenity-engine/reports/agenda.ts`
- `lib/serenity-engine/reports/reminders.ts`
- `lib/serenity-engine/index.ts`
- New shared JSON fixtures and engine tests
- `lib/config-fetcher.ts`
- `lib/config-diff.ts`
- `lib/tag-overrides.ts`
- `lib/override-helpers.ts` for JSON Pointer operation creation and application
- `hooks/use-events.ts`
- Agenda, event-list, and event-dialog components
- New dormant-operation management component
- `components/admin-panel.tsx`
- `artifacts/lw-serenity-engine.js`
- Configuration documentation and one-time full-tag conversion tooling
- Published-event ownership classification/audit tooling and storage-suffix cutover

### LWMinions

- `src/lwminions/serenity/client.py`
- `src/lwminions/serenity/reports.py`
- `src/lwminions/serenity/runtime.py` artifact hash/version
- `src/lwminions/assets/serenity/lw-serenity-engine.js`
- Serenity client, report, runtime, and cross-runtime fixture tests

---

## Acceptance Criteria

- The explicit example lineage resolves and merges in the documented order.
- Parent event contributions are present only on dates inside their inclusive contextual windows.
- Expired patches and tombstones no longer affect later dates.
- Inherited edits and deletions never create or preserve an event when no active parent supplies its ID.
- Only explicit create/copy operations produce independently surviving local events.
- Agenda and reminder reports compose each day independently.
- General event lists use today in UTC-2; agenda views use their displayed date.
- Missing contextual starts fall back to validated required self anchors.
- Range-aware loading never requests non-overlapping parent event documents.
- Optimized and unoptimized composition return identical results.
- Every converted tag uses explicit `parents` and version 2 event operations; both runtimes reject legacy or mixed shapes.
- Inherited overrides use validated JSON Pointer `set`/`remove` operations and untouched fields continue following the active parent.
- Conditional inherited patches persist while dormant and reapply only if the same inherited ID returns.
- LWSerenity source and LWMinions' pinned artifact pass the same golden fixtures.
- Export preserves owned-event versus inherited-operation semantics regardless of export date.
- Event-only reports do not fetch tips and obey the documented missing-document contract.
- The built LWSerenity artifact and packaged LWMinions artifact are byte-identical, and the pinned hash matches those bytes.

---

## Decisions Captured by This Plan

- `parents` is nearest-to-root and represents a linear contextual lineage, not sibling mixins.
- Explicit `parents` is required; runtime backward compatibility for singular or mixed parent schemas is intentionally absent.
- Parent windows are inclusive and apply to event-layer contributions, not configuration metadata or tips.
- Missing contextual starts fall back to required self anchors.
- The local event layer is always active and applied last.
- External reports compose independently for every day.
- The general event list uses today in UTC-2; agenda views use the displayed date.
- Only explicit create/copy actions create locally owned events.
- Every edit or deletion of an inherited event remains conditional on that ID existing in the active lower parent stack.
- Dormant inherited operations never resurrect removed or expired parent events.
- Export preserves explicit ownership and conditional operation types without inferring them from a date-sensitive parent baseline.
- All downloaded live tags are converted and ownership-audited before the coordinated cutover; old browser event storage is invalidated by suffix.
- Fixture approval precedes production algorithm changes.

I reviewed the LWSerenity AWS rewrite spec. Overall: the core model is strong, especially the “current group writes only local overrides, reads return resolved inherited views” rule. That is a good foundation for preserving shared content while allowing group-specific customization. 

## Biggest strengths

The inheritance model is clear and practical. The distinction between source objects and resolved objects is especially important, and the spec explains it well.

The write behavior is also sound: inherited content should not be directly mutated; edits should create local overrides in the current group. That will prevent accidental changes to shared/global content.

The field-source tracking requirement is excellent. It will make the editor much easier to understand because users can see whether a title, date, report setting, or disabled state came from General, Season1, Holidays, Server1, or Alliance1.

The build order is sensible: data model, resolver, scheduling, APIs, frontend, reports, mobile. I would keep that order.

## Issues I would fix before implementation

### 1. The spec says “AWS” but does not actually choose an AWS architecture

Right now this is mostly a domain/data/API spec. It does not yet say whether the backend is Lambda, ECS/Fargate, App Runner, API Gateway, DynamoDB, Aurora/Postgres, OpenSearch, S3, CloudFront, Cognito, etc.

That decision matters because this system has graph-like inheritance, recursive resolution, search, permissions, and metadata. I would add an “AWS Architecture” section with at least:

* Auth provider: probably Cognito or external OIDC.
* API layer: API Gateway + Lambda, or ECS/Fargate if resolver/report generation is heavier.
* Primary database: DynamoDB if access patterns are simple and resolver cache is explicit; Aurora/Postgres if relational querying, constraints, and recursive validation matter more.
* Search: OpenSearch or Postgres full-text/trigram search if substring search is important.
* Assets: S3 + CloudFront for brand background/favicon.
* Observability: CloudWatch logs, metrics, tracing.
* Caching: Redis/ElastiCache or DynamoDB materialized resolved views.

My bias: **Postgres/Aurora would be easier than DynamoDB for v1** because inheritance validation, uniqueness checks, source-vs-resolved debugging, and admin queries are relational/graph-ish.

### 2. Date-scoped parent inheritance needs tighter rules

The spec says a parent outside the requested date range is ignored, but it needs exact interval semantics.

Define all of these explicitly:

```text
group_effective_start = parent_ref.start_date ?? group.start_date
group_effective_end = group_effective_start + duration_days - 1, if duration_days exists
parent applies if parent_interval overlaps requested_date_range
```

Also define what happens when there is **no requested date range**, for example reading a single event or reading a full resolved group.

Suggested default:

```text
If no date_range is provided, resolve all non-expired parents unless the API explicitly uses "today" as context.
```

For tips, the spec says date scope should usually be “now.” That is reasonable, but it should be a formal API default.

### 3. Effective start date propagation is the highest-risk concept

The idea that a parent can be resolved with a different effective start date is powerful, but it can get confusing fast.

You should define the resolver signature very explicitly, something like:

```ts
resolveGroup({
  groupId,
  effectiveStartDateOverride?,
  requestedDateRange?,
  includeDisabled,
  resolutionStack,
  requestingGroupId
})
```

Then document this rule:

```text
When a child resolves a parent with start_date override, that override becomes the parent group's effective start date for that entire resolution subtree unless another nested parent reference overrides it again.
```

Without that, implementers may disagree about whether Season1’s inherited General content should use Season1’s original start date, Server1’s override date, or General’s own start date.

### 4. Patch semantics need to be defined

This is a big one. Your merge rules say:

* missing keys do not overwrite
* null intentionally overwrites
* arrays replace
* writes with uuid update or create a local override

But API writes need separate semantics for:

1. setting a field,
2. setting a field to null,
3. deleting a local override field to reveal inherited value again,
4. replacing an array,
5. adding/removing one array item.

I would not rely on plain `PUT` alone. Add explicit `PATCH` behavior.

Example:

```json
{
  "set": {
    "title.en.content": "New title",
    "enabled": true
  },
  "unset": [
    "description.en.content"
  ],
  "replace": {
    "tags": ["season", "combat"]
  }
}
```

This matters because `null` means “override inherited value with empty,” while “remove my local override” means something different.

### 5. Enable/disable behavior is ambiguous

The spec says disable creates a local `enabled:false` override. Good.

But enabling is trickier. If Holidays disables an event and Alliance1 enables it, does Alliance1 set `enabled:true` and override Holidays? Probably yes.

But if Alliance1 previously disabled an inherited event and then clicks “enable,” should the system:

* remove Alliance1’s local `enabled:false`, revealing inherited state, or
* set Alliance1’s local `enabled:true`, overriding inherited disabled state?

Those are different actions.

I recommend exposing both concepts in the editor:

```text
Enable here = set enabled:true in current group.
Revert local enable/disable override = remove local enabled field.
```

### 6. There is a duration type inconsistency

The event example uses:

```json
{
  "count": 1,
  "type": "hours"
}
```

But the allowed duration types list does not include `hours`; it lists minutes, days, weeks, months, years.

Add `hours` to allowed duration types.

I would also consider whether recurrence should allow `hours` and `minutes`. If not, keep recurrence at days/weeks/months/years and duration at minutes/hours/days/weeks.

### 7. Timezone policy may be too simple for reports

The spec says the backend should not handle timezone conversion and should store dates as `YYYY-MM-DD` and times as `HH:MM`. That is good for floating schedule data.

But report generation needs a concept of “today,” “tomorrow,” and “end of day.” Those depend on timezone or server reset time.

I would add a group-level setting:

```json
{
  "time_policy": {
    "type": "floating",
    "timezone": "America/New_York",
    "reset_time": "00:00"
  }
}
```

Or, if the app is game-server-based:

```json
{
  "server_day_boundary": "00:00",
  "server_timezone": "UTC"
}
```

Even if the backend does not convert display times, it still needs a consistent day boundary for reports.

### 8. Recurrence needs more edge-case definitions

The basic recurrence model is good, but implementation will need answers for:

* If recurrence is every 2 days plus `days_of_week`, do you generate every 2 days first and then filter, or generate every matching weekday within the interval?
* How do monthly recurrences behave when the start date is Jan 31?
* Are `days_until_end` and recurrence end inclusive for all recurrence types?
* Can `duration` cross midnight?
* Can an occurrence continue past `days_until_end` if it starts on the final valid date? The spec implies yes, but state it directly.
* Are all-day multi-day events allowed?

For v1, I would keep recurrence simple: daily/weekly only, optional days-of-week filter, then add monthly/yearly later.

### 9. Search requirements may require a real search index

The spec includes title substring, description substring, tags, report type, date range, enabled status, and friendly ID search.

That is more than a simple primary-key lookup. Either define database indexes carefully or add a search layer.

For v1, I would separate:

```text
Exact/filter search: database query.
Full-text/substring search: OpenSearch or Postgres full-text/trigram.
Date occurrence search: resolver + occurrence generator, probably cached.
```

Event search by date range is especially expensive because it requires resolving inheritance and expanding recurrences.

### 10. Permissions need inherited-read rules

The current rule says users get permissions through group memberships and writes happen only to the current group. Good.

But define this explicitly:

```text
If a user has read access to Alliance1, can they see inherited content from General, Season1, Server1, and Holidays even if they do not directly have access to those groups?
```

I assume yes, because otherwise resolved views break. But the API should not necessarily allow them to browse/edit those parent groups directly.

Suggested rule:

```text
Read access to a group allows reading its resolved view, including inherited content.
Direct source reads/writes for a group require explicit permission on that group.
```

### 11. Add versioning, audit logs, and conflict handling

Because this is an inheritance-heavy editor, I strongly recommend adding:

```json
{
  "version": 7,
  "created_at": "...",
  "created_by": "...",
  "updated_at": "...",
  "updated_by": "..."
}
```

For writes:

```text
Require expected_version for updates.
Reject or warn on version conflict.
```

Also keep an audit trail for who disabled, enabled, deleted, or changed dates. This will be very useful when inherited schedules change unexpectedly.

### 12. Clarify hard delete vs inherited delete further

The delete/disable distinction is good. I would add one more rule:

```text
If an object is owned by the current group and is hard-deleted, local overrides for that same uuid should also be removed or made unreachable.
```

Also define whether deleting a parent-owned source object affects child overrides. For example:

```text
General creates event-1.
Alliance1 overrides event-1 title.
General later deletes event-1.
What happens to Alliance1's local override?
```

Options:

* It becomes an orphaned override and is hidden unless promoted.
* It becomes a local object if it has enough required fields.
* It remains disabled/unresolved until the parent source returns.

I would choose the first option and expose it in admin tools.

## Smaller cleanups

The “Text object” is described as reusable, but the schema shows embedded text maps. Decide whether Text is truly a separate object or just an embedded field format.

The section heading `owner_group_id` and the bullet using `source_group_id` appear to conflict. I would standardize terminology around:

```text
object_source_group
field_sources
local_override_group
owned_by_current_group
```

`friendly_id` uniqueness needs a precise scope. I recommend unique per object type per resolved group view, but that may create conflicts when two parents define the same friendly ID. At minimum, detect and return a conflict.

The reports section says “Tomorrow Report,” but the description says “Previous-day reports.” I would pick one name. Maybe `tomorrow` is the API key and “Preparation report” is the user-facing name.

The spec should define response shape for resolved objects. For example:

```json
{
  "data": {},
  "meta": {},
  "occurrences": []
}
```

Do not mix resolved schedule occurrence fields too deeply into the source event object unless you clearly separate them.

## My recommended next additions

Before coding, I would add five short sections:

1. **AWS architecture and storage choice**
2. **Resolver function contract and cache key**
3. **PATCH/write semantics, including unset/revert**
4. **Date-scope interval math**
5. **Permissions for resolved inherited reads vs direct source access**

The spec is already strong enough to guide implementation direction. The main risk is not the object model; it is ambiguity around dates, patching, enable/revert behavior, and resolver performance.

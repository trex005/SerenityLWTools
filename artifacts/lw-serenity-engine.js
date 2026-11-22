"use strict";
var LWSerenityEngine = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // lib/serenity-engine/index.ts
  var index_exports = {};
  __export(index_exports, {
    ENGINE_VERSION: () => ENGINE_VERSION,
    SerenityEngineError: () => SerenityEngineError,
    composeConfiguration: () => composeConfiguration,
    composeEventsForDate: () => composeEventsForDate,
    generateAgenda: () => generateAgenda,
    generateAgendaFromLayers: () => generateAgendaFromLayers,
    generateDailyReminders: () => generateDailyReminders,
    generateDailyRemindersFromLayers: () => generateDailyRemindersFromLayers,
    invoke: () => invoke,
    nextScheduleOccurrence: () => nextScheduleOccurrence,
    normalizeEventOperations: () => normalizeEventOperations,
    validateNormalizedEventOperations: () => validateNormalizedEventOperations
  });

  // lib/serenity-engine/errors.ts
  var SerenityEngineError = class extends Error {
    constructor(code, message) {
      super(message);
      this.code = code;
      this.name = "SerenityEngineError";
    }
  };
  var engineError = (code, message) => {
    throw new SerenityEngineError(code, message);
  };

  // lib/serenity-engine/core.ts
  var ENGINE_VERSION = "0.5.0";
  var DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
  var DAY_MS = 864e5;
  var WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  var dateKeyToDay = (dateKey) => {
    const match = DATE_KEY.exec(dateKey);
    if (!match) return engineError("INVALID_DATE", `Invalid date key ${JSON.stringify(dateKey)}`);
    const [year, month, day] = match.slice(1).map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
      engineError("INVALID_DATE", `Invalid date key ${JSON.stringify(dateKey)}`);
    }
    return Math.floor(timestamp / DAY_MS);
  };
  var validateReportDateRange = (startDate, endDate) => {
    const start = dateKeyToDay(startDate);
    const end = dateKeyToDay(endDate);
    if (end < start) engineError("INVALID_DATE_RANGE", "Report startDate must not be after endDate");
    const inclusiveDays = end - start + 1;
    if (inclusiveDays > 366) engineError("LIMIT_EXCEEDED", "Reports are limited to 366 inclusive days");
    return inclusiveDays;
  };
  var dayToDateKey = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);
  var addDateKeyDays = (dateKey, amount) => dayToDateKey(dateKeyToDay(dateKey) + Math.trunc(amount));
  var resolveRecurrenceDateKey = (startTag, offsetDays, tagConfig) => {
    const startDate = tagConfig.tags?.[startTag]?.startDate;
    if (!startDate) throw new Error(`No startDate found for tag "${startTag}" in tagConfig`);
    return addDateKeyDays(startDate.slice(0, 10), offsetDays);
  };
  var weekdayForDateKey = (dateKey) => WEEKDAYS[new Date(dateKeyToDay(dateKey) * DAY_MS).getUTCDay()];
  var occursInCycle = (targetDateKey, startDateKey, periodDays, onPeriods, offPeriods, allowedWeekdays, endDateKey) => {
    const targetDay = dateKeyToDay(targetDateKey);
    const startDay = dateKeyToDay(startDateKey);
    if (targetDay < startDay || endDateKey && targetDay > dateKeyToDay(endDateKey)) return false;
    const safePeriodDays = Math.max(Math.trunc(periodDays), 1);
    const effectiveOn = Math.max(Math.trunc(onPeriods), 0);
    const effectiveOff = Math.max(Math.trunc(offPeriods), 0);
    const cyclePeriods = effectiveOn + effectiveOff;
    const cycleDays = safePeriodDays * (cyclePeriods === 0 ? 1 : cyclePeriods);
    const position = ((targetDay - startDay) % cycleDays + cycleDays) % cycleDays;
    const inOnBlock = position < safePeriodDays * effectiveOn;
    return inOnBlock && (!allowedWeekdays?.length || allowedWeekdays.includes(weekdayForDateKey(targetDateKey)));
  };
  var eventOccursOnDate = (event, targetDateKey, tagConfig, adminModeView = false) => {
    if (!adminModeView && event.dateIncludeOverrides?.[targetDateKey] !== void 0) {
      return event.dateIncludeOverrides[targetDateKey];
    }
    const recurrence = event.recurrence;
    if (!recurrence || recurrence.type !== "days" && recurrence.type !== "weeks" && recurrence.type !== "month_end") return false;
    try {
      const start = resolveRecurrenceDateKey(recurrence.startTag, recurrence.startOffset, tagConfig);
      const end = recurrence.endOffset === void 0 ? void 0 : resolveRecurrenceDateKey(recurrence.startTag, recurrence.endOffset, tagConfig);
      if (recurrence.type === "month_end") {
        const day = dateKeyToDay(targetDateKey);
        if (day < dateKeyToDay(start) || end && day > dateKeyToDay(end)) return false;
        return new Date((day + 1) * DAY_MS).getUTCDate() === 1;
      }
      return occursInCycle(
        targetDateKey,
        start,
        recurrence.type === "days" ? 1 : 7,
        recurrence.onPeriods,
        recurrence.offPeriods,
        recurrence.daysOfWeek,
        end
      );
    } catch {
      return false;
    }
  };

  // lib/serenity-engine/event-operations.ts
  var own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  var isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
  var clone = (value) => JSON.parse(JSON.stringify(value));
  var UNSAFE_SEGMENTS = /* @__PURE__ */ new Set(["__proto__", "prototype", "constructor"]);
  var normalizedValidationCache = /* @__PURE__ */ new WeakMap();
  var assertId = (value, context) => {
    if (typeof value !== "string" || !value.trim()) throw new Error(`${context} must have a non-empty string id`);
    return value;
  };
  var assertJsonValue = (value, context) => {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;
    if (typeof value === "number" && Number.isFinite(value)) return;
    if (Array.isArray(value)) {
      value.forEach((item, index) => assertJsonValue(item, `${context}[${index}]`));
      return;
    }
    if (isObject(value)) {
      for (const [key, item] of Object.entries(value)) {
        if (UNSAFE_SEGMENTS.has(key)) throw new Error(`${context} contains unsafe object key ${JSON.stringify(key)}`);
        assertJsonValue(item, `${context}.${key}`);
      }
      return;
    }
    throw new Error(`${context} must contain only JSON values`);
  };
  var decodeJsonPointer = (pointer) => {
    if (typeof pointer !== "string" || pointer === "" || !pointer.startsWith("/")) {
      throw new Error(`Override pointer ${JSON.stringify(pointer)} must be a non-root RFC 6901 JSON Pointer`);
    }
    return pointer.slice(1).split("/").map((encoded) => {
      if (/~(?:[^01]|$)/.test(encoded)) throw new Error(`Invalid JSON Pointer escape in ${JSON.stringify(pointer)}`);
      const segment = encoded.replace(/~1/g, "/").replace(/~0/g, "~");
      if (UNSAFE_SEGMENTS.has(segment)) throw new Error(`Unsafe JSON Pointer segment ${JSON.stringify(segment)}`);
      return segment;
    });
  };
  var overlaps = (left, right) => {
    const length = Math.min(left.length, right.length);
    return left.slice(0, length).every((segment, index) => segment === right[index]);
  };
  var validatePointers = (set, remove, id) => {
    const pointers = [...Object.keys(set), ...remove];
    const decoded = pointers.map(decodeJsonPointer);
    decoded.forEach((segments, index) => {
      if (segments[0] === "id") throw new Error(`Override for ${JSON.stringify(id)} cannot change /id`);
      for (let other = index + 1; other < decoded.length; other += 1) {
        if (overlaps(segments, decoded[other])) {
          throw new Error(`Override for ${JSON.stringify(id)} has overlapping pointers ${JSON.stringify(pointers[index])} and ${JSON.stringify(pointers[other])}`);
        }
      }
    });
  };
  var normalizeEventOperationsUnsafe = (document) => {
    if (!isObject(document) || document.schemaVersion !== 2 || !Array.isArray(document.operations)) {
      throw new Error("Event document must use schemaVersion 2 and an operations array");
    }
    if (document.operations.length > 1e4) throw new Error("An event layer cannot contain more than 10000 operations");
    if (own(document, "events")) throw new Error("Event document cannot mix version 2 operations with legacy events");
    const normalized = {
      ownedEventsById: /* @__PURE__ */ Object.create(null),
      inheritedOverridesById: /* @__PURE__ */ Object.create(null),
      inheritedDeletedIds: []
    };
    const ids = /* @__PURE__ */ new Set();
    for (const raw of document.operations) {
      if (!isObject(raw) || !["owned", "override", "delete"].includes(String(raw.kind))) {
        throw new Error(`Unknown or malformed event operation kind ${JSON.stringify(raw && raw.kind)}`);
      }
      let id;
      if (raw.kind === "owned") {
        if (!isObject(raw.event)) throw new Error("Owned operation must contain a complete event object");
        id = assertId(raw.event.id, "Owned event");
        if (typeof raw.event.title !== "string" || !raw.event.title.trim()) {
          throw new Error(`Owned event ${JSON.stringify(id)} must have a non-empty title`);
        }
        assertJsonValue(raw.event, `Owned event ${JSON.stringify(id)}`);
        normalized.ownedEventsById[id] = clone(raw.event);
      } else if (raw.kind === "override") {
        id = assertId(raw.id, "Override operation");
        if (!isObject(raw.set)) throw new Error(`Override for ${JSON.stringify(id)} must contain a set object`);
        const remove = raw.remove === void 0 ? [] : raw.remove;
        if (!Array.isArray(remove) || remove.some((pointer) => typeof pointer !== "string")) {
          throw new Error(`Override for ${JSON.stringify(id)} remove must be an array of pointers`);
        }
        validatePointers(raw.set, remove, id);
        assertJsonValue(raw.set, `Override for ${JSON.stringify(id)} set`);
        normalized.inheritedOverridesById[id] = {
          setByPointer: clone(raw.set),
          removePointers: [...remove]
        };
      } else {
        id = assertId(raw.id, "Delete operation");
        normalized.inheritedDeletedIds.push(id);
      }
      if (ids.has(id)) throw new Error(`Layer has more than one operation for event ${JSON.stringify(id)}`);
      ids.add(id);
    }
    return normalized;
  };
  var normalizeEventOperations = (document) => {
    try {
      return normalizeEventOperationsUnsafe(document);
    } catch (error) {
      if (error instanceof SerenityEngineError) throw error;
      throw new SerenityEngineError(
        /more than 10000/.test(error instanceof Error ? error.message : "") ? "LIMIT_EXCEEDED" : "INVALID_EVENT_OPERATIONS",
        error instanceof Error ? error.message : String(error)
      );
    }
  };
  var validateNormalizedEventOperations = (value) => {
    try {
      if (!isObject(value) || !isObject(value.ownedEventsById) || !isObject(value.inheritedOverridesById) || !Array.isArray(value.inheritedDeletedIds)) {
        throw new Error("Normalized event operations must contain owned, override, and deleted collections");
      }
      const cached = normalizedValidationCache.get(value);
      if (cached) return cached;
      const operations = [];
      for (const [id, event] of Object.entries(value.ownedEventsById)) {
        if (!isObject(event) || event.id !== id) throw new Error(`Owned event map key ${JSON.stringify(id)} must match event.id`);
        operations.push({ kind: "owned", event });
      }
      for (const [id, operation] of Object.entries(value.inheritedOverridesById)) {
        if (!isObject(operation) || !isObject(operation.setByPointer) || !Array.isArray(operation.removePointers)) {
          throw new Error(`Malformed normalized override for ${JSON.stringify(id)}`);
        }
        operations.push({
          kind: "override",
          id,
          set: operation.setByPointer,
          remove: operation.removePointers
        });
      }
      for (const id of value.inheritedDeletedIds) operations.push({ kind: "delete", id });
      const normalized = normalizeEventOperations({ schemaVersion: 2, operations });
      normalizedValidationCache.set(value, normalized);
      return normalized;
    } catch (error) {
      if (error instanceof SerenityEngineError) throw error;
      throw new SerenityEngineError("INVALID_EVENT_OPERATIONS", error instanceof Error ? error.message : String(error));
    }
  };
  var arrayIndex = (segment, length, allowAppend) => {
    if (allowAppend && segment === "-") return length;
    if (!/^(0|[1-9]\d*)$/.test(segment)) return null;
    return Number(segment);
  };
  var setByJsonPointer = (target, pointer, value) => {
    const segments = decodeJsonPointer(pointer);
    let cursor = target;
    for (let index = 0; index < segments.length - 1; index += 1) {
      const segment = segments[index];
      const nextSegment = segments[index + 1];
      if (Array.isArray(cursor)) {
        const position = arrayIndex(segment, cursor.length, false);
        if (position === null || position >= cursor.length) throw new Error(`JSON Pointer parent does not exist: ${JSON.stringify(pointer)}`);
        if (cursor[position] === null || typeof cursor[position] !== "object") {
          cursor[position] = /^(0|[1-9]\d*|-)$/.test(nextSegment) ? [] : {};
        }
        cursor = cursor[position];
      } else if (isObject(cursor)) {
        if (!isObject(cursor[segment]) && !Array.isArray(cursor[segment])) {
          cursor[segment] = /^(0|[1-9]\d*|-)$/.test(nextSegment) ? [] : {};
        }
        cursor = cursor[segment];
      } else throw new Error(`JSON Pointer cannot traverse a scalar: ${JSON.stringify(pointer)}`);
    }
    const final = segments[segments.length - 1];
    if (Array.isArray(cursor)) {
      const position = arrayIndex(final, cursor.length, true);
      if (position === null || position > cursor.length) throw new Error(`Invalid array JSON Pointer ${JSON.stringify(pointer)}`);
      cursor[position] = clone(value);
    } else if (isObject(cursor)) cursor[final] = clone(value);
    else throw new Error(`JSON Pointer cannot address a scalar: ${JSON.stringify(pointer)}`);
  };
  var removeByJsonPointer = (target, pointer) => {
    const segments = decodeJsonPointer(pointer);
    let cursor = target;
    for (const segment of segments.slice(0, -1)) {
      if (Array.isArray(cursor)) {
        const position = arrayIndex(segment, cursor.length, false);
        if (position === null || position >= cursor.length) return;
        cursor = cursor[position];
      } else if (isObject(cursor) && own(cursor, segment)) cursor = cursor[segment];
      else return;
    }
    const final = segments[segments.length - 1];
    if (Array.isArray(cursor)) {
      const position = arrayIndex(final, cursor.length, false);
      if (position !== null && position < cursor.length) cursor.splice(position, 1);
    } else if (isObject(cursor)) delete cursor[final];
  };
  var applyJsonPointerOverride = (event, operation) => {
    const result = clone(event);
    for (const [pointer, value] of Object.entries(operation.setByPointer)) setByJsonPointer(result, pointer, value);
    for (const pointer of operation.removePointers) removeByJsonPointer(result, pointer);
    return result;
  };

  // lib/serenity-engine/composition.ts
  var isObject2 = (value) => Object.prototype.toString.call(value) === "[object Object]";
  var clone2 = (value) => JSON.parse(JSON.stringify(value));
  var deepMergeJson = (base, patch) => {
    if (patch == null) return base ?? {};
    if (base == null || !isObject2(base) || !isObject2(patch)) return clone2(patch);
    const result = { ...base };
    for (const key of Object.keys(patch)) {
      const next = patch[key];
      const previous = base[key];
      if (Array.isArray(next)) result[key] = clone2(next);
      else if (isObject2(next)) result[key] = deepMergeJson(isObject2(previous) ? previous : {}, next);
      else result[key] = next;
    }
    return result;
  };
  var idMap = (items = []) => Object.fromEntries(
    items.filter((item) => item && typeof item.id === "string").map((item) => [item.id, clone2(item)])
  );
  var applyOverrideSnapshot = (current, snapshot) => {
    if (!snapshot) return current;
    const result = snapshot.legacyItems?.length ? idMap(snapshot.legacyItems) : { ...current };
    for (const [id, patch] of Object.entries(snapshot.overridesById ?? {})) {
      result[id] = deepMergeJson(result[id], patch);
    }
    for (const id of snapshot.deletedIds ?? []) delete result[id];
    return result;
  };
  var mergeItemLayer = (inherited, items, tombstones = [], requireTitleForNew = false) => {
    const result = { ...inherited };
    for (const [id, patch] of Object.entries(items)) {
      if (requireTitleForNew && !result[id] && typeof patch?.title !== "string") continue;
      result[id] = deepMergeJson(result[id], patch);
    }
    for (const id of tombstones) delete result[id];
    return result;
  };
  var composeConfiguration = (layers) => {
    let config = {};
    let events = {};
    let tips = {};
    for (const layer of layers) {
      config = deepMergeJson(config, layer.config ?? {});
      const layerEvents = applyOverrideSnapshot(idMap(layer.events), layer.eventOverrides);
      const eventDeletes = /* @__PURE__ */ new Set([...layer.eventTombstones ?? [], ...layer.eventOverrides?.deletedIds ?? []]);
      events = mergeItemLayer(events, layerEvents, eventDeletes, true);
      const layerTips = applyOverrideSnapshot(idMap(layer.tips), layer.tipOverrides);
      const tipDeletes = /* @__PURE__ */ new Set([...layer.tipTombstones ?? [], ...layer.tipOverrides?.deletedIds ?? []]);
      tips = mergeItemLayer(tips, layerTips, tipDeletes);
    }
    return { tagConfig: config, events: Object.values(events), tips: Object.values(tips) };
  };
  var assertTagMetadata = (value, tag, context) => {
    if (!isObject2(value)) throw new Error(`${context} metadata for tag ${JSON.stringify(tag)} must be an object`);
    return value;
  };
  var optionalDate = (value, field, tag) => {
    if (value === void 0) return void 0;
    if (typeof value !== "string") throw new Error(`${field} for tag ${JSON.stringify(tag)} must be a YYYY-MM-DD date`);
    dateKeyToDay(value);
    if (value.length !== 10) throw new Error(`${field} for tag ${JSON.stringify(tag)} must be a YYYY-MM-DD date`);
    return value;
  };
  var emptyOperations = () => ({
    ownedEventsById: /* @__PURE__ */ Object.create(null),
    inheritedOverridesById: /* @__PURE__ */ Object.create(null),
    inheritedDeletedIds: []
  });
  var composeEventsForDate = ({
    layers,
    date,
    localTag
  }) => {
    dateKeyToDay(date);
    if (!layers.length) engineError("INVALID_LAYERS", "Date-aware composition requires at least one configuration layer");
    if (layers.length > 33) engineError("LIMIT_EXCEEDED", "Date-aware composition supports at most 32 parents plus the local layer");
    const effectiveLocalTag = localTag ?? layers[layers.length - 1].tag;
    if (layers[layers.length - 1].tag !== effectiveLocalTag) {
      throw new Error(`Local tag ${JSON.stringify(effectiveLocalTag)} must be the final root-to-leaf layer`);
    }
    const layerTags = /* @__PURE__ */ new Set();
    const selfMetadata = /* @__PURE__ */ Object.create(null);
    let tagConfig = {};
    for (const layer of layers) {
      if (!/^[A-Za-z0-9_-]+$/.test(layer.tag) || layerTags.has(layer.tag)) {
        throw new Error(`Duplicate or unsafe configuration layer tag ${JSON.stringify(layer.tag)}`);
      }
      layerTags.add(layer.tag);
      const ownTags = layer.config?.tags;
      const self = assertTagMetadata(ownTags?.[layer.tag], layer.tag, "Self");
      optionalDate(self.startDate, "Self startDate", layer.tag);
      if (self.startDate === void 0) throw new Error(`Missing required self startDate for tag ${JSON.stringify(layer.tag)}`);
      if (self.endDate !== void 0 && self.endDate !== null) optionalDate(self.endDate, "Self endDate", layer.tag);
      selfMetadata[layer.tag] = self;
      tagConfig = deepMergeJson(tagConfig, layer.config ?? {});
    }
    const activeSourceTags = [];
    const effectiveEvents = /* @__PURE__ */ Object.create(null);
    const sourceTagById = /* @__PURE__ */ Object.create(null);
    for (const layer of layers) {
      const contextualRaw = tagConfig.tags?.[layer.tag];
      if (contextualRaw === null) throw new Error(`Contextual metadata for tag ${JSON.stringify(layer.tag)} cannot be null`);
      const contextual = contextualRaw === void 0 ? selfMetadata[layer.tag] : assertTagMetadata(contextualRaw, layer.tag, "Contextual");
      if (Object.prototype.hasOwnProperty.call(contextual, "startDate") && contextual.startDate === null) {
        throw new Error(`Contextual startDate for tag ${JSON.stringify(layer.tag)} cannot be null`);
      }
      const start = optionalDate(contextual.startDate ?? selfMetadata[layer.tag].startDate, "Effective startDate", layer.tag);
      let end;
      if (Object.prototype.hasOwnProperty.call(contextual, "endDate")) {
        end = contextual.endDate === null ? void 0 : optionalDate(contextual.endDate, "Effective endDate", layer.tag);
      } else if (selfMetadata[layer.tag].endDate !== null) {
        end = optionalDate(selfMetadata[layer.tag].endDate, "Effective endDate", layer.tag);
      }
      if (end && dateKeyToDay(end) < dateKeyToDay(start)) {
        throw new Error(`Effective endDate precedes startDate for tag ${JSON.stringify(layer.tag)}`);
      }
      const active = layer.tag === effectiveLocalTag || dateKeyToDay(start) <= dateKeyToDay(date) && (!end || dateKeyToDay(date) <= dateKeyToDay(end));
      if (!active) continue;
      activeSourceTags.push(layer.tag);
      const operations = validateNormalizedEventOperations(layer.eventOperations ?? emptyOperations());
      const operationCount = Object.keys(operations.ownedEventsById).length + Object.keys(operations.inheritedOverridesById).length + operations.inheritedDeletedIds.length;
      if (operationCount > 1e4) engineError("LIMIT_EXCEEDED", `Event layer ${JSON.stringify(layer.tag)} exceeds 10000 operations`);
      const lowerIds = new Set(Object.keys(effectiveEvents));
      for (const [id, event] of Object.entries(operations.ownedEventsById)) {
        effectiveEvents[id] = clone2(event);
        sourceTagById[id] = layer.tag;
      }
      for (const [id, operation] of Object.entries(operations.inheritedOverridesById)) {
        if (lowerIds.has(id)) effectiveEvents[id] = applyJsonPointerOverride(effectiveEvents[id], operation);
      }
      for (const id of operations.inheritedDeletedIds) {
        if (lowerIds.has(id)) {
          delete effectiveEvents[id];
          delete sourceTagById[id];
        }
      }
    }
    return {
      tagConfig,
      events: Object.values(effectiveEvents),
      activeSourceTags,
      sourceTagById,
      localOwnedIds: Object.entries(sourceTagById).filter(([, tag]) => tag === effectiveLocalTag).map(([id]) => id)
    };
  };

  // lib/serenity-engine/reports/reminders.ts
  var BULLET_PREFIX = "\u2022 ";
  var effectiveValue = (event, dateKey, weekday, property) => {
    const dateValue = event?.dateOverrides?.[dateKey]?.[property];
    if (dateValue !== void 0) return dateValue;
    const variationValue = event?.variations?.[weekday]?.[property];
    return variationValue !== void 0 ? variationValue : event?.[property];
  };
  var visibleEvents = (events, dateKey, tagConfig) => {
    const weekday = weekdayForDateKey(dateKey);
    return events.filter((event) => {
      if (!event || event.archived || !eventOccursOnDate(event, dateKey, tagConfig)) return false;
      if (event.dateOverrides?.[dateKey]?.hidden === true) return false;
      if (event.variations?.[weekday]?.hidden === true) return false;
      return event.dateIncludeOverrides?.[dateKey] !== false;
    });
  };
  var reminderLine = (event, dateKey) => {
    const weekday = weekdayForDateKey(dateKey);
    const rawTitle = effectiveValue(event, dateKey, weekday, "title") ?? event.title ?? "Untitled event";
    const title = typeof rawTitle === "string" ? rawTitle.trim() || "Untitled event" : "Untitled event";
    const rawStart = effectiveValue(event, dateKey, weekday, "startTime");
    const startTime = typeof rawStart === "string" ? rawStart.trim() : "";
    const rawAllDay = effectiveValue(event, dateKey, weekday, "isAllDay");
    const isAllDay = typeof rawAllDay === "boolean" ? rawAllDay : false;
    const hasTimedStart = Boolean(startTime) && !isAllDay;
    return {
      event,
      line: `${hasTimedStart ? `${startTime} - ` : BULLET_PREFIX}${title}`,
      title,
      startTime,
      hasTimedStart
    };
  };
  var compareLines = (a, b) => {
    if (a.hasTimedStart !== b.hasTimedStart) return a.hasTimedStart ? -1 : 1;
    if (a.hasTimedStart) {
      const time = a.startTime.localeCompare(b.startTime);
      if (time) return time;
    } else {
      const order = (Number.isFinite(a.event?.order_value) ? a.event.order_value : 0) - (Number.isFinite(b.event?.order_value) ? b.event.order_value : 0);
      if (order) return order;
    }
    const title = a.title.localeCompare(b.title, void 0, { sensitivity: "base" });
    return title || String(a.event?.id ?? "").localeCompare(String(b.event?.id ?? ""));
  };
  var duration = (totalMinutes) => {
    if (totalMinutes <= 0) return "0 minutes";
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const parts2 = [];
    if (hours) parts2.push(`${hours} hour${hours === 1 ? "" : "s"}`);
    if (minutes) parts2.push(`${minutes} minute${minutes === 1 ? "" : "s"}`);
    return parts2.join(" ");
  };
  var generateDailyReminders = ({
    events,
    tagConfig,
    reportDate,
    minutesUntilReset
  }) => {
    const tomorrow = addDateKeyDays(reportDate, 1);
    const todayEvents = visibleEvents(events, reportDate, tagConfig);
    const tomorrowEvents = visibleEvents(events, tomorrow, tagConfig);
    const select = (items, dateKey, property) => items.filter((event) => Boolean(effectiveValue(event, dateKey, weekdayForDateKey(dateKey), property))).map((event) => reminderLine(event, dateKey)).sort(compareLines).map(({ line }) => line);
    const dayReminders = select(todayEvents, reportDate, "remindEndOfDay");
    const tomorrowReminders = select(tomorrowEvents, tomorrow, "remindTomorrow");
    const sections = [`Reset in ${duration(minutesUntilReset)}!`];
    if (tomorrowReminders.length) sections.push(`Tomorrow:
${tomorrowReminders.join("\n")}`);
    if (dayReminders.length) sections.push(`Reminders:
${dayReminders.join("\n")}`);
    return {
      content: sections.join("\n\n"),
      dayReminders,
      tomorrowReminders,
      todayEventCount: todayEvents.length,
      tomorrowEventCount: tomorrowEvents.length
    };
  };
  var generateDailyRemindersFromLayers = ({
    layers,
    localTag,
    reportDate,
    minutesUntilReset
  }) => {
    const tomorrow = addDateKeyDays(reportDate, 1);
    const todayComposition = composeEventsForDate({ layers, localTag, date: reportDate });
    const tomorrowComposition = composeEventsForDate({ layers, localTag, date: tomorrow });
    const today = visibleEvents(todayComposition.events, reportDate, todayComposition.tagConfig);
    const next = visibleEvents(tomorrowComposition.events, tomorrow, tomorrowComposition.tagConfig);
    const select = (items, dateKey, property) => items.filter((event) => Boolean(effectiveValue(event, dateKey, weekdayForDateKey(dateKey), property))).map((event) => reminderLine(event, dateKey)).sort(compareLines).map(({ line }) => line);
    const dayReminders = select(today, reportDate, "remindEndOfDay");
    const tomorrowReminders = select(next, tomorrow, "remindTomorrow");
    const sections = [`Reset in ${duration(minutesUntilReset)}!`];
    if (tomorrowReminders.length) sections.push(`Tomorrow:
${tomorrowReminders.join("\n")}`);
    if (dayReminders.length) sections.push(`Reminders:
${dayReminders.join("\n")}`);
    return {
      content: sections.join("\n\n"),
      dayReminders,
      tomorrowReminders,
      todayEventCount: today.length,
      tomorrowEventCount: next.length
    };
  };

  // lib/serenity-engine/reports/agenda.ts
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  var WEEKDAYS2 = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  var parts = (dateKey) => {
    const [year, month, day] = dateKey.split("-").map(Number);
    return { year, month, day, weekday: new Date(Date.UTC(year, month - 1, day)).getUTCDay() };
  };
  var shortDate = (dateKey, withYear = false) => {
    const value = parts(dateKey);
    return `${MONTHS[value.month - 1]} ${value.day}${withYear ? `, ${value.year}` : ""}`;
  };
  var dayHeader = (dateKey) => {
    const value = parts(dateKey);
    return `${WEEKDAYS2[value.weekday]}, ${MONTHS[value.month - 1]} ${value.day}`;
  };
  var formatIndentedDescription = (description) => description ? description.split("\n").map((line) => `  ${line}`).join("\n") : "";
  var hashString = (value) => {
    let hash = 0;
    for (let index = 0; index < value.length; index += 1) hash = (hash << 5) - hash + value.charCodeAt(index) | 0;
    return String(hash);
  };
  var effectiveValue2 = (event, property, weekday, dateKey) => {
    const dateValue = event.dateOverrides?.[dateKey]?.[property];
    if (dateValue !== void 0) return dateValue;
    const variationValue = event.variations?.[weekday]?.[property];
    return variationValue !== void 0 ? variationValue : event[property];
  };
  var includedOnDate = (event, dateKey, tagConfig) => {
    if (!event || event.archived || event.includeInBriefing === false) return false;
    if (!eventOccursOnDate(event, dateKey, tagConfig)) return false;
    const weekday = weekdayForDateKey(dateKey);
    if (event.dateOverrides?.[dateKey]?.hidden === true) return false;
    if (event.variations?.[weekday]?.hidden === true) return false;
    return event.dateIncludeOverrides?.[dateKey] !== false;
  };
  var orderValue = (event) => Number.isFinite(event?.order_value) ? event.order_value : 0;
  var eventTitle = (event) => typeof event?.title === "string" && event.title.trim() ? event.title : event?.id ? `[Untitled event: ${event.id}]` : "[Untitled event]";
  var compareForDate = (a, b, weekday, dateKey) => {
    const aAllDay = Boolean(effectiveValue2(a, "isAllDay", weekday, dateKey));
    const bAllDay = Boolean(effectiveValue2(b, "isAllDay", weekday, dateKey));
    if (aAllDay !== bAllDay) return aAllDay ? 1 : -1;
    if (!aAllDay) {
      const time = String(effectiveValue2(a, "startTime", weekday, dateKey) || "00:00").localeCompare(String(effectiveValue2(b, "startTime", weekday, dateKey) || "00:00"));
      if (time) return time;
    } else {
      const order = orderValue(a) - orderValue(b);
      if (order) return order;
      const title = eventTitle(a).localeCompare(eventTitle(b), void 0, { sensitivity: "base" });
      if (title) return title;
      return String(a?.id ?? "").localeCompare(String(b?.id ?? ""));
    }
    return 0;
  };
  var generateAgendaWithResolver = ({
    resolve,
    startDate,
    endDate,
    referenceDate
  }) => {
    validateReportDateRange(startDate, endDate);
    let content = `Schedule for ${shortDate(startDate)} - ${shortDate(endDate, true)}

`;
    const includedDescriptions = /* @__PURE__ */ new Set();
    const tomorrow = referenceDate ? addDateKeyDays(referenceDate, 1) : void 0;
    let eventCount = 0;
    for (let dateKey = startDate; dateKey <= endDate; dateKey = addDateKeyDays(dateKey, 1)) {
      const { events, tagConfig } = resolve(dateKey);
      const weekday = weekdayForDateKey(dateKey);
      const dateEvents = events.filter((event) => includedOnDate(event, dateKey, tagConfig)).sort((a, b) => compareForDate(a, b, weekday, dateKey));
      if (!dateEvents.length) continue;
      let header = dayHeader(dateKey);
      if (dateKey === referenceDate) header = `Today: ${header}`;
      else if (dateKey === tomorrow) header = `Tomorrow: ${header}`;
      content += `${header}
`;
      for (const event of dateEvents) {
        const isAllDay = Boolean(effectiveValue2(event, "isAllDay", weekday, dateKey));
        const startTime = effectiveValue2(event, "startTime", weekday, dateKey);
        const endTime = effectiveValue2(event, "endTime", weekday, dateKey);
        const description = effectiveValue2(event, "description", weekday, dateKey);
        let time = "";
        if (!isAllDay && startTime) time = `${startTime}${endTime ? ` - ${endTime}` : ""}: `;
        content += `- ${time}${event.title}`;
        if (description) {
          const key = `${event.id}-${hashString(String(description))}`;
          if (!includedDescriptions.has(key)) {
            content += `
${formatIndentedDescription(String(description))}`;
            includedDescriptions.add(key);
          }
        }
        content += "\n";
        eventCount += 1;
      }
      content += "\n";
    }
    return { content, eventCount };
  };
  var generateAgenda = ({
    events,
    tagConfig,
    startDate,
    endDate,
    referenceDate
  }) => generateAgendaWithResolver({
    resolve: () => ({ events, tagConfig }),
    startDate,
    endDate,
    referenceDate
  });
  var generateAgendaFromLayers = ({
    layers,
    localTag,
    startDate,
    endDate,
    referenceDate
  }) => generateAgendaWithResolver({
    resolve: (date) => composeEventsForDate({ layers, localTag, date }),
    startDate,
    endDate,
    referenceDate
  });

  // lib/serenity-engine/schedule.ts
  var RFC3339 = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
  var UNIT_MS = {
    seconds: 1e3,
    minutes: 6e4,
    hours: 36e5,
    days: 864e5,
    weeks: 6048e5
  };
  var requireObject = (value, name) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`${name} must be an object`);
    }
    return value;
  };
  var requireNonNegativeInteger = (value, name) => {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
      throw new Error(`${name} must be a non-negative safe integer`);
    }
    return Number(value);
  };
  var parseTimestamp = (value, name) => {
    if (typeof value !== "string" || !RFC3339.test(value)) {
      throw new Error(`${name} must be an RFC 3339 datetime with a timezone`);
    }
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) throw new Error(`${name} is invalid`);
    return timestamp;
  };
  var durationFor = (schedule) => schedule.duration_seconds === void 0 ? void 0 : requireNonNegativeInteger(schedule.duration_seconds, "duration_seconds") * 1e3;
  var resultFor = (runAtMs, durationMs, recurring, endAtMs) => ({
    runAtMs,
    ...endAtMs === void 0 && durationMs === void 0 ? {} : {
      endAtMs: endAtMs ?? runAtMs + Number(durationMs)
    },
    recurring
  });
  var nextScheduleOccurrence = (scheduleValue, nowMs, includeActiveWindow = false) => {
    const schedule = requireObject(scheduleValue, "schedule");
    if (schedule.version !== 1) throw new Error("schedule.version must be 1");
    if (!Number.isSafeInteger(nowMs)) throw new Error("nowMs must be a safe integer");
    const durationMs = durationFor(schedule);
    if (schedule.type === "one_time") {
      const start = requireObject(schedule.start, "start");
      let runAtMs;
      if (start.kind === "datetime") {
        runAtMs = parseTimestamp(start.datetime, "start.datetime");
      } else if (start.kind === "delay") {
        const delayMs = requireNonNegativeInteger(start.delay_seconds, "start.delay_seconds") * 1e3;
        const anchorMs = start.anchor_at === void 0 ? nowMs : parseTimestamp(start.anchor_at, "start.anchor_at");
        runAtMs = anchorMs + delayMs;
      } else {
        throw new Error("one_time start.kind must be datetime or delay");
      }
      const explicitEnd = schedule.end === void 0 ? void 0 : (() => {
        if (durationMs !== void 0) throw new Error("one_time schedule cannot use both end and duration_seconds");
        const end = requireObject(schedule.end, "end");
        if (end.kind !== "datetime") throw new Error("end.kind must be datetime");
        return parseTimestamp(end.datetime, "end.datetime");
      })();
      if (explicitEnd !== void 0 && explicitEnd <= runAtMs) {
        throw new Error("end.datetime must be after the scheduled start");
      }
      const endAtMs = explicitEnd ?? (durationMs === void 0 ? void 0 : runAtMs + durationMs);
      const active = endAtMs !== void 0 && runAtMs <= nowMs && nowMs < endAtMs;
      if (runAtMs < nowMs && !(includeActiveWindow && active)) {
        throw new Error("one_time schedule has no future occurrence");
      }
      return resultFor(runAtMs, durationMs, false, explicitEnd);
    }
    if (schedule.type === "recurring") {
      const untilMs = schedule.until === void 0 ? void 0 : parseTimestamp(schedule.until, "until");
      const frequency = requireObject(schedule.frequency, "frequency");
      const interval = requireNonNegativeInteger(frequency.interval, "frequency.interval");
      if (interval < 1) throw new Error("frequency.interval must be at least 1");
      const unit = frequency.unit;
      if (typeof unit !== "string" || !(unit in UNIT_MS)) {
        throw new Error("frequency.unit must be seconds, minutes, hours, days, or weeks");
      }
      const periodMs = interval * UNIT_MS[unit];
      if (!Number.isSafeInteger(periodMs)) throw new Error("frequency is too large");
      const startMs = schedule.start === void 0 ? nowMs : (() => {
        const start = requireObject(schedule.start, "start");
        if (start.kind !== "datetime") throw new Error("recurring start.kind must be datetime");
        return parseTimestamp(start.datetime, "start.datetime");
      })();
      const elapsed = nowMs - startMs;
      if (includeActiveWindow && durationMs !== void 0 && elapsed >= 0) {
        const previousSteps = Math.floor(elapsed / periodMs);
        const previousStart = startMs + previousSteps * periodMs;
        if (previousStart <= nowMs && nowMs < previousStart + durationMs) {
          if (untilMs !== void 0 && previousStart > untilMs) {
            throw new Error("recurring schedule has no occurrence before until");
          }
          return resultFor(previousStart, durationMs, true);
        }
      }
      const steps = elapsed <= 0 ? 0 : Math.ceil(elapsed / periodMs);
      const runAtMs = startMs + steps * periodMs;
      if (untilMs !== void 0 && runAtMs > untilMs) {
        throw new Error("recurring schedule has no occurrence before until");
      }
      return resultFor(runAtMs, durationMs, true);
    }
    throw new Error("schedule.type must be one_time or recurring");
  };

  // lib/serenity-engine/index.ts
  var invoke = (requestJson) => {
    try {
      const request = JSON.parse(requestJson);
      if (!request?.input || ![
        "daily-reminders",
        "agenda",
        "compose",
        "schedule-next",
        "compose-events-for-date",
        "agenda-from-layers",
        "daily-reminders-from-layers",
        "normalize-event-operations"
      ].includes(request.operation)) {
        throw new Error(`Unsupported Serenity engine operation ${JSON.stringify(request?.operation)}`);
      }
      const result = request.operation === "daily-reminders" ? generateDailyReminders(request.input) : request.operation === "agenda" ? generateAgenda(request.input) : request.operation === "compose" ? composeConfiguration(request.input.layers) : request.operation === "compose-events-for-date" ? composeEventsForDate(request.input) : request.operation === "agenda-from-layers" ? generateAgendaFromLayers(request.input) : request.operation === "daily-reminders-from-layers" ? generateDailyRemindersFromLayers(request.input) : request.operation === "normalize-event-operations" ? normalizeEventOperations(request.input.document) : nextScheduleOccurrence(
        request.input.schedule,
        request.input.nowMs,
        request.input.includeActiveWindow
      );
      return JSON.stringify({
        ok: true,
        engineVersion: ENGINE_VERSION,
        result
      });
    } catch (error) {
      return JSON.stringify({
        ok: false,
        engineVersion: ENGINE_VERSION,
        errorCode: error instanceof SerenityEngineError ? error.code : "INVALID_REQUEST",
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  return __toCommonJS(index_exports);
})();

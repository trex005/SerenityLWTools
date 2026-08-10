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
    composeConfiguration: () => composeConfiguration,
    generateAgenda: () => generateAgenda,
    generateDailyReminders: () => generateDailyReminders,
    invoke: () => invoke
  });

  // lib/serenity-engine/core.ts
  var ENGINE_VERSION = "0.1.0";
  var DATE_KEY = /^(\d{4})-(\d{2})-(\d{2})$/;
  var DAY_MS = 864e5;
  var WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
  var dateKeyToDay = (dateKey) => {
    const match = DATE_KEY.exec(dateKey);
    if (!match) throw new Error(`Invalid date key ${JSON.stringify(dateKey)}`);
    const [year, month, day] = match.slice(1).map(Number);
    const timestamp = Date.UTC(year, month - 1, day);
    const parsed = new Date(timestamp);
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
      throw new Error(`Invalid date key ${JSON.stringify(dateKey)}`);
    }
    return Math.floor(timestamp / DAY_MS);
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
    if (!recurrence || recurrence.type !== "days" && recurrence.type !== "weeks") return false;
    try {
      const start = resolveRecurrenceDateKey(recurrence.startTag, recurrence.startOffset, tagConfig);
      const end = recurrence.endOffset === void 0 ? void 0 : resolveRecurrenceDateKey(recurrence.startTag, recurrence.endOffset, tagConfig);
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
  var generateAgenda = ({
    events,
    tagConfig,
    startDate,
    endDate,
    referenceDate
  }) => {
    let content = `Schedule for ${shortDate(startDate)} - ${shortDate(endDate, true)}

`;
    const includedDescriptions = /* @__PURE__ */ new Set();
    const tomorrow = referenceDate ? addDateKeyDays(referenceDate, 1) : void 0;
    let eventCount = 0;
    for (let dateKey = startDate; dateKey <= endDate; dateKey = addDateKeyDays(dateKey, 1)) {
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

  // lib/serenity-engine/composition.ts
  var isObject = (value) => Object.prototype.toString.call(value) === "[object Object]";
  var clone = (value) => JSON.parse(JSON.stringify(value));
  var deepMergeJson = (base, patch) => {
    if (patch == null) return base ?? {};
    if (base == null || !isObject(base) || !isObject(patch)) return clone(patch);
    const result = { ...base };
    for (const key of Object.keys(patch)) {
      const next = patch[key];
      const previous = base[key];
      if (Array.isArray(next)) result[key] = clone(next);
      else if (isObject(next)) result[key] = deepMergeJson(isObject(previous) ? previous : {}, next);
      else result[key] = next;
    }
    return result;
  };
  var idMap = (items = []) => Object.fromEntries(
    items.filter((item) => item && typeof item.id === "string").map((item) => [item.id, clone(item)])
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

  // lib/serenity-engine/index.ts
  var invoke = (requestJson) => {
    try {
      const request = JSON.parse(requestJson);
      if (!request?.input || !["daily-reminders", "agenda", "compose"].includes(request.operation)) {
        throw new Error(`Unsupported Serenity engine operation ${JSON.stringify(request?.operation)}`);
      }
      const result = request.operation === "daily-reminders" ? generateDailyReminders(request.input) : request.operation === "agenda" ? generateAgenda(request.input) : composeConfiguration(request.input.layers);
      return JSON.stringify({
        ok: true,
        engineVersion: ENGINE_VERSION,
        result
      });
    } catch (error) {
      return JSON.stringify({
        ok: false,
        engineVersion: ENGINE_VERSION,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  };
  return __toCommonJS(index_exports);
})();

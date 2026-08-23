import { dateKeyToDay } from "./core"
import {
  applyJsonPointerOverride,
  validateNormalizedEventOperations,
  type JsonObject,
  type NormalizedEventOperations,
} from "./event-operations"
import { engineError } from "./errors"

export type OverrideSnapshot = {
  overridesById?: Record<string, any>
  deletedIds?: string[]
  legacyItems?: any[] | null
}

export type ConfigurationLayer = {
  tag: string
  config?: Record<string, any> | null
  events?: any[]
  eventTombstones?: string[]
  tips?: any[]
  tipTombstones?: string[]
  eventOverrides?: OverrideSnapshot | null
  tipOverrides?: OverrideSnapshot | null
  /** Strict version 2 operations. Legacy fields above are ignored by date-aware composition. */
  eventOperations?: NormalizedEventOperations
}

const isObject = (value: any): value is Record<string, any> =>
  Object.prototype.toString.call(value) === "[object Object]"

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

export const deepMergeJson = <T extends Record<string, any>>(
  base: T | undefined | null,
  patch: Partial<T> | undefined | null,
): T => {
  if (patch == null) return (base ?? {}) as T
  if (base == null || !isObject(base) || !isObject(patch)) return clone(patch) as T
  const result: Record<string, any> = { ...base }
  for (const key of Object.keys(patch)) {
    const next = (patch as any)[key]
    const previous = (base as any)[key]
    if (Array.isArray(next)) result[key] = clone(next)
    else if (isObject(next)) result[key] = deepMergeJson(isObject(previous) ? previous : {}, next)
    else result[key] = next
  }
  return result as T
}

const idMap = (items: any[] = []): Record<string, any> => Object.fromEntries(
  items.filter((item) => item && typeof item.id === "string").map((item) => [item.id, clone(item)]),
)

export const applyOverrideSnapshot = (
  current: Record<string, any>,
  snapshot?: OverrideSnapshot | null,
): Record<string, any> => {
  if (!snapshot) return current
  const result = snapshot.legacyItems?.length ? idMap(snapshot.legacyItems) : { ...current }
  for (const [id, patch] of Object.entries(snapshot.overridesById ?? {})) {
    result[id] = deepMergeJson(result[id], patch)
  }
  for (const id of snapshot.deletedIds ?? []) delete result[id]
  return result
}

export const mergeItemLayer = (
  inherited: Record<string, any>,
  items: Record<string, any>,
  tombstones: Iterable<string> = [],
  requireTitleForNew = false,
): Record<string, any> => {
  const result: Record<string, any> = { ...inherited }
  for (const [id, patch] of Object.entries(items)) {
    if (requireTitleForNew && !result[id] && typeof patch?.title !== "string") continue
    result[id] = deepMergeJson(result[id], patch)
  }
  for (const id of tombstones) delete result[id]
  return result
}

export const composeConfiguration = (layers: ConfigurationLayer[]) => {
  let config: Record<string, any> = {}
  let events: Record<string, any> = {}
  let tips: Record<string, any> = {}
  for (const layer of layers) {
    config = deepMergeJson(config, layer.config ?? {})
    const layerEvents = applyOverrideSnapshot(idMap(layer.events), layer.eventOverrides)
    const eventDeletes = new Set([...(layer.eventTombstones ?? []), ...(layer.eventOverrides?.deletedIds ?? [])])
    events = mergeItemLayer(events, layerEvents, eventDeletes, true)
    const layerTips = applyOverrideSnapshot(idMap(layer.tips), layer.tipOverrides)
    const tipDeletes = new Set([...(layer.tipTombstones ?? []), ...(layer.tipOverrides?.deletedIds ?? [])])
    tips = mergeItemLayer(tips, layerTips, tipDeletes)
  }
  return { tagConfig: config, events: Object.values(events), tips: Object.values(tips) }
}

export type DateComposition = {
  tagConfig: Record<string, any>
  events: JsonObject[]
  activeSourceTags: string[]
  /** The tag whose explicit owned operation gives the effective event its lifetime. */
  sourceTagById: Record<string, string>
  /** Convenience classification for admin edit behavior. */
  localOwnedIds: string[]
}

const assertTagMetadata = (value: unknown, tag: string, context: string): Record<string, unknown> => {
  if (!isObject(value)) throw new Error(`${context} metadata for tag ${JSON.stringify(tag)} must be an object`)
  return value
}

const optionalDate = (value: unknown, field: string, tag: string): string | undefined => {
  if (value === undefined) return undefined
  if (typeof value !== "string") throw new Error(`${field} for tag ${JSON.stringify(tag)} must be a YYYY-MM-DD date`)
  dateKeyToDay(value)
  if (value.length !== 10) throw new Error(`${field} for tag ${JSON.stringify(tag)} must be a YYYY-MM-DD date`)
  return value
}

const emptyOperations = (): NormalizedEventOperations => ({
  ownedEventsById: Object.create(null),
  inheritedOverridesById: Object.create(null),
  inheritedDeletedIds: [],
})

export const composeEventsForDate = ({
  layers,
  date,
  localTag,
}: {
  layers: ConfigurationLayer[]
  date: string
  localTag?: string
}): DateComposition => {
  dateKeyToDay(date)
  if (!layers.length) engineError("INVALID_LAYERS", "Date-aware composition requires at least one configuration layer")
  if (layers.length > 33) engineError("LIMIT_EXCEEDED", "Date-aware composition supports at most 32 parents plus the local layer")
  const effectiveLocalTag = localTag ?? layers[layers.length - 1].tag
  if (layers[layers.length - 1].tag !== effectiveLocalTag) {
    throw new Error(`Local tag ${JSON.stringify(effectiveLocalTag)} must be the final root-to-leaf layer`)
  }
  const layerTags = new Set<string>()
  const selfMetadata: Record<string, Record<string, unknown>> = Object.create(null)
  let tagConfig: Record<string, any> = {}
  for (const layer of layers) {
    if (!/^[A-Za-z0-9_-]+$/.test(layer.tag) || layerTags.has(layer.tag)) {
      throw new Error(`Duplicate or unsafe configuration layer tag ${JSON.stringify(layer.tag)}`)
    }
    layerTags.add(layer.tag)
    const ownTags = layer.config?.tags
    const self = assertTagMetadata(ownTags?.[layer.tag], layer.tag, "Self")
    optionalDate(self.startDate, "Self startDate", layer.tag)
    if (self.startDate === undefined) throw new Error(`Missing required self startDate for tag ${JSON.stringify(layer.tag)}`)
    if (self.endDate !== undefined && self.endDate !== null) optionalDate(self.endDate, "Self endDate", layer.tag)
    selfMetadata[layer.tag] = self
    tagConfig = deepMergeJson(tagConfig, layer.config ?? {})
  }

  const activeSourceTags: string[] = []
  const effectiveEvents: Record<string, JsonObject> = Object.create(null)
  const sourceTagById: Record<string, string> = Object.create(null)
  for (const layer of layers) {
    const contextualRaw = tagConfig.tags?.[layer.tag]
    if (contextualRaw === null) throw new Error(`Contextual metadata for tag ${JSON.stringify(layer.tag)} cannot be null`)
    const contextual = contextualRaw === undefined
      ? selfMetadata[layer.tag]
      : assertTagMetadata(contextualRaw, layer.tag, "Contextual")
    if (Object.prototype.hasOwnProperty.call(contextual, "startDate") && contextual.startDate === null) {
      throw new Error(`Contextual startDate for tag ${JSON.stringify(layer.tag)} cannot be null`)
    }
    const start = optionalDate(contextual.startDate ?? selfMetadata[layer.tag].startDate, "Effective startDate", layer.tag)!
    let end: string | undefined
    if (Object.prototype.hasOwnProperty.call(contextual, "endDate")) {
      end = contextual.endDate === null ? undefined : optionalDate(contextual.endDate, "Effective endDate", layer.tag)
    } else if (selfMetadata[layer.tag].endDate !== null) {
      end = optionalDate(selfMetadata[layer.tag].endDate, "Effective endDate", layer.tag)
    }
    if (end && dateKeyToDay(end) < dateKeyToDay(start)) {
      throw new Error(`Effective endDate precedes startDate for tag ${JSON.stringify(layer.tag)}`)
    }
    const active = layer.tag === effectiveLocalTag || (dateKeyToDay(start) <= dateKeyToDay(date)
      && (!end || dateKeyToDay(date) <= dateKeyToDay(end)))
    if (!active) continue
    activeSourceTags.push(layer.tag)
    const operations = validateNormalizedEventOperations(layer.eventOperations ?? emptyOperations())
    const operationCount = Object.keys(operations.ownedEventsById).length
      + Object.keys(operations.inheritedOverridesById).length
      + operations.inheritedDeletedIds.length
    if (operationCount > 10_000) engineError("LIMIT_EXCEEDED", `Event layer ${JSON.stringify(layer.tag)} exceeds 10000 operations`)
    const lowerIds = new Set(Object.keys(effectiveEvents))
    for (const [id, event] of Object.entries(operations.ownedEventsById)) {
      effectiveEvents[id] = clone(event)
      sourceTagById[id] = layer.tag
    }
    for (const [id, operation] of Object.entries(operations.inheritedOverridesById)) {
      if (lowerIds.has(id)) effectiveEvents[id] = applyJsonPointerOverride(effectiveEvents[id], operation)
    }
    for (const id of operations.inheritedDeletedIds) {
      if (lowerIds.has(id)) {
        delete effectiveEvents[id]
        delete sourceTagById[id]
      }
    }
  }
  return {
    tagConfig,
    events: Object.values(effectiveEvents),
    activeSourceTags,
    sourceTagById,
    localOwnedIds: Object.entries(sourceTagById).filter(([, tag]) => tag === effectiveLocalTag).map(([id]) => id),
  }
}

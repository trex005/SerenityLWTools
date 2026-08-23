"use client"

import { getActiveTag, getTagOverride, sanitizeTag, setActiveTag } from "./config-tag"
import { arrayToIdMap, idMapToArray, computeDelta } from "./config-merge"
import { deepMergeJson as deepMerge, mergeItemLayer } from "./serenity-engine/composition"
import {
  readStoredEventOverrides,
  readStoredEventOperations,
  readStoredTipOverrides,
  type StoredOverrideSnapshot,
  hasAdminAccessForTag,
  isAdminModeEnabledForTag,
  registerTagStorageSuffixes,
} from "./scoped-storage"
import { formatInAppTimezone, getAppTodayKey } from "./date-utils"
import { loadDateScopedConfiguration, validateExplicitParents } from "./date-scoped-config"
import type { DateComposition } from "./serenity-engine/composition"
import type { NormalizedEventOperations } from "./serenity-engine/event-operations"

type DomainMapping = {
  tag?: string
  [key: string]: unknown
}

interface RootConfig {
  updated?: string
  domains?: Record<string, DomainMapping>
  defaultTag?: string
  [key: string]: unknown
}

export interface TagBundle {
  tag: string
  tagConfig: Record<string, unknown> | null
  events: any[]
  tips: any[]
  updated: {
    root: string | null
    tagConfig: string | null
    events: string | null
    tips: string | null
  }
}

export type FetchOptions = {
  includeAncestorLocalOverrides?: boolean
  currentTag?: string
  dataTypes?: DataType[]
}

type TagLayer = {
  tag: string
  config: any | null
  events: any[]
  eventsTombstones: Set<string>
  eventsUpdated: string | null
  tips: any[]
  tipsTombstones: Set<string>
  tipsUpdated: string | null
}

interface CacheEntry {
  data: TagBundle
  timestamp: number
}

type DataType = "events" | "tips"
type CacheVariant = "remote" | "local"

type TagDataSnapshot = {
  tag: string
  parent: string | null
  itemsById: Record<string, any>
  tombstones: Set<string>
  updated: string | null
}

type ResolvedDataSnapshot = {
  tag: string
  itemsById: Record<string, any>
  updated: string | null
}

type CachedEntry<T> = {
  snapshot: T
  timestamp: number
}

type CacheStore<T> = Record<CacheVariant, Map<string, T>>

const normalizeTypes = (types?: DataType[]): DataType[] => {
  if (!types) return ["events", "tips"]
  if (types.length === 0) return []
  return Array.from(new Set(types)).sort()
}

const extractStorageSuffixes = (config: any): { events: string; tips: string } => {
  if (!config || typeof config !== "object") {
    return { events: "", tips: "" }
  }
  const storage = (config as any).storage
  if (!storage || typeof storage !== "object") {
    return { events: "", tips: "" }
  }
  return {
    events: typeof storage.eventsSuffix === "string" ? storage.eventsSuffix.trim() : "",
    tips: typeof storage.tipsSuffix === "string" ? storage.tipsSuffix.trim() : "",
  }
}

const buildLayerCacheKey = (tag: string, types?: DataType[]): string => {
  const normalizedTag = sanitizeTag(tag) || tag
  return `${normalizedTag}|${normalizeTypes(types).join(",")}`
}

const layerCache = new Map<string, CachedEntry<TagLayer>>()
const layerInFlight = new Map<string, Promise<TagLayer>>()

const tagDataCacheByType: Record<DataType, CacheStore<CachedEntry<TagDataSnapshot>>> = {
  events: { remote: new Map(), local: new Map() },
  tips: { remote: new Map(), local: new Map() },
}

const tagDataInFlightByType: Record<DataType, CacheStore<Promise<TagDataSnapshot>>> = {
  events: { remote: new Map(), local: new Map() },
  tips: { remote: new Map(), local: new Map() },
}

const resolvedCacheByType: Record<DataType, CacheStore<CachedEntry<ResolvedDataSnapshot>>> = {
  events: { remote: new Map(), local: new Map() },
  tips: { remote: new Map(), local: new Map() },
}

const resolvedInFlightByType: Record<DataType, CacheStore<Promise<ResolvedDataSnapshot>>> = {
  events: { remote: new Map(), local: new Map() },
  tips: { remote: new Map(), local: new Map() },
}

const isCacheEntryValid = <T>(entry: CachedEntry<T> | undefined): boolean => {
  if (!entry) return false
  return Date.now() - entry.timestamp < CACHE_TTL
}

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const CONFIG_URL = process.env.CONFIG_URL || ""
const CACHE_TTL = 5 * 60 * 1000

const cacheByTag: CacheStore<CacheEntry> = { remote: new Map(), local: new Map() }
const inFlightByTag: CacheStore<Promise<TagBundle>> = { remote: new Map(), local: new Map() }

let cachedRootConfig: RootConfig | null = null
let cachedRootTimestamp = 0
let rootPromise: Promise<RootConfig> | null = null

const withCacheBuster = (url: string) => {
  const separator = url.includes("?") ? "&" : "?"
  return `${url}${separator}t=${Date.now()}`
}

const normalizeBasePath = (path: string): string => {
  const trimmed = path.replace(/^\//, "").replace(/\/$/, "")
  return trimmed
}

const buildUrl = (segment: string): string => {
  const normalizedSegment = segment.replace(/^\//, "")
  if (CONFIG_URL) {
    const base = CONFIG_URL.replace(/\/$/, "")
    return withCacheBuster(`${base}/${normalizedSegment}`)
  }
  const prefix = normalizeBasePath("/conf")
  return withCacheBuster(`/${prefix}/${normalizedSegment}`)
}

const fetchJson = async (segment: string): Promise<any | null> => {
  try {
    const response = await fetch(buildUrl(segment), {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    })

    if (!response.ok) {
      return null
    }

    const contentType = response.headers.get("content-type")
    if (contentType && !contentType.includes("application/json")) {
      return null
    }

    return await response.json()
  } catch (error) {
    console.warn(`Error fetching ${segment}:`, error)
    return null
  }
}

const fetchRootConfig = async (force = false): Promise<RootConfig> => {
  const now = Date.now()

  if (!force && cachedRootConfig && now - cachedRootTimestamp < CACHE_TTL) {
    return cachedRootConfig
  }

  if (!force && rootPromise) {
    return rootPromise
  }

  if (force) {
    rootPromise = null
    cachedRootConfig = null
    cachedRootTimestamp = 0
  }

  rootPromise = (async () => {
    const rootConfig = (await fetchJson("default.json")) ?? {}
    cachedRootConfig = rootConfig
    cachedRootTimestamp = Date.now()
    rootPromise = null
    return rootConfig
  })()

  return rootPromise
}

const normalizeEvents = (events: any[]): any[] => {
  if (!Array.isArray(events)) return []
  return events.map((event) => {
    const normalized = event && typeof event === "object" ? event : {}
    return {
      ...normalized,
      archived: normalized.archived === true,
    }
  })
}

const extractArray = (payload: any, key: string): { items: any[]; updated: string | null } => {
  if (!payload) {
    return { items: [], updated: null }
  }
  if (Array.isArray(payload)) {
    const updated = typeof payload[0]?.updated === "string" ? payload[0].updated : null
    return { items: payload, updated }
  }
  const updated = typeof payload.updated === "string" ? payload.updated : null
  const items = Array.isArray(payload[key]) ? payload[key] : []
  return { items, updated }
}

const sanitizeDomainTag = (value: unknown): string | null => {
  if (typeof value !== "string") return null
  return sanitizeTag(value)
}

const resolveTag = (root: RootConfig): string => {
  const override = getTagOverride()
  if (override) {
    return override
  }

  const hostname = typeof window !== "undefined" ? window.location.hostname : ""
  const domainTag = hostname && root.domains ? sanitizeDomainTag(root.domains[hostname]?.tag) : null
  if (domainTag) {
    return domainTag
  }

  const defaultTag = sanitizeDomainTag(root.defaultTag)
  if (defaultTag) {
    return defaultTag
  }

  throw new Error("Unable to resolve configuration tag")
}

const fetchLayerFromSource = async (tag: string, types?: DataType[]): Promise<TagLayer> => {
  const normalizedTypes = normalizeTypes(types)
  const wantsEvents = normalizedTypes.includes("events")
  const wantsTips = normalizedTypes.includes("tips")

  const [configPayload, eventsPayload, tipsPayload] = await Promise.all([
    fetchJson(`${tag}/conf.json`),
    wantsEvents ? fetchJson(`${tag}/events.json`) : Promise.resolve(null),
    wantsTips ? fetchJson(`${tag}/tips.json`) : Promise.resolve(null),
  ])

  registerTagStorageSuffixes(tag, extractStorageSuffixes(configPayload))

  const eventsObj = wantsEvents ? extractArray(eventsPayload, "events") : { items: [], updated: null }
  const tipsObj = wantsTips ? extractArray(tipsPayload, "tips") : { items: [], updated: null }

  const events = normalizeEvents(eventsObj.items || [])
  const tips = Array.isArray(tipsObj.items) ? tipsObj.items : []

  const eventsTombstones = new Set<string>()
  const tipsTombstones = new Set<string>()

  for (const e of events) {
    if (e && e.id && e.deleted === true) eventsTombstones.add(e.id)
  }
  for (const t of tips) {
    if (t && t.id && t.deleted === true) tipsTombstones.add(t.id)
  }

  return {
    tag,
    config: configPayload && typeof configPayload === "object" ? { ...configPayload } : null,
    events,
    eventsTombstones,
    eventsUpdated: eventsObj.updated || null,
    tips,
    tipsTombstones,
    tipsUpdated: tipsObj.updated || null,
  }
}

const getLayer = async (tag: string, force = false, types?: DataType[]): Promise<TagLayer> => {
  const normalizedTag = sanitizeTag(tag) || tag
  if (!normalizedTag) {
    throw new Error("Invalid tag provided")
  }

  const cacheKey = buildLayerCacheKey(normalizedTag, types)

  if (force) {
    for (const key of Array.from(layerCache.keys())) {
      if (key.startsWith(`${normalizedTag}|`)) layerCache.delete(key)
    }
    for (const key of Array.from(layerInFlight.keys())) {
      if (key.startsWith(`${normalizedTag}|`)) layerInFlight.delete(key)
    }
  } else {
    const cached = layerCache.get(cacheKey)
    if (isCacheEntryValid(cached)) {
      return cached!.snapshot
    }
    const pending = layerInFlight.get(cacheKey)
    if (pending) {
      return pending
    }
  }

  const promise = (async () => {
    const data = await fetchLayerFromSource(normalizedTag, types)
    layerCache.set(cacheKey, { snapshot: data, timestamp: Date.now() })
    return data
  })()

  layerInFlight.set(cacheKey, promise)
  try {
    return await promise
  } finally {
    layerInFlight.delete(cacheKey)
  }
}

const getParentTag = (layer: TagLayer | null): string | null => {
  if (!layer || !layer.config) return null
  const parents = validateExplicitParents(layer.config, layer.tag)
  return parents[0] ?? null
}

const buildAncestry = async (leafTag: string): Promise<string[]> => {
  const leaf = await getLayer(leafTag, false, [])
  const parents = validateExplicitParents(leaf.config, leafTag)
  for (const parent of parents) {
    const parentLayer = await getLayer(parent, false, [])
    validateExplicitParents(parentLayer.config, parent)
  }
  return [...parents].reverse().concat(leafTag)
}

const shouldUseLocalOverrides = (tag: string, options?: ResolveOptions): boolean => {
  if (!options?.includeLocalOverrides) return false
  const currentTag = options.currentTag || getActiveTag()
  if (!isAdminModeEnabledForTag(currentTag)) return false
  return hasAdminAccessForTag(tag)
}

const getVariantForTag = (tag: string, options?: ResolveOptions): CacheVariant =>
  shouldUseLocalOverrides(tag, options) ? "local" : "remote"

// Resolved and bundle caches represent an entire ancestry chain. They must be
// local whenever the request is allowed to consult local overrides, even if the
// leaf itself has no stored access/data and only one of its ancestors does.
const getResolveVariant = (options?: ResolveOptions): CacheVariant => {
  if (!options?.includeLocalOverrides) return "remote"
  const currentTag = options.currentTag || getActiveTag()
  return isAdminModeEnabledForTag(currentTag) ? "local" : "remote"
}

const cloneIdMapFromArray = (items: any[]): Record<string, any> => {
  const map = arrayToIdMap(items || [])
  for (const id of Object.keys(map)) {
    map[id] = cloneJson(map[id])
  }
  return map
}

const cloneIdMap = (items: Record<string, any>): Record<string, any> => {
  const map: Record<string, any> = {}
  for (const id of Object.keys(items || {})) {
    map[id] = cloneJson(items[id])
  }
  return map
}

type ResolveOptions = {
  includeLocalOverrides?: boolean
  force?: boolean
  currentTag?: string
  types?: DataType[]
}

const getTagDataSnapshot = async (
  type: DataType,
  tag: string,
  options: ResolveOptions = {},
): Promise<TagDataSnapshot> => {
  const normalizedTag = sanitizeTag(tag) || tag
  if (!normalizedTag) {
    throw new Error("Invalid tag provided")
  }

  const variant = getVariantForTag(normalizedTag, options)
  const cache = tagDataCacheByType[type][variant]
  const inFlight = tagDataInFlightByType[type][variant]

  if (options.force) {
    cache.delete(normalizedTag)
    inFlight.delete(normalizedTag)
  } else {
    const cached = cache.get(normalizedTag)
    if (isCacheEntryValid(cached)) {
      return cached!.snapshot
    }
    const pending = inFlight.get(normalizedTag)
    if (pending) {
      return pending
    }
  }

  const promise = (async () => {
    const layer = await getLayer(normalizedTag, options.force, [type])
    const parent = getParentTag(layer)
    const baseItems = (type === "events" ? layer.events : layer.tips) || []
    const filtered = baseItems.filter((item: any) => item && item.deleted !== true)
    let itemsById = cloneIdMapFromArray(filtered)
    const tombstones = new Set<string>(
      type === "events" ? Array.from(layer.eventsTombstones) : Array.from(layer.tipsTombstones),
    )
    const updated = type === "events" ? layer.eventsUpdated : layer.tipsUpdated

    if (variant === "local") {
      const snapshot =
        type === "events" ? readStoredEventOverrides(normalizedTag) : readStoredTipOverrides(normalizedTag)
      if (snapshot) {
        itemsById = applyOverrideSnapshotToMap(itemsById, snapshot)
        if (snapshot.deletedIds) {
          for (const id of snapshot.deletedIds) {
            tombstones.add(id)
          }
        }
      }
    }

    const snapshot: TagDataSnapshot = {
      tag: normalizedTag,
      parent,
      itemsById,
      tombstones,
      updated,
    }
    return snapshot
  })()

  tagDataInFlightByType[type][variant].set(normalizedTag, promise)
  try {
    const snapshot = await promise
    cache.set(normalizedTag, { snapshot, timestamp: Date.now() })
    return snapshot
  } finally {
    tagDataInFlightByType[type][variant].delete(normalizedTag)
  }
}

const getResolvedSnapshot = async (
  type: DataType,
  tag: string,
  options: ResolveOptions = {},
): Promise<ResolvedDataSnapshot> => {
  const normalizedTag = sanitizeTag(tag) || tag
  if (!normalizedTag) {
    throw new Error("Invalid tag provided")
  }

  const variant = getResolveVariant(options)
  const cache = resolvedCacheByType[type][variant]
  const inFlight = resolvedInFlightByType[type][variant]

  if (options.force) {
    cache.delete(normalizedTag)
    inFlight.delete(normalizedTag)
  } else {
    const cached = cache.get(normalizedTag)
    if (isCacheEntryValid(cached)) {
      return cached!.snapshot
    }
    const pending = inFlight.get(normalizedTag)
    if (pending) {
      return pending
    }
  }

  const promise = (async () => {
    const tagData = await getTagDataSnapshot(type, normalizedTag, options)
    let merged = tagData.parent
      ? cloneIdMap((await getResolvedSnapshot(type, tagData.parent, options)).itemsById)
      : {}

    merged = mergeItemLayer(merged, tagData.itemsById, tagData.tombstones, type === "events")

    return {
      tag: normalizedTag,
      itemsById: merged,
      updated: tagData.updated,
    }
  })()

  resolvedInFlightByType[type][variant].set(normalizedTag, promise)
  try {
    const snapshot = await promise
    cache.set(normalizedTag, { snapshot, timestamp: Date.now() })
    return snapshot
  } finally {
    resolvedInFlightByType[type][variant].delete(normalizedTag)
  }
}

const getResolvedTipsForExplicitLineage = async (
  tag: string,
  options: ResolveOptions = {},
): Promise<ResolvedDataSnapshot> => {
  const ancestry = await buildAncestry(tag)
  let merged: Record<string, any> = {}
  let updated: string | null = null
  for (const sourceTag of ancestry) {
    const snapshot = await getTagDataSnapshot("tips", sourceTag, { ...options, types: ["tips"] })
    merged = mergeItemLayer(merged, snapshot.itemsById, snapshot.tombstones)
    if (sourceTag === tag) updated = snapshot.updated
  }
  return { tag, itemsById: merged, updated }
}

export const fetchEventsForDate = async (
  tag: string,
  date = getAppTodayKey(),
  options: FetchOptions = {},
): Promise<DateComposition> => {
  const normalizedTag = sanitizeTag(tag)
  if (!normalizedTag || normalizedTag !== tag) throw new Error(`Invalid tag ${JSON.stringify(tag)}`)
  const currentTag = options.currentTag || getActiveTag()
  const includeStored = options.includeAncestorLocalOverrides === true && isAdminModeEnabledForTag(currentTag)
  const loaded = await loadDateScopedConfiguration(normalizedTag, {
    includeStoredOperations: includeStored,
    includeAncestorStoredOperations: true,
    readStoredOperations: (sourceTag) => includeStored && hasAdminAccessForTag(sourceTag)
      ? readStoredEventOperations(sourceTag)
      : null,
  })
  return loaded.composeForDate(date)
}

const applyOverrideSnapshotToMap = (
  current: Record<string, any>,
  snapshot?: StoredOverrideSnapshot | null,
): Record<string, any> => {
  if (!snapshot) return current
  let working = current

  if (snapshot.legacyItems && snapshot.legacyItems.length > 0) {
    working = cloneIdMapFromArray(snapshot.legacyItems)
  }

  if (snapshot.overridesById) {
    for (const id of Object.keys(snapshot.overridesById)) {
      working[id] = deepMerge(working[id], snapshot.overridesById[id])
    }
  }

  if (snapshot.deletedIds) {
    for (const id of snapshot.deletedIds) {
      delete working[id]
    }
  }

  return working
}

const composeFromLayers = (layers: TagLayer[]) => {
  let eventsById: Record<string, any> = {}
  let tipsById: Record<string, any> = {}

  for (const layer of layers) {
    const layerEvents = layer.events || []
    const layerMap = arrayToIdMap(layerEvents)
    for (const id of Object.keys(layerMap)) {
      const prev = eventsById[id]
      const merged = deepMerge(prev, layerMap[id])
      eventsById[id] = merged
    }
    for (const id of layer.eventsTombstones) delete eventsById[id]

    const layerTips = layer.tips || []
    const tipsMap = arrayToIdMap(layerTips)
    for (const id of Object.keys(tipsMap)) {
      const prev = tipsById[id]
      const merged = deepMerge(prev, tipsMap[id])
      tipsById[id] = merged
    }
    for (const id of layer.tipsTombstones) delete tipsById[id]
  }

  return { events: idMapToArray(eventsById), tips: idMapToArray(tipsById) }
}

const fetchBundleForTag = async (tag: string, force = false, options?: FetchOptions): Promise<TagBundle> => {
  const normalizedTag = sanitizeTag(tag) || tag
  if (!normalizedTag) {
    throw new Error("Invalid tag provided")
  }

  const requestedTypes = normalizeTypes(options?.dataTypes)
  const includeEvents = requestedTypes.includes("events")
  const includeTips = requestedTypes.includes("tips")
  const cacheable = includeEvents && includeTips
  const resolveOptions: ResolveOptions = {
    includeLocalOverrides: options?.includeAncestorLocalOverrides === true,
    force,
    currentTag: options?.currentTag || getActiveTag(),
    types: requestedTypes,
  }
  const variant = getResolveVariant(resolveOptions)
  const bundleCache = cacheByTag[variant]
  const bundleInFlight = inFlightByTag[variant]
  const bundleKey = includeEvents ? `${normalizedTag}|${getAppTodayKey()}` : normalizedTag

  const now = Date.now()
  if (!force) {
    const cached = bundleCache.get(bundleKey)
    if (cached && now - cached.timestamp < CACHE_TTL) {
        return {
          ...cached.data,
          events: includeEvents ? cached.data.events : [],
          tips: includeTips ? cached.data.tips : [],
        }
    }
    if (cacheable) {
      const inFlight = bundleInFlight.get(bundleKey)
      if (inFlight) {
        return inFlight
      }
    }
  } else {
    for (const cacheVariant of ["remote", "local"] as const) {
      for (const key of Array.from(inFlightByTag[cacheVariant].keys())) {
        if (key === normalizedTag || key.startsWith(`${normalizedTag}|`)) inFlightByTag[cacheVariant].delete(key)
      }
      for (const key of Array.from(cacheByTag[cacheVariant].keys())) {
        if (key === normalizedTag || key.startsWith(`${normalizedTag}|`)) cacheByTag[cacheVariant].delete(key)
      }
    }
  }

  const promise = (async () => {
    const eventComposition = includeEvents
      ? await fetchEventsForDate(normalizedTag, getAppTodayKey(), {
          includeAncestorLocalOverrides: options?.includeAncestorLocalOverrides,
          currentTag: options?.currentTag,
        })
      : null
    const tipsSnapshot = includeTips
      ? await getResolvedTipsForExplicitLineage(normalizedTag, resolveOptions)
      : { itemsById: {}, updated: null, tag: normalizedTag }
    const ancestry = includeTips || !eventComposition ? await buildAncestry(normalizedTag) : []
    let mergedConfig: Record<string, unknown> | null = eventComposition?.tagConfig ?? null
    if (!mergedConfig) {
      for (const ancestorTag of ancestry) {
        const ancestorLayer = await getLayer(ancestorTag, false, [])
        if (ancestorLayer?.config && typeof ancestorLayer.config === "object") {
          mergedConfig = deepMerge(mergedConfig ?? {}, ancestorLayer.config) as Record<string, unknown>
        }
      }
    }
    const tagConfig = mergedConfig
    const data: TagBundle = {
      tag: normalizedTag,
      tagConfig,
      events: includeEvents ? eventComposition!.events : [],
      tips: includeTips ? idMapToArray(tipsSnapshot.itemsById) : [],
      updated: {
        root: null,
        tagConfig: typeof tagConfig?.updated === "string" ? tagConfig.updated : null,
        events: null,
        tips: includeTips ? tipsSnapshot.updated : null,
      },
    }
    return data
  })()

  if (cacheable) {
    bundleInFlight.set(bundleKey, promise)
  }
  const data = await promise
  if (cacheable) {
    bundleCache.set(bundleKey, { data, timestamp: Date.now() })
    bundleInFlight.delete(bundleKey)
  }

  return data
}

const emptyBundle = (): TagBundle => ({
  tag: getActiveTag(),
  tagConfig: null,
  events: [],
  tips: [],
  updated: {
    root: null,
    tagConfig: null,
    events: null,
    tips: null,
  },
})

export const fetchConfig = async (force = false, options?: FetchOptions): Promise<TagBundle> => {
  try {
    const rootConfig = await fetchRootConfig(force)
    const resolvedTag = resolveTag(rootConfig)
    setActiveTag(resolvedTag)

    const data = await fetchBundleForTag(resolvedTag, force, {
      ...options,
      currentTag: resolvedTag,
    })
    if (data.updated.root === null && typeof rootConfig.updated === "string") {
      data.updated.root = rootConfig.updated
    }
    return data
  } catch (error) {
    console.error("Error fetching configuration bundle:", error)
    return emptyBundle()
  }
}

export const primeTagStorageSuffixes = async (tag?: string): Promise<void> => {
  const resolvedTag = sanitizeTag(tag) || tag || getActiveTag()
  if (!resolvedTag) return
  try {
    await getLayer(resolvedTag, false, [])
  } catch (error) {
    console.warn(`Error priming storage suffixes for tag "${resolvedTag}":`, error)
  }
}

export const fetchComposedForTag = async (
  tag: string,
  force = false,
  options?: FetchOptions,
): Promise<TagBundle> => {
  try {
    const effectiveOptions: FetchOptions = {
      ...options,
      currentTag: options?.currentTag || getActiveTag(),
    }
    return await fetchBundleForTag(tag, force, effectiveOptions)
  } catch (error) {
    console.error(`Error fetching composed bundle for tag "${tag}":`, error)
    return emptyBundle()
  }
}

export const clearConfigCache = () => {
  cacheByTag.remote.clear()
  cacheByTag.local.clear()
  inFlightByTag.remote.clear()
  inFlightByTag.local.clear()
  cachedRootConfig = null
  cachedRootTimestamp = 0
  rootPromise = null
  layerCache.clear()
  layerInFlight.clear()
  const types: DataType[] = ["events", "tips"]
  const variants: CacheVariant[] = ["remote", "local"]
  for (const type of types) {
    for (const variant of variants) {
      tagDataCacheByType[type][variant].clear()
      tagDataInFlightByType[type][variant].clear()
      resolvedCacheByType[type][variant].clear()
      resolvedInFlightByType[type][variant].clear()
    }
  }
}

const invalidateCachesForType = (type: DataType) => {
  cacheByTag.remote.clear()
  cacheByTag.local.clear()
  inFlightByTag.remote.clear()
  inFlightByTag.local.clear()
  const variants: CacheVariant[] = ["remote", "local"]
  for (const variant of variants) {
    tagDataCacheByType[type][variant].clear()
    tagDataInFlightByType[type][variant].clear()
    resolvedCacheByType[type][variant].clear()
    resolvedInFlightByType[type][variant].clear()
  }
}

export const invalidateEventCacheForTag = (_tag: string) => invalidateCachesForType("events")

export const invalidateTipCacheForTag = (_tag: string) => invalidateCachesForType("tips")

if (typeof window !== "undefined") {
  setTimeout(() => {
    const pathname = window.location.pathname || ""
    const isTipPath = pathname.startsWith("/t/")
    const preloadOptions = isTipPath ? { dataTypes: ["tips"] as DataType[] } : undefined
    fetchConfig(false, preloadOptions).catch((error) => {
      console.error("Error during initial config preload:", error)
    })
  }, 100)
}

// Export leaf-owned/conditional event operations and legacy tip deltas.
export const buildChildDeltaFiles = async (
  _effectiveEvents: any[],
  effectiveTips: any[],
  tag?: string,
) => {
  const rootConfig = await fetchRootConfig(false)
  const resolvedTag = tag || resolveTag(rootConfig)
  const ancestry = await buildAncestry(resolvedTag)
  const parentTags = ancestry.slice(0, -1)

  const parentLayers: TagLayer[] = []
  for (const t of parentTags) parentLayers.push(await getLayer(t, false, ["tips"]))
  const parentComposed = composeFromLayers(parentLayers)
  // Load leaf layer to capture tag-specific config including parent
  const leafLayer = await getLayer(resolvedTag, false, [])
  const eventLoader = await loadDateScopedConfiguration(resolvedTag, {
    includeStoredOperations: true,
    includeAncestorStoredOperations: false,
  })
  const leafOperations = eventLoader.layers[eventLoader.layers.length - 1].eventOperations as NormalizedEventOperations

  const parentTipsById = arrayToIdMap(parentComposed.tips || [])

  const childTipsById = arrayToIdMap(effectiveTips || [])

  const tips: any[] = []
  const tipsTombstones: Set<string> = new Set()
  for (const id of Object.keys(parentTipsById)) {
    if (!childTipsById[id]) tipsTombstones.add(id)
  }
  for (const id of Object.keys(childTipsById)) {
    const base = parentTipsById[id]
    const edited = childTipsById[id]
    const delta = computeDelta(base, edited)
    if (delta && typeof delta === "object") tips.push({ id, ...(delta as any) })
  }

  const nowIso = formatInAppTimezone(new Date(), "yyyy-MM-dd'T'HH:mm:ssXXX")
  return {
    config: (() => {
      const cfg: any = { updated: nowIso }
      if (leafLayer && leafLayer.config && typeof leafLayer.config === "object") {
        const { updated, ...rest } = leafLayer.config as any
        Object.assign(cfg, rest)
      }
      return cfg
    })(),
    events: {
      schemaVersion: 2,
      updated: nowIso,
      operations: [
        ...Object.values(leafOperations.ownedEventsById).map((event) => ({ kind: "owned", event })),
        ...Object.entries(leafOperations.inheritedOverridesById).map(([id, operation]) => ({
          kind: "override",
          id,
          set: operation.setByPointer,
          ...(operation.removePointers.length ? { remove: operation.removePointers } : {}),
        })),
        ...leafOperations.inheritedDeletedIds.map((id) => ({ kind: "delete", id })),
      ],
    },
    tips: {
      updated: nowIso,
      tips: [...tips, ...Array.from(tipsTombstones).map((id) => ({ id, deleted: true }))],
    },
  }
}

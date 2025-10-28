"use client"

import { getActiveTag, getTagOverride, sanitizeTag, setActiveTag } from "./config-tag"
import { arrayToIdMap, deepMerge, idMapToArray, computeDelta } from "./config-merge"

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

interface TagBundle {
  tag: string
  tagConfig: Record<string, unknown> | null
  events: any[]
  archivedEvents: any[]
  tips: any[]
  updated: {
    root: string | null
    tagConfig: string | null
    events: string | null
    eventsArchive: string | null
    tips: string | null
  }
}

type TagLayer = {
  tag: string
  config: any | null
  events: any[]
  eventsArchived: any[]
  eventsTombstones: Set<string>
  tips: any[]
  tipsTombstones: Set<string>
}

interface CacheEntry {
  data: TagBundle
  timestamp: number
}

const CONFIG_URL = process.env.CONFIG_URL || ""
const CACHE_TTL = 5 * 60 * 1000

const cacheByTag = new Map<string, CacheEntry>()
const inFlightByTag = new Map<string, Promise<TagBundle>>()

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

const normalizeEvents = (events: any[], archived: boolean): any[] => {
  if (!Array.isArray(events)) return []
  return events.map((event) => {
    if (archived) {
      return {
        ...event,
        archived: true,
      }
    }
    return {
      archived: false,
      ...event,
      archived: event?.archived ?? false,
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

const fetchLayer = async (tag: string): Promise<TagLayer> => {
  const [configPayload, eventsPayload, archivedPayload, tipsPayload] = await Promise.all([
    fetchJson(`${tag}/conf.json`),
    fetchJson(`${tag}/events.json`),
    fetchJson(`${tag}/events_archive.json`),
    fetchJson(`${tag}/tips.json`),
  ])

  const activeObj = extractArray(eventsPayload, "events")
  const archivedObj = extractArray(archivedPayload, "events")
  const tipsObj = extractArray(tipsPayload, "tips")

  const events = normalizeEvents(activeObj.items || [], false)
  const eventsArchived = normalizeEvents(archivedObj.items || [], true)
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
    eventsArchived,
    eventsTombstones,
    tips,
    tipsTombstones,
  }
}

const getParentTag = (layer: TagLayer | null): string | null => {
  if (!layer || !layer.config) return null
  const parentVal = layer.config.parent
  if (typeof parentVal !== "string") return null
  const p = sanitizeTag(parentVal)
  return p
}

const buildAncestry = async (leafTag: string): Promise<string[]> => {
  const visited = new Set<string>()
  const chain: string[] = []
  let current: string | null = leafTag
  let depth = 0
  while (current && depth < 16) {
    if (visited.has(current)) break
    visited.add(current)
    const layer = await fetchLayer(current)
    chain.push(current)
    const parent = getParentTag(layer)
    if (parent && !visited.has(parent)) current = parent
    else current = null
    depth++
  }
  return chain.reverse()
}

const composeFromLayers = (layers: TagLayer[]) => {
  let eventsById: Record<string, any> = {}
  let tipsById: Record<string, any> = {}

  for (const layer of layers) {
    const layerAllEvents = [...(layer.events || []), ...(layer.eventsArchived || [])]
    const layerMap = arrayToIdMap(layerAllEvents)
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

const emptyBundle = (): TagBundle => ({
  tag: getActiveTag(),
  tagConfig: null,
  events: [],
  archivedEvents: [],
  tips: [],
  updated: {
    root: null,
    tagConfig: null,
    events: null,
    eventsArchive: null,
    tips: null,
  },
})

export const fetchConfig = async (force = false): Promise<TagBundle> => {
  try {
    const rootConfig = await fetchRootConfig(force)
    const resolvedTag = resolveTag(rootConfig)
    setActiveTag(resolvedTag)

    const now = Date.now()
    if (!force) {
      const cached = cacheByTag.get(resolvedTag)
      if (cached && now - cached.timestamp < CACHE_TTL) {
        return cached.data
      }
      const inFlight = inFlightByTag.get(resolvedTag)
      if (inFlight) {
        return inFlight
      }
    } else {
      inFlightByTag.delete(resolvedTag)
      cacheByTag.delete(resolvedTag)
    }

    const promise = (async () => {
      const ancestry = await buildAncestry(resolvedTag)
      const layers: TagLayer[] = []
      for (const t of ancestry) {
        layers.push(await fetchLayer(t))
      }
      const composed = composeFromLayers(layers)
      const tagConfig = layers[layers.length - 1]?.config || null
      const data: TagBundle = {
        tag: resolvedTag,
        tagConfig,
        events: composed.events,
        archivedEvents: composed.events.filter((e) => e?.archived === true),
        tips: composed.tips,
        updated: {
          root: typeof rootConfig.updated === "string" ? rootConfig.updated : null,
          tagConfig: typeof tagConfig?.updated === "string" ? tagConfig.updated : null,
          events: null,
          eventsArchive: null,
          tips: null,
        },
      }
      return data
    })()

    inFlightByTag.set(resolvedTag, promise)
    const data = await promise
    cacheByTag.set(resolvedTag, { data, timestamp: Date.now() })
    inFlightByTag.delete(resolvedTag)

    return data
  } catch (error) {
    console.error("Error fetching configuration bundle:", error)
    return emptyBundle()
  }
}

export const clearConfigCache = () => {
  cacheByTag.clear()
  inFlightByTag.clear()
  cachedRootConfig = null
  cachedRootTimestamp = 0
  rootPromise = null
}

if (typeof window !== "undefined") {
  setTimeout(() => {
    fetchConfig().catch((error) => {
      console.error("Error during initial config preload:", error)
    })
  }, 100)
}

// Build child-only deltas and tombstones vs composed parent chain
export const buildChildDeltaFiles = async (
  effectiveEvents: any[],
  effectiveTips: any[],
  tag?: string,
) => {
  const rootConfig = await fetchRootConfig(false)
  const resolvedTag = tag || resolveTag(rootConfig)
  const ancestry = await buildAncestry(resolvedTag)
  const parentTags = ancestry.slice(0, -1)

  const parentLayers: TagLayer[] = []
  for (const t of parentTags) parentLayers.push(await fetchLayer(t))
  const parentComposed = composeFromLayers(parentLayers)
  // Load leaf layer to capture tag-specific config including parent
  const leafLayer = await fetchLayer(resolvedTag)

  const parentEventsById = arrayToIdMap(parentComposed.events || [])
  const parentTipsById = arrayToIdMap(parentComposed.tips || [])

  const childEventsById = arrayToIdMap(effectiveEvents || [])
  const childTipsById = arrayToIdMap(effectiveTips || [])

  const eventsActive: any[] = []
  const eventsArchived: any[] = []
  const eventsTombstones: Set<string> = new Set()

  for (const id of Object.keys(parentEventsById)) {
    if (!childEventsById[id]) eventsTombstones.add(id)
  }
  for (const id of Object.keys(childEventsById)) {
    const base = parentEventsById[id]
    const edited = childEventsById[id]
    const delta = computeDelta(base, edited)
    if (delta && typeof delta === "object") {
      const out = { id, ...(delta as any) }
      const effArchived = (edited && edited.archived) === true
      if (effArchived) eventsArchived.push(out)
      else eventsActive.push(out)
    }
  }

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

  const nowIso = new Date().toISOString()
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
      updated: nowIso,
      events: [
        ...eventsActive,
        ...Array.from(eventsTombstones).map((id) => ({ id, deleted: true })),
      ],
    },
    eventsArchive: { updated: nowIso, events: eventsArchived },
    tips: {
      updated: nowIso,
      tips: [...tips, ...Array.from(tipsTombstones).map((id) => ({ id, deleted: true }))],
    },
  }
}

"use client"

import { getActiveTag, getTagOverride, sanitizeTag, setActiveTag } from "./config-tag"

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

const fetchTagBundle = async (tag: string, root: RootConfig): Promise<TagBundle> => {
  const [configPayload, eventsPayload, archivedPayload, tipsPayload] = await Promise.all([
    fetchJson(`${tag}/config.json`).then((data) => data ?? fetchJson(`${tag}/conf.json`)),
    fetchJson(`${tag}/events.json`),
    fetchJson(`${tag}/events_archive.json`),
    fetchJson(`${tag}/tips.json`),
  ])

  const tagConfigUpdated = typeof configPayload?.updated === "string" ? configPayload.updated : null
  const tagConfigData =
    configPayload && typeof configPayload === "object" ? { ...configPayload } : null

  if (tagConfigData && tagConfigData.updated) {
    delete tagConfigData.updated
  }

  const activeEvents = extractArray(eventsPayload, "events")
  const archivedEvents = extractArray(archivedPayload, "events")
  const tips = extractArray(tipsPayload, "tips")

  const combinedEvents = [
    ...normalizeEvents(activeEvents.items, false),
    ...normalizeEvents(archivedEvents.items, true),
  ]

  return {
    tag,
    tagConfig: tagConfigData,
    events: combinedEvents,
    archivedEvents: normalizeEvents(archivedEvents.items, true),
    tips: Array.isArray(tips.items) ? tips.items : [],
    updated: {
      root: typeof root.updated === "string" ? root.updated : null,
      tagConfig: tagConfigUpdated,
      events: activeEvents.updated,
      eventsArchive: archivedEvents.updated,
      tips: tips.updated,
    },
  }
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

    const promise = fetchTagBundle(resolvedTag, rootConfig)
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

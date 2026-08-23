"use client"

import { sanitizeTag } from "./config-tag"
import {
  composeEventsForDate,
  type ConfigurationLayer,
  type DateComposition,
} from "./serenity-engine/composition"
import {
  normalizeEventOperations,
  validateNormalizedEventOperations,
  type EventOperation,
  type NormalizedEventOperations,
} from "./serenity-engine/event-operations"
import {
  readStoredEventOperations,
  registerTagStorageSuffixes,
  type StoredEventOperations,
} from "./scoped-storage"

const CONFIG_URL = process.env.CONFIG_URL || ""
const SAFE_TAG = /^[a-z0-9_-]+$/
const MAX_PARENTS = 32

export type DateScopedLoadOptions = {
  includeStoredOperations?: boolean
  includeAncestorStoredOperations?: boolean
  fetchImpl?: typeof fetch
  readStoredOperations?: (tag: string) => StoredEventOperations | null
}

export type DateScopedConfiguration = {
  localTag: string
  /** Nearest parent first, matching the leaf configuration. */
  parents: string[]
  /** Root-to-leaf engine layers. */
  layers: ConfigurationLayer[]
  composeForDate: (date: string) => DateComposition
  composeLowerStackForDate: (date: string) => DateComposition
}

const emptyOperations = (): NormalizedEventOperations => ({
  ownedEventsById: {},
  inheritedOverridesById: {},
  inheritedDeletedIds: [],
})

const withCacheBuster = (url: string): string => `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`

export const buildDateScopedConfigUrl = (segment: string): string => {
  const normalizedSegment = segment.replace(/^\/+/, "")
  const base = CONFIG_URL ? CONFIG_URL.replace(/\/$/, "") : "/conf"
  return withCacheBuster(`${base}/${normalizedSegment}`)
}

const fetchJson = async (
  segment: string,
  kind: "config" | "events",
  fetchImpl: typeof fetch,
): Promise<unknown | null> => {
  let response: Response
  try {
    response = await fetchImpl(buildDateScopedConfigUrl(segment), {
      cache: "no-store",
      headers: {
        "Cache-Control": "no-cache, no-store, must-revalidate",
        Pragma: "no-cache",
        Expires: "0",
      },
    })
  } catch (error) {
    throw new Error(`Failed to fetch ${segment}: ${error instanceof Error ? error.message : String(error)}`)
  }
  if (kind === "events" && response.status === 404) return null
  if (!response.ok) throw new Error(`Failed to fetch ${segment}: HTTP ${response.status}`)
  const contentType = response.headers.get("content-type")
  if (contentType && !contentType.toLowerCase().includes("application/json")) {
    throw new Error(`Malformed ${segment}: expected application/json`)
  }
  try {
    return await response.json()
  } catch (error) {
    throw new Error(`Malformed JSON in ${segment}: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const requireObject = (value: unknown, context: string): Record<string, any> => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) throw new Error(`${context} must be a JSON object`)
  return value as Record<string, any>
}

export const validateExplicitParents = (config: unknown, tag: string): string[] => {
  const object = requireObject(config, `Configuration for ${JSON.stringify(tag)}`)
  if (Object.prototype.hasOwnProperty.call(object, "parent")) {
    throw new Error(`Configuration for ${JSON.stringify(tag)} uses forbidden legacy parent`)
  }
  if (!Object.prototype.hasOwnProperty.call(object, "parents") || !Array.isArray(object.parents)) {
    throw new Error(`Configuration for ${JSON.stringify(tag)} must contain an explicit parents array`)
  }
  if (object.parents.length > MAX_PARENTS) throw new Error(`Configuration parents are limited to ${MAX_PARENTS}`)
  const parents: string[] = []
  const seen = new Set<string>()
  for (const value of object.parents) {
    if (typeof value !== "string" || !SAFE_TAG.test(value) || sanitizeTag(value) !== value) {
      throw new Error(`Unsafe parent tag ${JSON.stringify(value)} in configuration for ${JSON.stringify(tag)}`)
    }
    if (value === tag) throw new Error(`Tag ${JSON.stringify(tag)} cannot be its own parent`)
    if (seen.has(value)) throw new Error(`Duplicate parent tag ${JSON.stringify(value)}`)
    seen.add(value)
    parents.push(value)
  }
  return parents
}

const storageSuffixes = (config: Record<string, any>): { events: string; tips: string } => ({
  events: typeof config.storage?.eventsSuffix === "string" ? config.storage.eventsSuffix.trim() : "",
  tips: typeof config.storage?.tipsSuffix === "string" ? config.storage.tipsSuffix.trim() : "",
})

const storedAsDocument = (stored: StoredEventOperations): { operations: EventOperation[]; suppressed: Set<string> } => {
  const operations: EventOperation[] = []
  for (const [id, event] of Object.entries(stored.ownedEventsById ?? {})) {
    operations.push({ kind: "owned", event: { ...event, id } })
  }
  for (const [id, override] of Object.entries(stored.inheritedOverridesById ?? {})) {
    operations.push({ kind: "override", id, set: override.set, remove: override.remove })
  }
  for (const id of stored.inheritedDeletedIds ?? []) operations.push({ kind: "delete", id })
  return { operations, suppressed: new Set(stored.suppressedPublishedOwnedIds ?? []) }
}

export const mergeStoredEventOperations = (
  publishedValue: NormalizedEventOperations,
  stored: StoredEventOperations | null,
): NormalizedEventOperations => {
  const published = validateNormalizedEventOperations(publishedValue)
  if (!stored) return published
  const { operations: storedOperations, suppressed } = storedAsDocument(stored)
  const normalizedStored = normalizeEventOperations({ schemaVersion: 2, operations: storedOperations })
  const ownedEventsById = { ...published.ownedEventsById }
  const inheritedOverridesById = { ...published.inheritedOverridesById }
  const deleted = new Set(published.inheritedDeletedIds)

  for (const id of suppressed) {
    if (typeof id !== "string") throw new Error("suppressedPublishedOwnedIds must contain only strings")
    delete ownedEventsById[id]
  }
  for (const id of stored.suppressedPublishedInheritedIds ?? []) {
    if (typeof id !== "string") throw new Error("suppressedPublishedInheritedIds must contain only strings")
    delete inheritedOverridesById[id]
    deleted.delete(id)
  }
  for (const [id, event] of Object.entries(normalizedStored.ownedEventsById)) {
    ownedEventsById[id] = event
    delete inheritedOverridesById[id]
    deleted.delete(id)
  }
  for (const [id, override] of Object.entries(normalizedStored.inheritedOverridesById)) {
    if (ownedEventsById[id]) throw new Error(`Stored inherited override conflicts with owned event ${JSON.stringify(id)}`)
    inheritedOverridesById[id] = override
    deleted.delete(id)
  }
  for (const id of normalizedStored.inheritedDeletedIds) {
    if (ownedEventsById[id]) throw new Error(`Stored inherited deletion conflicts with owned event ${JSON.stringify(id)}`)
    delete inheritedOverridesById[id]
    deleted.add(id)
  }
  return validateNormalizedEventOperations({
    ownedEventsById,
    inheritedOverridesById,
    inheritedDeletedIds: [...deleted],
  })
}

const loadLayer = async (
  tag: string,
  config: Record<string, any>,
  options: DateScopedLoadOptions,
  isLeaf: boolean,
): Promise<ConfigurationLayer> => {
  registerTagStorageSuffixes(tag, storageSuffixes(config))
  const payload = await fetchJson(`${tag}/events.json`, "events", options.fetchImpl ?? fetch)
  const published = payload === null ? emptyOperations() : normalizeEventOperations(payload)
  const useStored = options.includeStoredOperations === true
    && (isLeaf || options.includeAncestorStoredOperations !== false)
  const stored = useStored
    ? (options.readStoredOperations ?? readStoredEventOperations)(tag)
    : null
  return { tag, config, eventOperations: mergeStoredEventOperations(published, stored) }
}

export const loadDateScopedConfiguration = async (
  leafTag: string,
  options: DateScopedLoadOptions = {},
): Promise<DateScopedConfiguration> => {
  const tag = sanitizeTag(leafTag)
  if (!tag || tag !== leafTag || !SAFE_TAG.test(tag)) throw new Error(`Unsafe leaf tag ${JSON.stringify(leafTag)}`)
  const fetchImpl = options.fetchImpl ?? fetch
  const leafConfig = requireObject(await fetchJson(`${tag}/conf.json`, "config", fetchImpl), `Configuration for ${JSON.stringify(tag)}`)
  const parents = validateExplicitParents(leafConfig, tag)

  const configsByTag = new Map<string, Record<string, any>>([[tag, leafConfig]])
  await Promise.all(parents.map(async (parentTag) => {
    const config = requireObject(
      await fetchJson(`${parentTag}/conf.json`, "config", fetchImpl),
      `Configuration for ${JSON.stringify(parentTag)}`,
    )
    validateExplicitParents(config, parentTag)
    configsByTag.set(parentTag, config)
  }))

  const rootToLeaf = [...parents].reverse().concat(tag)
  const layers = await Promise.all(rootToLeaf.map((layerTag) => loadLayer(
    layerTag,
    configsByTag.get(layerTag)!,
    { ...options, fetchImpl },
    layerTag === tag,
  )))
  const composeForDate = (date: string): DateComposition => composeEventsForDate({ layers, localTag: tag, date })
  const composeLowerStackForDate = (date: string): DateComposition => {
    const lowerLayers = layers.map((layer, index) => index === layers.length - 1
      ? { ...layer, eventOperations: emptyOperations() }
      : layer)
    return composeEventsForDate({ layers: lowerLayers, localTag: tag, date })
  }
  return { localTag: tag, parents, layers, composeForDate, composeLowerStackForDate }
}

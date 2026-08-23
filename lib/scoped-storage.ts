"use client"

import { createJSONStorage, type StateStorage } from "zustand/middleware"
import { getActiveTag, sanitizeTag } from "./config-tag"

const STORAGE_PREFIX = "lw-tools"
const DEFAULT_DATA_KEYS = ["events", "tips"] as const

type StorageSuffixes = {
  events: string
  tips: string
}

const storageSuffixesByTag = new Map<string, StorageSuffixes>()

const normalizeStorageSuffix = (value: unknown): string => {
  if (typeof value !== "string") return ""
  return value.trim()
}

const applyStorageSuffix = (key: string, suffix: string): string => {
  if (!suffix) return key
  return `${key}:${suffix}`
}

const getStorageSuffixForTag = (tag: string, key: string): string => {
  if (key !== "events" && key !== "tips") return ""
  const normalizedTag = sanitizeTag(tag) || tag
  if (!normalizedTag) return ""
  const suffixes = storageSuffixesByTag.get(normalizedTag)
  if (!suffixes) return ""
  return key === "events" ? suffixes.events : suffixes.tips
}

export const registerTagStorageSuffixes = (
  tag: string,
  suffixes?: Partial<StorageSuffixes> | null,
) => {
  const normalizedTag = sanitizeTag(tag) || tag
  if (!normalizedTag) return
  const current = storageSuffixesByTag.get(normalizedTag) || { events: "", tips: "" }
  const next = {
    events: normalizeStorageSuffix(suffixes?.events ?? current.events),
    tips: normalizeStorageSuffix(suffixes?.tips ?? current.tips),
  }
  storageSuffixesByTag.set(normalizedTag, next)
}

const buildScopedKey = (key: string): string => {
  const tag = getActiveTag()
  const suffix = getStorageSuffixForTag(tag, key)
  const keyWithSuffix = applyStorageSuffix(key, suffix)
  return `${STORAGE_PREFIX}:${tag}:${keyWithSuffix}`
}

const getClientStorage = (): Storage | null => {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const adminModeModeActive = (storage: Storage): boolean => {
  try {
    return storage.getItem(buildScopedKey("adminMode")) === "true"
  } catch {
    return false
  }
}

export type StoredEventOperations = {
  ownedEventsById: Record<string, any>
  inheritedOverridesById: Record<string, { set: Record<string, unknown>; remove?: string[] }>
  inheritedDeletedIds: string[]
  suppressedPublishedOwnedIds: string[]
  suppressedPublishedInheritedIds?: string[]
}

type PersistedPayload = { state?: { eventOperations?: Partial<StoredEventOperations>; overridesById?: Record<string, any>; deletedEventIds?: any; deletedTipIds?: any; legacyEvents?: any; legacyTips?: any } }

const parsePersistedPayload = (raw: string | null): PersistedPayload | null => {
  if (!raw) return null
  try {
    return JSON.parse(raw) as PersistedPayload
  } catch {
    return null
  }
}

const isOverrideSnapshotEmpty = (payload: PersistedPayload | null, key: string): boolean => {
  if (!payload || !payload.state) return true
  const { eventOperations, overridesById, deletedEventIds, deletedTipIds, legacyEvents, legacyTips } = payload.state
  if (key === "events" && eventOperations) {
    return Object.keys(eventOperations.ownedEventsById || {}).length === 0
      && Object.keys(eventOperations.inheritedOverridesById || {}).length === 0
      && (!Array.isArray(eventOperations.inheritedDeletedIds) || eventOperations.inheritedDeletedIds.length === 0)
      && (!Array.isArray(eventOperations.suppressedPublishedOwnedIds) || eventOperations.suppressedPublishedOwnedIds.length === 0)
      && (!Array.isArray(eventOperations.suppressedPublishedInheritedIds) || eventOperations.suppressedPublishedInheritedIds.length === 0)
  }
  const overridesEmpty = !overridesById || Object.keys(overridesById).length === 0
  const deletedEmpty =
    key === "events"
      ? !Array.isArray(deletedEventIds) || deletedEventIds.length === 0
      : !Array.isArray(deletedTipIds) || deletedTipIds.length === 0
  const legacyEmpty =
    key === "events"
      ? !legacyEvents || (Array.isArray(legacyEvents) && legacyEvents.length === 0)
      : !legacyTips || (Array.isArray(legacyTips) && legacyTips.length === 0)

  return overridesEmpty && deletedEmpty && legacyEmpty
}

export const scopedStateStorage: StateStorage = {
  getItem: (key) => {
    const storage = getClientStorage()
    if (!storage) return null
    const scopedKey = buildScopedKey(key)
    try {
      return storage.getItem(scopedKey)
    } catch {
      return null
    }
  },
  setItem: (key, value) => {
    const storage = getClientStorage()
    if (!storage) return
    if (!adminModeModeActive(storage)) return
    const scopedKey = buildScopedKey(key)
    try {
      const serialized = typeof value === "string" ? value : JSON.stringify(value)
      // Prevent overwriting existing overrides with empty payloads during hydration/init
      if (key === "events" || key === "tips") {
        const incoming = parsePersistedPayload(serialized)
        const existing = parsePersistedPayload(storage.getItem(scopedKey))
        const incomingEmpty = isOverrideSnapshotEmpty(incoming, key)
        const existingEmpty = isOverrideSnapshotEmpty(existing, key)
        if (incomingEmpty && !existingEmpty) {
          return
        }
      }
      storage.setItem(scopedKey, serialized)
    } catch {
      // Ignore storage failures
    }
  },
  removeItem: (key) => {
    const storage = getClientStorage()
    if (!storage) return
    if (!adminModeModeActive(storage)) return
    const scopedKey = buildScopedKey(key)
    try {
      storage.removeItem(scopedKey)
    } catch {
      // Ignore storage failures
    }
  },
}

export const scopedLocalStorage = {
  getItem: (key: string): string | null => {
    const storage = getClientStorage()
    if (!storage) return null
    try {
      return storage.getItem(buildScopedKey(key))
    } catch {
      return null
    }
  },
  setItem: (key: string, value: string) => {
    const storage = getClientStorage()
    if (!storage) return
    try {
      storage.setItem(buildScopedKey(key), value)
    } catch {
      // Ignore storage failures
    }
  },
  removeItem: (key: string) => {
    const storage = getClientStorage()
    if (!storage) return
    try {
      storage.removeItem(buildScopedKey(key))
    } catch {
      // Ignore storage failures
    }
  },
}

export const getScopedKey = (key: string): string => buildScopedKey(key)

const readScopedValueForTag = (tag: string, key: string): string | null => {
  const storage = getClientStorage()
  if (!storage) return null
  try {
    return storage.getItem(buildKeyForTag(tag, key))
  } catch {
    return null
  }
}

export const isCurrentTagInAdminMode = (): boolean => scopedLocalStorage.getItem("adminMode") === "true"

export const readScopedFlagForTag = (tag: string, key: string): boolean => {
  const value = readScopedValueForTag(tag, key)
  return value === "true"
}

export const hasAdminAccessForTag = (tag: string): boolean => readScopedFlagForTag(tag, "hasAdminAccess")

export const isAdminModeEnabledForTag = (tag: string): boolean => readScopedFlagForTag(tag, "adminMode")

const buildKeyForTag = (tag: string, key: string): string => {
  const suffix = getStorageSuffixForTag(tag, key)
  const keyWithSuffix = applyStorageSuffix(key, suffix)
  return `${STORAGE_PREFIX}:${tag}:${keyWithSuffix}`
}

// Zustand's persist middleware consumes parsed { state, version } values, while
// scopedStateStorage deliberately implements the browser-like string API.
// Keep the raw adapter available to the storage helpers, and use this JSON
// wrapper anywhere it is passed to persist so reloads actually rehydrate state.
export const scopedPersistStorage = createJSONStorage(() => scopedStateStorage)

const parseTagFromScopedKey = (rawKey: string): { tag: string; key: string } | null => {
  const prefix = `${STORAGE_PREFIX}:`
  if (!rawKey.startsWith(prefix)) return null
  const parts = rawKey.slice(prefix.length).split(":")
  if (parts.length < 2) return null
  const [tag, key] = parts
  return { tag, key }
}

export const listTagsWithStoredData = (dataKeys: readonly string[] = DEFAULT_DATA_KEYS): string[] => {
  const storage = getClientStorage()
  if (!storage) return []

  const keys = new Set<string>()
  for (let index = 0; index < storage.length; index++) {
    const rawKey = storage.key(index)
    if (!rawKey) continue
    const parsed = parseTagFromScopedKey(rawKey)
    if (!parsed) continue
    if (!dataKeys.includes(parsed.key)) continue
    keys.add(parsed.tag)
  }

  return Array.from(keys).sort()
}

export const listAdminEnabledTags = (): string[] => {
  const storage = getClientStorage()
  if (!storage) return []

  const tags = new Set<string>()
  for (let index = 0; index < storage.length; index++) {
    const rawKey = storage.key(index)
    if (!rawKey) continue
    const parsed = parseTagFromScopedKey(rawKey)
    if (!parsed) continue
    if (parsed.key !== "adminMode") continue
    try {
      if (storage.getItem(rawKey) === "true") {
        tags.add(parsed.tag)
      }
    } catch {
      // Ignore read failures
    }
  }

  return Array.from(tags).sort()
}

export const readScopedStateForTag = <T = unknown>(tag: string, key: string): T | null => {
  const storage = getClientStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(buildKeyForTag(tag, key))
    if (!raw) return null
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

export const clearScopedDataForTags = (
  dataKeys: readonly string[],
  targetTags?: readonly string[],
): number => {
  const storage = getClientStorage()
  if (!storage) return 0

  const keysToRemove: string[] = []
  const allowedTags = targetTags && targetTags.length > 0 ? new Set(targetTags) : null
  const allowedDataKeys = new Set(dataKeys)

  for (let index = 0; index < storage.length; index++) {
    const rawKey = storage.key(index)
    if (!rawKey) continue
    const parsed = parseTagFromScopedKey(rawKey)
    if (!parsed) continue
    if (!allowedDataKeys.has(parsed.key)) continue
    if (allowedTags && !allowedTags.has(parsed.tag)) continue
    keysToRemove.push(rawKey)
  }

  let removed = 0
  for (const key of keysToRemove) {
    try {
      storage.removeItem(key)
      removed++
    } catch {
      // Ignore removal failures
    }
  }

  return removed
}

export const TAG_DATA_STORAGE_KEYS = DEFAULT_DATA_KEYS

type StoredOverrideSnapshot<T = any> = {
  overridesById?: Record<string, T>
  deletedIds?: string[]
  legacyItems?: T[]
}

const readPersistedStateForTag = (tag: string, key: string): any | null => {
  const storage = getClientStorage()
  if (!storage) return null
  try {
    const raw = storage.getItem(buildKeyForTag(tag, key))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed && typeof parsed === "object" && "state" in parsed) {
      return (parsed as any).state
    }
    return parsed
  } catch {
    return null
  }
}

const normalizeOverrideSnapshot = <T = any>(
  state: any,
  deletedKey: string,
  legacyKey: string,
): StoredOverrideSnapshot<T> | null => {
  if (!state || typeof state !== "object") return null
  const overridesById = state.overridesById && typeof state.overridesById === "object" ? state.overridesById : undefined
  const deletedSource = state[deletedKey]
  const deletedIds = Array.isArray(deletedSource) ? deletedSource.slice() : undefined
  const legacySource = state[legacyKey]
  const legacyItems = Array.isArray(legacySource) ? legacySource.slice() : undefined

  if (!overridesById && !deletedIds && !legacyItems) {
    return null
  }

  return {
    overridesById,
    deletedIds,
    legacyItems,
  }
}

export const readStoredEventOverrides = (tag: string): StoredOverrideSnapshot | null => {
  const state = readPersistedStateForTag(tag, "events")
  if (!state) return null
  return normalizeOverrideSnapshot(state, "deletedEventIds", "legacyEvents")
}

const emptyStoredEventOperations = (): StoredEventOperations => ({
  ownedEventsById: {},
  inheritedOverridesById: {},
  inheritedDeletedIds: [],
  suppressedPublishedOwnedIds: [],
  suppressedPublishedInheritedIds: [],
})

export const readStoredEventOperations = (tag: string): StoredEventOperations | null => {
  const state = readPersistedStateForTag(tag, "events")
  if (!state || typeof state !== "object" || !state.eventOperations || typeof state.eventOperations !== "object") {
    return null
  }
  const value = state.eventOperations
  return {
    ownedEventsById: value.ownedEventsById && typeof value.ownedEventsById === "object" ? value.ownedEventsById : {},
    inheritedOverridesById:
      value.inheritedOverridesById && typeof value.inheritedOverridesById === "object"
        ? value.inheritedOverridesById
        : {},
    inheritedDeletedIds: Array.isArray(value.inheritedDeletedIds) ? value.inheritedDeletedIds.slice() : [],
    suppressedPublishedOwnedIds: Array.isArray(value.suppressedPublishedOwnedIds)
      ? value.suppressedPublishedOwnedIds.slice()
      : [],
    suppressedPublishedInheritedIds: Array.isArray(value.suppressedPublishedInheritedIds)
      ? value.suppressedPublishedInheritedIds.slice()
      : [],
  }
}

export const writeStoredEventOperations = (tag: string, operations: StoredEventOperations) => {
  writePersistedStateForTag(tag, "events", { eventOperations: operations }, 2)
}

export { emptyStoredEventOperations }

export const readStoredTipOverrides = (tag: string): StoredOverrideSnapshot | null => {
  const state = readPersistedStateForTag(tag, "tips")
  if (!state) return null
  return normalizeOverrideSnapshot(state, "deletedTipIds", "legacyTips")
}

const writePersistedStateForTag = (tag: string, key: string, state: Record<string, any>, version = 1) => {
  const storage = getClientStorage()
  if (!storage) return
  try {
    const payload = JSON.stringify({
      state,
      version,
    })
    storage.setItem(buildKeyForTag(tag, key), payload)
  } catch {
    // Ignore write failures
  }
}

export const writeStoredEventOverrides = (tag: string, snapshot: StoredOverrideSnapshot) => {
  const state = {
    overridesById: snapshot.overridesById || {},
    deletedEventIds: snapshot.deletedIds || [],
    legacyEvents: snapshot.legacyItems || null,
  }
  writePersistedStateForTag(tag, "events", state, 1)
}

export const writeStoredTipOverrides = (tag: string, snapshot: StoredOverrideSnapshot) => {
  const state = {
    overridesById: snapshot.overridesById || {},
    deletedTipIds: snapshot.deletedIds || [],
    legacyTips: snapshot.legacyItems || null,
  }
  writePersistedStateForTag(tag, "tips", state, 1)
}

export type { StoredOverrideSnapshot }

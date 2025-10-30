"use client"

import type { StateStorage } from "zustand/middleware"
import { getActiveTag } from "./config-tag"

const STORAGE_PREFIX = "lw-tools"
const DEFAULT_DATA_KEYS = ["daily-agenda-events", "daily-agenda-tips"] as const

const buildScopedKey = (key: string): string => {
  const tag = getActiveTag()
  return `${STORAGE_PREFIX}:${tag}:${key}`
}

const getClientStorage = (): Storage | null => {
  if (typeof window === "undefined") return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

const isAdminModeActive = (storage: Storage): boolean => {
  try {
    return storage.getItem(buildScopedKey("isAdmin")) === "true"
  } catch {
    return false
  }
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
    if (!isAdminModeActive(storage)) return
    const scopedKey = buildScopedKey(key)
    try {
      const serialized = typeof value === "string" ? value : JSON.stringify(value)
      storage.setItem(scopedKey, serialized)
    } catch {
      // Ignore storage failures
    }
  },
  removeItem: (key) => {
    const storage = getClientStorage()
    if (!storage) return
    if (!isAdminModeActive(storage)) return
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

const buildKeyForTag = (tag: string, key: string): string => `${STORAGE_PREFIX}:${tag}:${key}`

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

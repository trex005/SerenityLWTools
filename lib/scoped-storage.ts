"use client"

import type { StateStorage } from "zustand/middleware"
import { getActiveTag } from "./config-tag"

const STORAGE_PREFIX = "lw-tools"

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

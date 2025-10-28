"use client"

const TAG_QUERY_PARAM = "tag"
const STORED_TAG_KEY = "__config_active_tag"
const DEFAULT_TAG_FALLBACK = "default"

type TagChangeListener = (tag: string) => void

const listeners = new Set<TagChangeListener>()

const sanitizeTag = (value: string | null | undefined): string | null => {
  if (!value) return null
  const sanitized = value.toLowerCase().replace(/[^a-z0-9_-]/g, "")
  return sanitized || null
}

const readQueryTag = (): string | null => {
  if (typeof window === "undefined") return null
  const search = window.location.search || ""
  if (!search) return null
  try {
    const params = new URLSearchParams(search)
    return sanitizeTag(params.get(TAG_QUERY_PARAM))
  } catch {
    return null
  }
}

const readStoredTag = (): string | null => {
  if (typeof window === "undefined") return null
  try {
    const stored = window.localStorage.getItem(STORED_TAG_KEY)
    return sanitizeTag(stored)
  } catch {
    return null
  }
}

const readHostnameTag = (): string | null => {
  if (typeof window === "undefined") return null
  return sanitizeTag(window.location.hostname)
}

let activeTag: string =
  readQueryTag() ||
  readStoredTag() ||
  readHostnameTag() ||
  DEFAULT_TAG_FALLBACK

const notifyListeners = (tag: string) => {
  listeners.forEach((listener) => {
    try {
      listener(tag)
    } catch {
      // Ignore listener errors
    }
  })
}

export const getActiveTag = (): string => {
  if (typeof window !== "undefined") {
    const queryTag = readQueryTag()
    if (queryTag && queryTag !== activeTag) {
      activeTag = queryTag
    }
  }
  return activeTag
}

export const setActiveTag = (tagValue: string) => {
  const sanitized = sanitizeTag(tagValue) || DEFAULT_TAG_FALLBACK
  if (sanitized === activeTag) return
  activeTag = sanitized
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORED_TAG_KEY, sanitized)
    } catch {
      // Ignore storage failures (private mode, quota issues, etc.)
    }
  }
  notifyListeners(activeTag)
}

export const getTagOverride = (): string | null => readQueryTag()

export const onTagChange = (listener: TagChangeListener): (() => void) => {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export const clearStoredTag = () => {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(STORED_TAG_KEY)
  } catch {
    // Ignore storage failures
  }
}

export { sanitizeTag, TAG_QUERY_PARAM as TAG_PARAM_KEY }

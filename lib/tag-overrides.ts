"use client"

import {
  fetchComposedForTag,
  invalidateEventCacheForTag,
  invalidateTipCacheForTag,
  type TagBundle,
} from "@/lib/config-fetcher"
import { getActiveTag } from "@/lib/config-tag"
import { buildIdMap, composeWithOverrides, ensureIdAdded, ensureIdRemoved, upsertOverrideMap } from "@/lib/override-helpers"
import {
  readStoredEventOverrides,
  readStoredTipOverrides,
  writeStoredEventOverrides,
  writeStoredTipOverrides,
} from "@/lib/scoped-storage"

const safeArray = <T = any>(value: unknown): T[] => {
  if (Array.isArray(value)) {
    return value as T[]
  }
  return []
}

const loadBundleForTag = async (tag: string, force = false): Promise<TagBundle> => {
  const contextTag = getActiveTag()
  try {
    return await fetchComposedForTag(tag, force, {
      includeAncestorLocalOverrides: true,
      currentTag: contextTag,
    })
  } catch (error) {
    console.error(`Failed to load bundle for tag "${tag}"`, error)
    return await fetchComposedForTag(tag, force, { currentTag: contextTag })
  }
}

export const loadEventForTag = async (tag: string, eventId: string) => {
  const bundle = await loadBundleForTag(tag, true)
  const baseEvents = safeArray(bundle.events)
  const overrides = readStoredEventOverrides(tag)
  const merged = composeWithOverrides(baseEvents, overrides?.overridesById || {}, overrides?.deletedIds || [])
  return merged.find((evt) => evt && evt.id === eventId) || null
}

export const saveEventForTag = async (tag: string, eventData: any) => {
  const bundle = await loadBundleForTag(tag, true)
  const baseEvents = safeArray(bundle.events)
  const baseMap = buildIdMap(baseEvents)
  const snapshot = readStoredEventOverrides(tag) || {}
  const overrides = snapshot.overridesById || {}
  const updatedOverrides = upsertOverrideMap(baseMap, overrides, [eventData])
  const updatedDeletedIds = ensureIdRemoved(snapshot.deletedIds || [], eventData.id)
  writeStoredEventOverrides(tag, {
    overridesById: updatedOverrides,
    deletedIds: updatedDeletedIds,
    legacyItems: snapshot.legacyItems,
  })
  invalidateEventCacheForTag(tag)
}

export const deleteEventForTag = async (tag: string, eventId: string) => {
  const snapshot = readStoredEventOverrides(tag) || {}
  const overrides = { ...(snapshot.overridesById || {}) }
  delete overrides[eventId]
  const deletedIds = ensureIdAdded(snapshot.deletedIds || [], eventId)
  writeStoredEventOverrides(tag, {
    overridesById: overrides,
    deletedIds,
    legacyItems: snapshot.legacyItems,
  })
  invalidateEventCacheForTag(tag)
}

export const clearEventOverrideForTag = async (tag: string, eventId: string) => {
  const snapshot = readStoredEventOverrides(tag) || {}
  const overrides = { ...(snapshot.overridesById || {}) }
  delete overrides[eventId]
  const deletedIds = ensureIdRemoved(snapshot.deletedIds || [], eventId)
  writeStoredEventOverrides(tag, {
    overridesById: overrides,
    deletedIds,
    legacyItems: snapshot.legacyItems,
  })
  invalidateEventCacheForTag(tag)
}

export const loadTipForTag = async (tag: string, tipId: string) => {
  const bundle = await loadBundleForTag(tag, true)
  const baseTips = safeArray(bundle.tips)
  const overrides = readStoredTipOverrides(tag)
  const merged = composeWithOverrides(baseTips, overrides?.overridesById || {}, overrides?.deletedIds || [])
  return merged.find((tip) => tip && tip.id === tipId) || null
}

export const saveTipForTag = async (tag: string, tipData: any) => {
  const bundle = await loadBundleForTag(tag, true)
  const baseTips = safeArray(bundle.tips)
  const baseMap = buildIdMap(baseTips)
  const snapshot = readStoredTipOverrides(tag) || {}
  const overrides = snapshot.overridesById || {}
  const updatedOverrides = upsertOverrideMap(baseMap, overrides, [tipData])
  const updatedDeletedIds = ensureIdRemoved(snapshot.deletedIds || [], tipData.id)
  writeStoredTipOverrides(tag, {
    overridesById: updatedOverrides,
    deletedIds: updatedDeletedIds,
    legacyItems: snapshot.legacyItems,
  })
  invalidateTipCacheForTag(tag)
}

export const deleteTipForTag = async (tag: string, tipId: string) => {
  const snapshot = readStoredTipOverrides(tag) || {}
  const overrides = { ...(snapshot.overridesById || {}) }
  delete overrides[tipId]
  const deletedIds = ensureIdAdded(snapshot.deletedIds || [], tipId)
  writeStoredTipOverrides(tag, {
    overridesById: overrides,
    deletedIds,
    legacyItems: snapshot.legacyItems,
  })
  invalidateTipCacheForTag(tag)
}

"use client"

import {
  fetchComposedForTag,
  invalidateEventCacheForTag,
  invalidateTipCacheForTag,
  type TagBundle,
} from "@/lib/config-fetcher"
import { getActiveTag } from "@/lib/config-tag"
import { getAppTodayKey } from "@/lib/date-utils"
import { loadDateScopedConfiguration } from "@/lib/date-scoped-config"
import {
  createEmptyStoredEventOperations,
  resetInheritedEventOperation,
  storeEventDeletion,
  storeInheritedEdit,
  storeOwnedEvent,
} from "@/lib/local-event-operations"
import { buildIdMap, composeWithOverrides, ensureIdAdded, ensureIdRemoved, upsertOverrideMap } from "@/lib/override-helpers"
import {
  readStoredEventOperations,
  readStoredTipOverrides,
  writeStoredEventOperations,
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

const loadBaseBundleForTag = async (tag: string, force = false): Promise<TagBundle> => {
  const contextTag = getActiveTag()
  return await fetchComposedForTag(tag, force, {
    includeAncestorLocalOverrides: false,
    currentTag: contextTag,
  })
}

export const loadEventForTag = async (tag: string, eventId: string) => {
  const loaded = await loadDateScopedConfiguration(tag, { includeStoredOperations: true })
  return loaded.composeForDate(getAppTodayKey()).events.find((event) => event.id === eventId) || null
}

export const saveEventForTag = async (tag: string, eventData: any) => {
  const loaded = await loadDateScopedConfiguration(tag)
  const date = getAppTodayKey()
  const effective = loaded.composeForDate(date)
  const lower = loaded.composeLowerStackForDate(date)
  const current = readStoredEventOperations(tag) || createEmptyStoredEventOperations()
  const localOwned = effective.sourceTagById[eventData.id] === tag
  const baseline = lower.events.find((event) => event.id === eventData.id)
  const publishedLeaf = loaded.layers[loaded.layers.length - 1].eventOperations!
  const publishedInherited = Object.prototype.hasOwnProperty.call(
    publishedLeaf.inheritedOverridesById,
    eventData.id,
  ) || publishedLeaf.inheritedDeletedIds.includes(eventData.id)
  const next = localOwned || !baseline
    ? storeOwnedEvent(current, eventData)
    : storeInheritedEdit(current, baseline as any, eventData, { publishedInherited })
  writeStoredEventOperations(tag, next)
  invalidateEventCacheForTag(tag)
}

export const deleteEventForTag = async (tag: string, eventId: string) => {
  const loaded = await loadDateScopedConfiguration(tag, { includeStoredOperations: true })
  const effective = loaded.composeForDate(getAppTodayKey())
  const publishedOwned = Object.prototype.hasOwnProperty.call(
    loaded.layers[loaded.layers.length - 1].eventOperations!.ownedEventsById,
    eventId,
  )
  const current = readStoredEventOperations(tag) || createEmptyStoredEventOperations()
  writeStoredEventOperations(tag, storeEventDeletion(current, eventId, {
    locallyOwned: effective.sourceTagById[eventId] === tag,
    publishedOwned,
  }))
  invalidateEventCacheForTag(tag)
}

export const clearEventOverrideForTag = async (tag: string, eventId: string) => {
  const loaded = await loadDateScopedConfiguration(tag)
  const publishedLeaf = loaded.layers[loaded.layers.length - 1].eventOperations!
  const publishedInherited = Object.prototype.hasOwnProperty.call(
    publishedLeaf.inheritedOverridesById,
    eventId,
  ) || publishedLeaf.inheritedDeletedIds.includes(eventId)
  const current = readStoredEventOperations(tag) || createEmptyStoredEventOperations()
  writeStoredEventOperations(tag, resetInheritedEventOperation(current, eventId, { publishedInherited }))
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
  const bundle = await loadBaseBundleForTag(tag, true)
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

"use client"

import { arrayToIdMap, computeDelta } from "@/lib/config-merge"
import { fetchComposedForTag } from "@/lib/config-fetcher"
import { loadDateScopedConfiguration } from "@/lib/date-scoped-config"
import { getAppTodayKey } from "@/lib/date-utils"

export type DiffInfo = {
  parentExists: boolean
  newInTag: boolean
  overrideKeys: string[]
}

export type DiffIndex = {
  hasParentChain: boolean
  events: Record<string, DiffInfo>
  tips: Record<string, DiffInfo>
}

/**
 * Compute per-id diff info for a tag by comparing the effective leaf (provided)
 * with the composed parent chain.
 */
export const computeDiffIndexForTag = async (
  effectiveEvents: any[],
  effectiveTips: any[],
  tag: string,
): Promise<DiffIndex> => {
  const eventLoader = await loadDateScopedConfiguration(tag, { includeStoredOperations: true })
  const date = getAppTodayKey()
  const eventComposition = eventLoader.composeForDate(date)
  const parentEventComposition = eventLoader.composeLowerStackForDate(date)
  const parentTag = eventLoader.parents[0] || null

  if (!parentTag || typeof parentTag !== "string") {
    // No parent chain: mark everything as newInTag=false (no parent), parentExists=false
    const events: Record<string, DiffInfo> = {}
    const tips: Record<string, DiffInfo> = {}
    for (const e of effectiveEvents || []) {
      if (!e || !e.id) continue
      events[e.id] = { parentExists: false, newInTag: true, overrideKeys: [] }
    }
    for (const t of effectiveTips || []) {
      if (!t || !t.id) continue
      tips[t.id] = { parentExists: false, newInTag: true, overrideKeys: [] }
    }
    return { hasParentChain: false, events, tips }
  }

  const parentComposed = await fetchComposedForTag(parentTag, false, {
    includeAncestorLocalOverrides: true,
    currentTag: tag,
  })

  const parentEventsById = arrayToIdMap(parentEventComposition.events || [])
  const parentTipsById = arrayToIdMap(parentComposed.tips || [])
  const childEventsById = arrayToIdMap(effectiveEvents || [])
  const childTipsById = arrayToIdMap(effectiveTips || [])

  const events: Record<string, DiffInfo> = {}
  const tips: Record<string, DiffInfo> = {}

  for (const id of Object.keys(childEventsById)) {
    const base = parentEventsById[id]
    const edited = childEventsById[id]
    const delta = computeDelta(base, edited)
    const parentExists = !!base
    const newInTag = eventComposition.sourceTagById[id] === tag
    const overrideKeys = !newInTag && parentExists && delta && typeof delta === "object" ? Object.keys(delta as any) : []
    events[id] = { parentExists, newInTag, overrideKeys }
  }
  for (const id of Object.keys(childTipsById)) {
    const base = parentTipsById[id]
    const edited = childTipsById[id]
    const delta = computeDelta(base, edited)
    const parentExists = !!base
    const newInTag = !base
    const overrideKeys = parentExists && delta && typeof delta === "object" ? Object.keys(delta as any) : []
    tips[id] = { parentExists, newInTag, overrideKeys }
  }

  return { hasParentChain: true, events, tips }
}

/** Fetch composed objects for the immediate parent of a tag. */
export const fetchParentComposed = async (
  tag: string,
): Promise<{ tag: string; events: any[]; tips: any[] } | null> => {
  const loader = await loadDateScopedConfiguration(tag, { includeStoredOperations: true })
  const parentTag = loader.parents[0] || null
  if (!parentTag) return null
  const lower = loader.composeLowerStackForDate(getAppTodayKey())
  const parent = await fetchComposedForTag(parentTag, false, {
    includeAncestorLocalOverrides: true,
    currentTag: tag,
  })
  return { tag: parentTag, events: lower.events || [], tips: parent.tips || [] }
}

export const fetchParentEvent = async (tag: string, id: string): Promise<any | null> => {
  const parent = await fetchParentComposed(tag)
  if (!parent) return null
  return (parent.events || []).find((e: any) => e && e.id === id) || null
}

export const fetchParentTip = async (tag: string, id: string): Promise<any | null> => {
  const parent = await fetchParentComposed(tag)
  if (!parent) return null
  return (parent.tips || []).find((t: any) => t && t.id === id) || null
}

"use client"

import { arrayToIdMap, computeDelta } from "@/lib/config-merge"
import { fetchComposedForTag } from "@/lib/config-fetcher"

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
  // Compose parent chain by fetching composed for tag, then removing leaf-only layer by recomposing parent
  // We don't have a direct parent compose function exported, so approximate by fetching composed for tag's parent chain
  // through fetchComposedForTag for each parent tag is not available; instead we infer parent by rebuilding
  // via config-fetcher functionality inside buildChildDeltaFiles. To keep the API surface small here, we reuse
  // fetchComposedForTag(tag) to read the leaf's composed snapshot and infer parent existence for each id by
  // removing leaf deltas via comparison with parent maps also built in buildChildDeltaFiles. Since we cannot
  // access parent maps directly, call fetchComposedForTag for tag and also for parent by reading tag's config
  // isn't available here. As a practical approach, we compute base-vs-leaf deltas using composed parent by
  // leveraging fetchComposedForTag on the parent tag derived from tagConfig.parent if present.

  // Load composed for current tag to discover parent tag
  const leafComposed = await fetchComposedForTag(tag)
  const parentTag = (leafComposed?.tagConfig && (leafComposed.tagConfig as any).parent) || null

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

  // Fetch parent-composed snapshot
  const parentComposed = await fetchComposedForTag(parentTag)

  const parentEventsById = arrayToIdMap(parentComposed.events || [])
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
    const newInTag = !base
    const overrideKeys = parentExists && delta && typeof delta === "object" ? Object.keys(delta as any) : []
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
  const leaf = await fetchComposedForTag(tag)
  const parentTag = (leaf?.tagConfig && (leaf.tagConfig as any).parent) || null
  if (!parentTag || typeof parentTag !== "string") return null
  const parent = await fetchComposedForTag(parentTag)
  return { tag: parentTag, events: parent.events || [], tips: parent.tips || [] }
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

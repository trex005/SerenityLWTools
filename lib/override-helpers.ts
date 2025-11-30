"use client"

import { deepEqual } from "@/lib/config-merge"

type IdItem = { id: string }

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value))

export const buildIdMap = <T extends IdItem>(items: T[]): Record<string, T> => {
  const map: Record<string, T> = {}
  for (const item of items) {
    if (!item || typeof item.id !== "string") continue
    map[item.id] = item
  }
  return map
}

export const composeWithOverrides = <T extends IdItem>(
  baseItems: T[],
  overridesById: Record<string, T>,
  deletedIds: readonly string[],
): T[] => {
  const deleted = new Set(deletedIds || [])
  const merged: T[] = []
  const seen = new Set<string>()

  for (const baseItem of baseItems) {
    if (!baseItem || typeof baseItem.id !== "string") continue
    if (deleted.has(baseItem.id)) continue
    const override = overridesById[baseItem.id]
    if (override) {
      merged.push(cloneJson(override))
    } else {
      merged.push(cloneJson(baseItem))
    }
    seen.add(baseItem.id)
  }

  for (const id of Object.keys(overridesById)) {
    if (seen.has(id) || deleted.has(id)) continue
    merged.push(cloneJson(overridesById[id]))
  }

  return merged
}

export const deriveOverridesFromFinal = <T extends IdItem>(
  finalItems: T[],
  baseMap: Record<string, T>,
): { overridesById: Record<string, T>; deletedIds: string[] } => {
  const overrides: Record<string, T> = {}
  const deletedIds: string[] = []
  const finalMap = buildIdMap(finalItems)

  for (const id of Object.keys(baseMap)) {
    if (!finalMap[id]) {
      deletedIds.push(id)
      continue
    }
    if (!deepEqual(baseMap[id], finalMap[id])) {
      overrides[id] = cloneJson(finalMap[id])
    }
  }

  for (const id of Object.keys(finalMap)) {
    if (!baseMap[id]) {
      overrides[id] = cloneJson(finalMap[id])
    }
  }

  return { overridesById: overrides, deletedIds }
}

export const upsertOverrideMap = <T extends IdItem>(
  baseMap: Record<string, T>,
  overridesById: Record<string, T>,
  items: T[],
): Record<string, T> => {
  if (!items || items.length === 0) return overridesById
  const next = { ...overridesById }
  for (const item of items) {
    if (!item || typeof item.id !== "string") continue
    const base = baseMap[item.id]
    if (!base || !deepEqual(base, item)) {
      next[item.id] = cloneJson(item)
    } else {
      delete next[item.id]
    }
  }
  return next
}

export const ensureIdAdded = (ids: readonly string[], id: string): string[] => {
  if (!id) return Array.from(ids)
  return ids.includes(id) ? Array.from(ids) : [...ids, id]
}

export const ensureIdRemoved = (ids: readonly string[], id: string): string[] => {
  if (!id || !ids.length) return Array.from(ids)
  return ids.filter((existing) => existing !== id)
}

export const reconcileLegacyFinalItems = <T extends IdItem>(
  legacyItems: T[] | null,
  baseMap: Record<string, T>,
): { overridesById: Record<string, T>; deletedIds: string[] } => {
  if (!legacyItems || legacyItems.length === 0) {
    return { overridesById: {}, deletedIds: [] }
  }
  return deriveOverridesFromFinal(legacyItems, baseMap)
}

export const cloneItem = cloneJson

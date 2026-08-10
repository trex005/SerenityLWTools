export type OverrideSnapshot = {
  overridesById?: Record<string, any>
  deletedIds?: string[]
  legacyItems?: any[] | null
}

export type ConfigurationLayer = {
  tag: string
  config?: Record<string, any> | null
  events?: any[]
  eventTombstones?: string[]
  tips?: any[]
  tipTombstones?: string[]
  eventOverrides?: OverrideSnapshot | null
  tipOverrides?: OverrideSnapshot | null
}

const isObject = (value: any): value is Record<string, any> =>
  Object.prototype.toString.call(value) === "[object Object]"

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

export const deepMergeJson = <T extends Record<string, any>>(
  base: T | undefined | null,
  patch: Partial<T> | undefined | null,
): T => {
  if (patch == null) return (base ?? {}) as T
  if (base == null || !isObject(base) || !isObject(patch)) return clone(patch) as T
  const result: Record<string, any> = { ...base }
  for (const key of Object.keys(patch)) {
    const next = (patch as any)[key]
    const previous = (base as any)[key]
    if (Array.isArray(next)) result[key] = clone(next)
    else if (isObject(next)) result[key] = deepMergeJson(isObject(previous) ? previous : {}, next)
    else result[key] = next
  }
  return result as T
}

const idMap = (items: any[] = []): Record<string, any> => Object.fromEntries(
  items.filter((item) => item && typeof item.id === "string").map((item) => [item.id, clone(item)]),
)

export const applyOverrideSnapshot = (
  current: Record<string, any>,
  snapshot?: OverrideSnapshot | null,
): Record<string, any> => {
  if (!snapshot) return current
  const result = snapshot.legacyItems?.length ? idMap(snapshot.legacyItems) : { ...current }
  for (const [id, patch] of Object.entries(snapshot.overridesById ?? {})) {
    result[id] = deepMergeJson(result[id], patch)
  }
  for (const id of snapshot.deletedIds ?? []) delete result[id]
  return result
}

export const mergeItemLayer = (
  inherited: Record<string, any>,
  items: Record<string, any>,
  tombstones: Iterable<string> = [],
  requireTitleForNew = false,
): Record<string, any> => {
  const result: Record<string, any> = { ...inherited }
  for (const [id, patch] of Object.entries(items)) {
    if (requireTitleForNew && !result[id] && typeof patch?.title !== "string") continue
    result[id] = deepMergeJson(result[id], patch)
  }
  for (const id of tombstones) delete result[id]
  return result
}

export const composeConfiguration = (layers: ConfigurationLayer[]) => {
  let config: Record<string, any> = {}
  let events: Record<string, any> = {}
  let tips: Record<string, any> = {}
  for (const layer of layers) {
    config = deepMergeJson(config, layer.config ?? {})
    const layerEvents = applyOverrideSnapshot(idMap(layer.events), layer.eventOverrides)
    const eventDeletes = new Set([...(layer.eventTombstones ?? []), ...(layer.eventOverrides?.deletedIds ?? [])])
    events = mergeItemLayer(events, layerEvents, eventDeletes, true)
    const layerTips = applyOverrideSnapshot(idMap(layer.tips), layer.tipOverrides)
    const tipDeletes = new Set([...(layer.tipTombstones ?? []), ...(layer.tipOverrides?.deletedIds ?? [])])
    tips = mergeItemLayer(tips, layerTips, tipDeletes)
  }
  return { tagConfig: config, events: Object.values(events), tips: Object.values(tips) }
}

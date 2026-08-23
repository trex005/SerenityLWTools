import { diffEventToJsonPointers } from "./event-operation-diff"
import type { NormalizedEventOperations } from "./serenity-engine/event-operations"
import type { StoredEventOperations } from "./scoped-storage"

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))

export const createEmptyStoredEventOperations = (): StoredEventOperations => ({
  ownedEventsById: {},
  inheritedOverridesById: {},
  inheritedDeletedIds: [],
  suppressedPublishedOwnedIds: [],
  suppressedPublishedInheritedIds: [],
})

export const mergePublishedAndStoredEventOperations = (
  published: NormalizedEventOperations,
  stored?: StoredEventOperations | null,
): NormalizedEventOperations => {
  const result: NormalizedEventOperations = {
    ownedEventsById: clone(published.ownedEventsById),
    inheritedOverridesById: clone(published.inheritedOverridesById),
    inheritedDeletedIds: published.inheritedDeletedIds.slice(),
  }
  if (!stored) return result

  const deleted = new Set(result.inheritedDeletedIds)
  for (const id of stored.suppressedPublishedOwnedIds ?? []) delete result.ownedEventsById[id]
  for (const id of stored.suppressedPublishedInheritedIds ?? []) {
    delete result.inheritedOverridesById[id]
    deleted.delete(id)
  }

  for (const [id, event] of Object.entries(stored.ownedEventsById)) {
    result.ownedEventsById[id] = clone(event)
    delete result.inheritedOverridesById[id]
    deleted.delete(id)
  }
  for (const [id, operation] of Object.entries(stored.inheritedOverridesById)) {
    delete result.ownedEventsById[id]
    deleted.delete(id)
    result.inheritedOverridesById[id] = {
      setByPointer: clone(operation.set || {}),
      removePointers: (operation.remove || []).slice(),
    }
  }
  for (const id of stored.inheritedDeletedIds) {
    delete result.ownedEventsById[id]
    delete result.inheritedOverridesById[id]
    deleted.add(id)
  }
  result.inheritedDeletedIds = Array.from(deleted)
  return result
}

const withoutId = (values: readonly string[], id: string): string[] => values.filter((value) => value !== id)
const withId = (values: readonly string[], id: string): string[] =>
  values.includes(id) ? values.slice() : [...values, id]

export const storeOwnedEvent = <T extends { id: string }>(
  current: StoredEventOperations,
  event: T,
): StoredEventOperations => {
  const next = clone(current)
  next.ownedEventsById[event.id] = clone(event)
  delete next.inheritedOverridesById[event.id]
  next.inheritedDeletedIds = withoutId(next.inheritedDeletedIds, event.id)
  next.suppressedPublishedOwnedIds = withoutId(next.suppressedPublishedOwnedIds, event.id)
  next.suppressedPublishedInheritedIds = withoutId(next.suppressedPublishedInheritedIds ?? [], event.id)
  return next
}

export const storeInheritedEdit = <B extends { id: string }, E extends { id: string }>(
  current: StoredEventOperations,
  inheritedBaseline: B,
  edited: E,
  options: { publishedInherited?: boolean } = {},
): StoredEventOperations => {
  if (inheritedBaseline.id !== edited.id) throw new Error("Inherited event ID cannot be changed")
  const next = clone(current)
  const diff = diffEventToJsonPointers(
    inheritedBaseline as Record<string, unknown>,
    edited as Record<string, unknown>,
  )
  delete next.ownedEventsById[edited.id]
  next.inheritedDeletedIds = withoutId(next.inheritedDeletedIds, edited.id)
  if (!diff) {
    delete next.inheritedOverridesById[edited.id]
    next.suppressedPublishedInheritedIds = options.publishedInherited
      ? withId(next.suppressedPublishedInheritedIds ?? [], edited.id)
      : withoutId(next.suppressedPublishedInheritedIds ?? [], edited.id)
  } else {
    next.inheritedOverridesById[edited.id] = diff
    next.suppressedPublishedInheritedIds = withoutId(next.suppressedPublishedInheritedIds ?? [], edited.id)
  }
  return next
}

export const storeEventDeletion = (
  current: StoredEventOperations,
  id: string,
  options: { locallyOwned: boolean; publishedOwned: boolean },
): StoredEventOperations => {
  const next = clone(current)
  delete next.inheritedOverridesById[id]
  next.suppressedPublishedInheritedIds = withoutId(next.suppressedPublishedInheritedIds ?? [], id)
  next.inheritedDeletedIds = withoutId(next.inheritedDeletedIds, id)
  if (options.locallyOwned) {
    delete next.ownedEventsById[id]
    next.suppressedPublishedOwnedIds = options.publishedOwned
      ? withId(next.suppressedPublishedOwnedIds, id)
      : withoutId(next.suppressedPublishedOwnedIds, id)
  } else {
    next.inheritedDeletedIds = withId(next.inheritedDeletedIds, id)
  }
  return next
}

export const resetInheritedEventOperation = (
  current: StoredEventOperations,
  id: string,
  options: { publishedInherited?: boolean } = {},
): StoredEventOperations => {
  const next = clone(current)
  delete next.inheritedOverridesById[id]
  next.inheritedDeletedIds = withoutId(next.inheritedDeletedIds, id)
  next.suppressedPublishedInheritedIds = options.publishedInherited
    ? withId(next.suppressedPublishedInheritedIds ?? [], id)
    : withoutId(next.suppressedPublishedInheritedIds ?? [], id)
  return next
}

export const discardStoredInheritedOperation = (
  current: StoredEventOperations,
  id: string,
): StoredEventOperations => {
  const next = clone(current)
  delete next.inheritedOverridesById[id]
  next.inheritedDeletedIds = withoutId(next.inheritedDeletedIds, id)
  next.suppressedPublishedInheritedIds = withoutId(next.suppressedPublishedInheritedIds ?? [], id)
  return next
}

export const serializeEventOperations = (operations: NormalizedEventOperations) => ({
  schemaVersion: 2 as const,
  operations: [
    ...Object.values(operations.ownedEventsById).map((event) => ({ kind: "owned" as const, event: clone(event) })),
    ...Object.entries(operations.inheritedOverridesById).map(([id, operation]) => ({
      kind: "override" as const,
      id,
      set: clone(operation.setByPointer),
      ...(operation.removePointers.length ? { remove: operation.removePointers.slice() } : {}),
    })),
    ...operations.inheritedDeletedIds.map((id) => ({ kind: "delete" as const, id })),
  ],
})

import assert from "node:assert/strict"
import test from "node:test"
import {
  createEmptyStoredEventOperations,
  mergePublishedAndStoredEventOperations,
  storeEventDeletion,
  storeInheritedEdit,
  storeOwnedEvent,
} from "./local-event-operations"

test("an inherited edit is stored as a pointer patch", () => {
  const stored = storeInheritedEdit(
    createEmptyStoredEventOperations(),
    { id: "e", title: "Parent", description: "old" },
    { id: "e", title: "Local" },
  )
  assert.deepEqual(stored.inheritedOverridesById.e, {
    set: { "/title": "Local" },
    remove: ["/description"],
  })
  assert.deepEqual(stored.ownedEventsById, {})
})

test("only an explicit owned write creates an owned event", () => {
  const stored = storeOwnedEvent(createEmptyStoredEventOperations(), { id: "e", title: "Created" })
  assert.equal(stored.ownedEventsById.e.title, "Created")
  assert.deepEqual(stored.inheritedOverridesById, {})
})

test("deleting inherited is conditional while deleting published owned suppresses ownership", () => {
  const inherited = storeEventDeletion(createEmptyStoredEventOperations(), "e", {
    locallyOwned: false,
    publishedOwned: false,
  })
  assert.deepEqual(inherited.inheritedDeletedIds, ["e"])

  const owned = storeEventDeletion(createEmptyStoredEventOperations(), "e", {
    locallyOwned: true,
    publishedOwned: true,
  })
  assert.deepEqual(owned.suppressedPublishedOwnedIds, ["e"])
  assert.deepEqual(owned.inheritedDeletedIds, [])
})

test("stored operation replaces the published operation for an id", () => {
  const merged = mergePublishedAndStoredEventOperations(
    {
      ownedEventsById: {},
      inheritedOverridesById: { e: { setByPointer: { "/title": "Published" }, removePointers: [] } },
      inheritedDeletedIds: [],
    },
    {
      ...createEmptyStoredEventOperations(),
      inheritedDeletedIds: ["e"],
    },
  )
  assert.deepEqual(merged.inheritedOverridesById, {})
  assert.deepEqual(merged.inheritedDeletedIds, ["e"])
})

test("resetting a published inherited override suppresses it instead of restoring it", () => {
  const stored = storeInheritedEdit(
    createEmptyStoredEventOperations(),
    { id: "e", title: "Parent" },
    { id: "e", title: "Parent" },
    { publishedInherited: true },
  )
  const merged = mergePublishedAndStoredEventOperations({
    ownedEventsById: {},
    inheritedOverridesById: { e: { setByPointer: { "/title": "Published local" }, removePointers: [] } },
    inheritedDeletedIds: [],
  }, stored)
  assert.deepEqual(merged.inheritedOverridesById, {})
})

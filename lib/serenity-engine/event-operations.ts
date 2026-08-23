import { SerenityEngineError } from "./errors"

export type JsonObject = Record<string, unknown>

export type OwnedEventOperation = { kind: "owned"; event: JsonObject & { id: string; title: string } }
export type OverrideEventOperation = {
  kind: "override"
  id: string
  set: Record<string, unknown>
  remove?: string[]
}
export type DeleteEventOperation = { kind: "delete"; id: string }
export type EventOperation = OwnedEventOperation | OverrideEventOperation | DeleteEventOperation

export type EventOperationsDocument = {
  schemaVersion: 2
  updated?: string
  operations: EventOperation[]
}

export type NormalizedEventOperations = {
  ownedEventsById: Record<string, JsonObject>
  inheritedOverridesById: Record<string, { setByPointer: Record<string, unknown>; removePointers: string[] }>
  inheritedDeletedIds: string[]
}

const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key)
const isObject = (value: unknown): value is JsonObject =>
  value !== null && typeof value === "object" && !Array.isArray(value)
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const UNSAFE_SEGMENTS = new Set(["__proto__", "prototype", "constructor"])
const normalizedValidationCache = new WeakMap<object, NormalizedEventOperations>()

const assertId = (value: unknown, context: string): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${context} must have a non-empty string id`)
  return value
}

const assertJsonValue = (value: unknown, context: string): void => {
  if (value === null || typeof value === "string" || typeof value === "boolean") return
  if (typeof value === "number" && Number.isFinite(value)) return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${context}[${index}]`))
    return
  }
  if (isObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (UNSAFE_SEGMENTS.has(key)) throw new Error(`${context} contains unsafe object key ${JSON.stringify(key)}`)
      assertJsonValue(item, `${context}.${key}`)
    }
    return
  }
  throw new Error(`${context} must contain only JSON values`)
}

export const decodeJsonPointer = (pointer: string): string[] => {
  if (typeof pointer !== "string" || pointer === "" || !pointer.startsWith("/")) {
    throw new Error(`Override pointer ${JSON.stringify(pointer)} must be a non-root RFC 6901 JSON Pointer`)
  }
  return pointer.slice(1).split("/").map((encoded) => {
    if (/~(?:[^01]|$)/.test(encoded)) throw new Error(`Invalid JSON Pointer escape in ${JSON.stringify(pointer)}`)
    const segment = encoded.replace(/~1/g, "/").replace(/~0/g, "~")
    if (UNSAFE_SEGMENTS.has(segment)) throw new Error(`Unsafe JSON Pointer segment ${JSON.stringify(segment)}`)
    return segment
  })
}

const overlaps = (left: string[], right: string[]): boolean => {
  const length = Math.min(left.length, right.length)
  return left.slice(0, length).every((segment, index) => segment === right[index])
}

const validatePointers = (set: Record<string, unknown>, remove: string[], id: string): void => {
  const pointers = [...Object.keys(set), ...remove]
  const decoded = pointers.map(decodeJsonPointer)
  decoded.forEach((segments, index) => {
    if (segments[0] === "id") throw new Error(`Override for ${JSON.stringify(id)} cannot change /id`)
    for (let other = index + 1; other < decoded.length; other += 1) {
      if (overlaps(segments, decoded[other])) {
        throw new Error(`Override for ${JSON.stringify(id)} has overlapping pointers ${JSON.stringify(pointers[index])} and ${JSON.stringify(pointers[other])}`)
      }
    }
  })
}

const normalizeEventOperationsUnsafe = (document: unknown): NormalizedEventOperations => {
  if (!isObject(document) || document.schemaVersion !== 2 || !Array.isArray(document.operations)) {
    throw new Error("Event document must use schemaVersion 2 and an operations array")
  }
  if (document.operations.length > 10_000) throw new Error("An event layer cannot contain more than 10000 operations")
  if (own(document, "events")) throw new Error("Event document cannot mix version 2 operations with legacy events")
  const normalized: NormalizedEventOperations = {
    ownedEventsById: Object.create(null),
    inheritedOverridesById: Object.create(null),
    inheritedDeletedIds: [],
  }
  const ids = new Set<string>()
  for (const raw of document.operations) {
    if (!isObject(raw) || !["owned", "override", "delete"].includes(String(raw.kind))) {
      throw new Error(`Unknown or malformed event operation kind ${JSON.stringify(raw && (raw as JsonObject).kind)}`)
    }
    let id: string
    if (raw.kind === "owned") {
      if (!isObject(raw.event)) throw new Error("Owned operation must contain a complete event object")
      id = assertId(raw.event.id, "Owned event")
      if (typeof raw.event.title !== "string" || !raw.event.title.trim()) {
        throw new Error(`Owned event ${JSON.stringify(id)} must have a non-empty title`)
      }
      assertJsonValue(raw.event, `Owned event ${JSON.stringify(id)}`)
      normalized.ownedEventsById[id] = clone(raw.event)
    } else if (raw.kind === "override") {
      id = assertId(raw.id, "Override operation")
      if (!isObject(raw.set)) throw new Error(`Override for ${JSON.stringify(id)} must contain a set object`)
      const remove = raw.remove === undefined ? [] : raw.remove
      if (!Array.isArray(remove) || remove.some((pointer) => typeof pointer !== "string")) {
        throw new Error(`Override for ${JSON.stringify(id)} remove must be an array of pointers`)
      }
      validatePointers(raw.set, remove as string[], id)
      assertJsonValue(raw.set, `Override for ${JSON.stringify(id)} set`)
      normalized.inheritedOverridesById[id] = {
        setByPointer: clone(raw.set),
        removePointers: [...remove] as string[],
      }
    } else {
      id = assertId(raw.id, "Delete operation")
      normalized.inheritedDeletedIds.push(id)
    }
    if (ids.has(id)) throw new Error(`Layer has more than one operation for event ${JSON.stringify(id)}`)
    ids.add(id)
  }
  return normalized
}

export const normalizeEventOperations = (document: unknown): NormalizedEventOperations => {
  try {
    return normalizeEventOperationsUnsafe(document)
  } catch (error) {
    if (error instanceof SerenityEngineError) throw error
    throw new SerenityEngineError(
      /more than 10000/.test(error instanceof Error ? error.message : "") ? "LIMIT_EXCEEDED" : "INVALID_EVENT_OPERATIONS",
      error instanceof Error ? error.message : String(error),
    )
  }
}

export const validateNormalizedEventOperations = (value: unknown): NormalizedEventOperations => {
  try {
    if (!isObject(value)
      || !isObject(value.ownedEventsById)
      || !isObject(value.inheritedOverridesById)
      || !Array.isArray(value.inheritedDeletedIds)) {
      throw new Error("Normalized event operations must contain owned, override, and deleted collections")
    }
    const cached = normalizedValidationCache.get(value)
    if (cached) return cached
    const operations: EventOperation[] = []
    for (const [id, event] of Object.entries(value.ownedEventsById)) {
      if (!isObject(event) || event.id !== id) throw new Error(`Owned event map key ${JSON.stringify(id)} must match event.id`)
      operations.push({ kind: "owned", event: event as OwnedEventOperation["event"] })
    }
    for (const [id, operation] of Object.entries(value.inheritedOverridesById)) {
      if (!isObject(operation) || !isObject(operation.setByPointer) || !Array.isArray(operation.removePointers)) {
        throw new Error(`Malformed normalized override for ${JSON.stringify(id)}`)
      }
      operations.push({
        kind: "override",
        id,
        set: operation.setByPointer,
        remove: operation.removePointers as string[],
      })
    }
    for (const id of value.inheritedDeletedIds) operations.push({ kind: "delete", id: id as string })
    const normalized = normalizeEventOperations({ schemaVersion: 2, operations })
    normalizedValidationCache.set(value, normalized)
    return normalized
  } catch (error) {
    if (error instanceof SerenityEngineError) throw error
    throw new SerenityEngineError("INVALID_EVENT_OPERATIONS", error instanceof Error ? error.message : String(error))
  }
}

const arrayIndex = (segment: string, length: number, allowAppend: boolean): number | null => {
  if (allowAppend && segment === "-") return length
  if (!/^(0|[1-9]\d*)$/.test(segment)) return null
  return Number(segment)
}

export const setByJsonPointer = (target: JsonObject, pointer: string, value: unknown): void => {
  const segments = decodeJsonPointer(pointer)
  let cursor: unknown = target
  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]
    const nextSegment = segments[index + 1]
    if (Array.isArray(cursor)) {
      const position = arrayIndex(segment, cursor.length, false)
      if (position === null || position >= cursor.length) throw new Error(`JSON Pointer parent does not exist: ${JSON.stringify(pointer)}`)
      if (cursor[position] === null || typeof cursor[position] !== "object") {
        cursor[position] = /^(0|[1-9]\d*|-)$/.test(nextSegment) ? [] : {}
      }
      cursor = cursor[position]
    } else if (isObject(cursor)) {
      if (!isObject(cursor[segment]) && !Array.isArray(cursor[segment])) {
        cursor[segment] = /^(0|[1-9]\d*|-)$/.test(nextSegment) ? [] : {}
      }
      cursor = cursor[segment]
    } else throw new Error(`JSON Pointer cannot traverse a scalar: ${JSON.stringify(pointer)}`)
  }
  const final = segments[segments.length - 1]
  if (Array.isArray(cursor)) {
    const position = arrayIndex(final, cursor.length, true)
    if (position === null || position > cursor.length) throw new Error(`Invalid array JSON Pointer ${JSON.stringify(pointer)}`)
    cursor[position] = clone(value)
  } else if (isObject(cursor)) cursor[final] = clone(value)
  else throw new Error(`JSON Pointer cannot address a scalar: ${JSON.stringify(pointer)}`)
}

export const removeByJsonPointer = (target: JsonObject, pointer: string): void => {
  const segments = decodeJsonPointer(pointer)
  let cursor: unknown = target
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(cursor)) {
      const position = arrayIndex(segment, cursor.length, false)
      if (position === null || position >= cursor.length) return
      cursor = cursor[position]
    } else if (isObject(cursor) && own(cursor, segment)) cursor = cursor[segment]
    else return
  }
  const final = segments[segments.length - 1]
  if (Array.isArray(cursor)) {
    const position = arrayIndex(final, cursor.length, false)
    if (position !== null && position < cursor.length) cursor.splice(position, 1)
  } else if (isObject(cursor)) delete cursor[final]
}

export const applyJsonPointerOverride = (
  event: JsonObject,
  operation: NormalizedEventOperations["inheritedOverridesById"][string],
): JsonObject => {
  const result = clone(event)
  for (const [pointer, value] of Object.entries(operation.setByPointer)) setByJsonPointer(result, pointer, value)
  for (const pointer of operation.removePointers) removeByJsonPointer(result, pointer)
  return result
}

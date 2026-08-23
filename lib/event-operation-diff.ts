import { deepEqual } from "./config-merge"

export type JsonPointerOverride = {
  set: Record<string, unknown>
  remove: string[]
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === "[object Object]"

const cloneJson = <T>(value: T): T => JSON.parse(JSON.stringify(value))

const escapePointerSegment = (segment: string): string =>
  segment.replace(/~/g, "~0").replace(/\//g, "~1")

const childPointer = (parent: string, key: string): string =>
  `${parent}/${escapePointerSegment(key)}`

const collectChanges = (
  base: unknown,
  edited: unknown,
  pointer: string,
  result: JsonPointerOverride,
): void => {
  if (deepEqual(base, edited)) return

  if (isPlainObject(base) && isPlainObject(edited)) {
    const keys = Array.from(new Set([...Object.keys(base), ...Object.keys(edited)])).sort()
    for (const key of keys) {
      if (pointer === "" && key === "id") continue
      const nextPointer = childPointer(pointer, key)
      if (!Object.prototype.hasOwnProperty.call(edited, key)) {
        result.remove.push(nextPointer)
      } else if (!Object.prototype.hasOwnProperty.call(base, key)) {
        result.set[nextPointer] = cloneJson(edited[key])
      } else {
        collectChanges(base[key], edited[key], nextPointer, result)
      }
    }
    return
  }

  if (!pointer) {
    throw new Error("Event overrides cannot replace the document root")
  }
  result.set[pointer] = cloneJson(edited)
}

export const diffEventToJsonPointers = (
  base: Record<string, unknown>,
  edited: Record<string, unknown>,
): JsonPointerOverride | null => {
  if (!base || !edited || typeof base.id !== "string" || base.id !== edited.id) {
    throw new Error("Event override IDs must match")
  }

  const result: JsonPointerOverride = { set: {}, remove: [] }
  collectChanges(base, edited, "", result)
  result.remove.sort()
  return Object.keys(result.set).length > 0 || result.remove.length > 0 ? result : null
}


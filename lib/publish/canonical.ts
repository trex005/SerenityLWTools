/**
 * Canonical JSON comparison helpers for publish diffing.
 *
 * Two documents mean the same thing for publishing purposes when they differ
 * only in:
 *  - `updated` timestamp fields anywhere in the tree, or
 *  - the ORDER of entries inside an `operations` array (event-operations
 *    documents are semantically keyed by `kind` + `id`, so stored-draft and
 *    published layers may serialize in different orders without differing).
 */

const sortValue = (input: unknown): unknown => {
  if (Array.isArray(input)) {
    const mapped = input.map(sortValue)
    // Heuristic: operation lists are sets keyed by kind/id; sort them so
    // equivalent documents compare equal regardless of serialization order.
    if (
      input.length > 1 &&
      mapped.every(
        (item) =>
          item &&
          typeof item === "object" &&
          !Array.isArray(item) &&
          "kind" in (item as Record<string, unknown>),
      )
    ) {
      return [...(mapped as Record<string, unknown>[])].sort((a, b) =>
        operationSortKey(a).localeCompare(operationSortKey(b)),
      )
    }
    return mapped
  }
  if (input && typeof input === "object") {
    return Object.keys(input as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = sortValue((input as Record<string, unknown>)[key])
        return acc
      }, {})
  }
  return input
}

const operationSortKey = (operation: Record<string, unknown>): string => {
  const id = typeof operation.id === "string" ? operation.id : ""
  const kind = typeof operation.kind === "string" ? operation.kind : ""
  return `${kind}|${id}|${JSON.stringify(sortValue(operation))}`
}

export const canonicalJson = (value: unknown): string => {
  const stripped = stripVolatile(value)
  return JSON.stringify(sortValue(stripped))
}

const stripVolatile = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(stripVolatile)
  if (value && typeof value === "object") {
    const result: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (key === "updated") continue
      result[key] = stripVolatile(item)
    }
    return result
  }
  return value
}

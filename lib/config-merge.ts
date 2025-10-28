"use client"

type Json = any

const isPlainObject = (val: any): val is Record<string, any> => {
  return Object.prototype.toString.call(val) === "[object Object]"
}

export const deepEqual = (a: Json, b: Json): boolean => {
  if (a === b) return true
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ak = Object.keys(a)
    const bk = Object.keys(b)
    if (ak.length !== bk.length) return false
    for (const k of ak) {
      if (!bk.includes(k)) return false
      if (!deepEqual(a[k], b[k])) return false
    }
    return true
  }
  if (typeof a === "number" && typeof b === "number" && isNaN(a) && isNaN(b)) return true
  return false
}

export const deepMerge = <T extends Record<string, any>>(base: T | undefined, patch: Partial<T> | undefined): T => {
  if (patch == null) return (base ?? ({} as T))
  if (base == null) return JSON.parse(JSON.stringify(patch)) as T

  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return JSON.parse(JSON.stringify(patch)) as T
  }

  const out: Record<string, any> = { ...base }
  for (const key of Object.keys(patch)) {
    const pv = (patch as any)[key]
    const bv = (base as any)[key]
    if (Array.isArray(pv)) {
      out[key] = JSON.parse(JSON.stringify(pv))
    } else if (isPlainObject(pv) && isPlainObject(bv)) {
      out[key] = deepMerge(bv, pv)
    } else if (isPlainObject(pv) && !isPlainObject(bv)) {
      out[key] = deepMerge({}, pv)
    } else {
      out[key] = pv
    }
  }
  return out as T
}

export const computeDelta = (base: Json | undefined, edited: Json | undefined): Json | undefined => {
  if (edited === undefined) return undefined
  if (base === undefined) return JSON.parse(JSON.stringify(edited))
  if (deepEqual(base, edited)) return undefined

  if (Array.isArray(edited)) {
    return JSON.parse(JSON.stringify(edited))
  }

  if (isPlainObject(edited) && isPlainObject(base)) {
    const result: Record<string, any> = {}
    const keys = new Set<string>([...Object.keys(edited), ...Object.keys(base)])
    for (const k of keys) {
      const d = computeDelta((base as any)[k], (edited as any)[k])
      if (d !== undefined) {
        result[k] = d
      }
    }
    return Object.keys(result).length ? result : undefined
  }
  return edited
}

export const arrayToIdMap = <T extends { id: string }>(arr: T[]): Record<string, T> => {
  const map: Record<string, T> = {}
  for (const item of arr) {
    if (!item || typeof item.id !== "string") continue
    map[item.id] = item
  }
  return map
}

export const idMapToArray = <T extends { id: string }>(map: Record<string, T>): T[] => {
  return Object.values(map)
}

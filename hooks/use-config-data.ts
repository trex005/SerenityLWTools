"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { fetchConfig } from "@/lib/config-fetcher"
import { getActiveTag } from "@/lib/config-tag"
import { buildBrandTitle, normalizeBrandConfig, type BrandSettings } from "@/lib/branding"

type CachedValues = {
  events: any[]
  tips: any[]
  tagConfig: Record<string, unknown> | null
  brand: BrandSettings
}

type DataType = "events" | "tips"

const normalizeTypes = (types?: DataType[]): DataType[] => {
  if (!types || types.length === 0) return ["events", "tips"]
  return Array.from(new Set(types)).sort()
}

const buildCacheKey = (tag: string, types?: DataType[]) => `${tag}|${normalizeTypes(types).join(",")}`

const cacheByTag = new Map<string, CachedValues>()
const promiseByTag = new Map<string, Promise<any>>()

export function useConfigData(options?: { dataTypes?: DataType[] }) {
  const requestedTypes = normalizeTypes(options?.dataTypes)
  const initialTag = useRef(getActiveTag())
  const initialCacheKey = buildCacheKey(initialTag.current, requestedTypes)
  const [tag, setTag] = useState(initialTag.current)
  const [events, setEvents] = useState<any[]>(cacheByTag.get(initialCacheKey)?.events ?? [])
  const [tips, setTips] = useState<any[]>(cacheByTag.get(initialCacheKey)?.tips ?? [])
  const [tagConfig, setTagConfig] = useState<Record<string, unknown> | null>(
    cacheByTag.get(initialCacheKey)?.tagConfig ?? null,
  )
  const [brand, setBrand] = useState<BrandSettings>(
    cacheByTag.get(initialCacheKey)?.brand ?? normalizeBrandConfig(null),
  )
  const [isLoaded, setIsLoaded] = useState(cacheByTag.has(initialCacheKey))
  const [error, setError] = useState<Error | null>(null)
  const lastTypesKeyRef = useRef(requestedTypes.join(","))

  const applyConfigData = useCallback(
    (resolvedTag: string, values: CachedValues) => {
      const cacheKey = buildCacheKey(resolvedTag, requestedTypes)
      cacheByTag.set(cacheKey, values)
      setTag(resolvedTag)
      setEvents(values.events)
      setTips(values.tips)
      setTagConfig(values.tagConfig)
      setBrand(values.brand)
      setIsLoaded(true)
      setError(null)
    },
    [],
  )

  const attachToPromise = useCallback(
    (promise: Promise<any>, activeTag: string) => {
      return promise
        .then((data) => {
          const resolvedTag = data?.tag || activeTag
          const normalized: CachedValues = {
            events: Array.isArray(data?.events) ? data.events : [],
            tips: Array.isArray(data?.tips) ? data.tips : [],
            tagConfig: data && typeof data.tagConfig === "object" ? data.tagConfig : null,
            brand: normalizeBrandConfig(data?.tagConfig),
          }
          applyConfigData(resolvedTag, normalized)
          return { tag: resolvedTag, ...normalized }
        })
        .catch((err) => {
          const errorInstance = err instanceof Error ? err : new Error(String(err))
          setError(errorInstance)
          setIsLoaded(true)
          throw errorInstance
        })
    },
    [applyConfigData],
  )

  const loadConfig = useCallback(
    async (force = false) => {
      const activeTag = getActiveTag()
      const cacheKey = buildCacheKey(activeTag, requestedTypes)

      if (!force && cacheByTag.has(cacheKey)) {
        const cached = cacheByTag.get(cacheKey)!
        setTag(activeTag)
        setEvents(cached.events)
        setTips(cached.tips)
        setTagConfig(cached.tagConfig)
        setBrand(cached.brand)
        setIsLoaded(true)
        setError(null)
        return { tag: activeTag, ...cached }
      }

      if (!force && promiseByTag.has(cacheKey)) {
        setIsLoaded(false)
        return attachToPromise(promiseByTag.get(cacheKey)!, activeTag)
      }

      setIsLoaded(false)

      const promise = (async () => {
        try {
          const data = await fetchConfig(force, {
            includeAncestorLocalOverrides: true,
            dataTypes: requestedTypes,
          })
          const resolvedTag = data?.tag || activeTag
          const normalized: CachedValues = {
            events: Array.isArray(data?.events) ? data.events : [],
            tips: Array.isArray(data?.tips) ? data.tips : [],
            tagConfig: data && typeof data.tagConfig === "object" ? data.tagConfig : null,
            brand: normalizeBrandConfig(data?.tagConfig),
          }

          if (resolvedTag !== activeTag) {
            promiseByTag.delete(activeTag)
          }

          return { tag: resolvedTag, ...normalized }
        } catch (err) {
          throw err
        } finally {
          promiseByTag.delete(cacheKey)
        }
      })()

      promiseByTag.set(cacheKey, promise)
      return attachToPromise(promise, activeTag)
    },
    [applyConfigData, attachToPromise, requestedTypes],
  )

  useEffect(() => {
    loadConfig().catch(() => {
      // Error state handled within loadConfig
    })
  }, [loadConfig])

  useEffect(() => {
    const typesKey = requestedTypes.join(",")
    if (typesKey === lastTypesKeyRef.current) return
    lastTypesKeyRef.current = typesKey

    const activeTag = getActiveTag()
    const cacheKey = buildCacheKey(activeTag, requestedTypes)
    const cached = cacheByTag.get(cacheKey)

    setEvents(cached?.events ?? [])
    setTips(cached?.tips ?? [])
    setTagConfig(cached?.tagConfig ?? null)
    setBrand(cached?.brand ?? normalizeBrandConfig(null))
    setIsLoaded(!!cached)
    setError(null)
  }, [requestedTypes])

  return {
    tag,
    events,
    tips,
    tagConfig,
    brand,
    isLoaded,
    error,
    reload: (force = false) =>
      loadConfig(force).catch((err) => {
        throw err
      }),
    // Keep a stable, derived label for components that want a full brand name without re-computing.
    brandLabel: buildBrandTitle(brand?.name),
  }
}

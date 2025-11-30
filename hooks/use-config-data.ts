"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { fetchConfig } from "@/lib/config-fetcher"
import { getActiveTag } from "@/lib/config-tag"

type CachedValues = {
  events: any[]
  tips: any[]
}

const cacheByTag = new Map<string, CachedValues>()
const promiseByTag = new Map<string, Promise<any>>()

export function useConfigData() {
  const initialTag = useRef(getActiveTag())
  const [tag, setTag] = useState(initialTag.current)
  const [events, setEvents] = useState<any[]>(cacheByTag.get(tag)?.events ?? [])
  const [tips, setTips] = useState<any[]>(cacheByTag.get(tag)?.tips ?? [])
  const [isLoaded, setIsLoaded] = useState(cacheByTag.has(tag))
  const [error, setError] = useState<Error | null>(null)

  const applyConfigData = useCallback(
    (resolvedTag: string, values: CachedValues) => {
      cacheByTag.set(resolvedTag, values)
      setTag(resolvedTag)
      setEvents(values.events)
      setTips(values.tips)
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

      if (!force && cacheByTag.has(activeTag)) {
        const cached = cacheByTag.get(activeTag)!
        setTag(activeTag)
        setEvents(cached.events)
        setTips(cached.tips)
        setIsLoaded(true)
        setError(null)
        return { tag: activeTag, ...cached }
      }

      if (!force && promiseByTag.has(activeTag)) {
        setIsLoaded(false)
        return attachToPromise(promiseByTag.get(activeTag)!, activeTag)
      }

      setIsLoaded(false)

      const promise = (async () => {
        try {
          const data = await fetchConfig(force, { includeAncestorLocalOverrides: true })
          const resolvedTag = data?.tag || activeTag
          const normalized: CachedValues = {
            events: Array.isArray(data?.events) ? data.events : [],
            tips: Array.isArray(data?.tips) ? data.tips : [],
          }

          if (resolvedTag !== activeTag) {
            promiseByTag.delete(activeTag)
          }

          return { tag: resolvedTag, ...normalized }
        } catch (err) {
          throw err
        } finally {
          promiseByTag.delete(activeTag)
        }
      })()

      promiseByTag.set(activeTag, promise)
      return attachToPromise(promise, activeTag)
    },
    [applyConfigData, attachToPromise],
  )

  useEffect(() => {
    loadConfig().catch(() => {
      // Error state handled within loadConfig
    })
  }, [loadConfig])

  return {
    tag,
    events,
    tips,
    isLoaded,
    error,
    reload: (force = false) =>
      loadConfig(force).catch((err) => {
        throw err
      }),
  }
}

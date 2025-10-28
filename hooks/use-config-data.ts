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
        return promiseByTag.get(activeTag)
      }

      setIsLoaded(false)

      const promise = (async () => {
        try {
          const data = await fetchConfig(force)
          const resolvedTag = data?.tag || activeTag
          const normalized = {
            events: Array.isArray(data?.events) ? data.events : [],
            tips: Array.isArray(data?.tips) ? data.tips : [],
          }

          cacheByTag.set(resolvedTag, normalized)
          setTag(resolvedTag)
          setEvents(normalized.events)
          setTips(normalized.tips)
          setIsLoaded(true)
          setError(null)

          if (resolvedTag !== activeTag) {
            promiseByTag.delete(activeTag)
          }

          return { tag: resolvedTag, ...normalized }
        } catch (err) {
          const errorInstance = err instanceof Error ? err : new Error(String(err))
          setError(errorInstance)
          setIsLoaded(true)
          throw errorInstance
        } finally {
          promiseByTag.delete(activeTag)
        }
      })()

      promiseByTag.set(activeTag, promise)
      return promise
    },
    [],
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

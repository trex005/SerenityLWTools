"use client"

import { useState, useEffect, useCallback } from "react"
import { fetchConfig } from "@/lib/config-fetcher"
import { initialConfig } from "@/lib/config-init"
import { useAdminState } from "@/hooks/use-admin-state"

// Module-level cache to store the fetched data
let cachedConfig: { events: any[]; tips: any[] } | null = null
let isFetching = false
let loadPromise: Promise<any> | null = null

/**
 * Hook to access the config data directly
 * This is used in the read-only interface to display events and tips
 * without using local storage
 */
export function useConfigData() {
  const [events, setEvents] = useState<any[]>(cachedConfig?.events || initialConfig.events)
  const [tips, setTips] = useState<any[]>(cachedConfig?.tips || initialConfig.tips)
  const [isLoaded, setIsLoaded] = useState(!!cachedConfig)
  const [error, setError] = useState<Error | null>(null)
  const { isAdmin } = useAdminState() // Get admin state

  // Create a loadConfig function that can be called directly
  const loadConfig = useCallback(
    async (force = false) => {
      // If we already have cached data and not forcing, use it immediately
      if (cachedConfig && !force) {
        setEvents(cachedConfig.events)
        setTips(cachedConfig.tips)
        setIsLoaded(true)
        return cachedConfig
      }

      // If a fetch is already in progress, return the existing promise
      if (isFetching && loadPromise) {
        return loadPromise
      }

      // Create a new load promise
      isFetching = true
      loadPromise = new Promise(async (resolve, reject) => {
        try {
          // Loading configuration
          setIsLoaded(false)

          // Fetch data directly from the external URL
          const data = await fetchConfig(force)

          if (data && data.events) {
            // Only store in module-level cache if in admin mode
            if (isAdmin) {
              cachedConfig = {
                events: data.events || [],
                tips: data.tips || [],
              }
            }

            setEvents(data.events || [])
            setTips(data.tips || [])
            // Configuration loaded
            resolve(data)
          } else {
            // Using initial config as fallback
            // Only cache if in admin mode
            if (isAdmin) {
              cachedConfig = {
                events: initialConfig.events,
                tips: initialConfig.tips,
              }
            }

            setEvents(initialConfig.events)
            setTips(initialConfig.tips)
            resolve(initialConfig)
          }

          setError(null)
        } catch (error) {
          // Error fetching configuration
          //setError(error instanceof Error ? error : new Error(String(error)))

          // Use initial config as fallback and cache it only if in admin mode
          if (isAdmin) {
            cachedConfig = {
              events: initialConfig.events,
              tips: initialConfig.tips,
            }
          }

          setEvents(initialConfig.events)
          setTips(initialConfig.tips)
          reject(error)
        } finally {
          setIsLoaded(true)
          isFetching = false
          loadPromise = null
        }
      })

      return loadPromise
    },
    [isAdmin],
  )

  // Load data on mount - always load data, but only cache if in admin mode
  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  return {
    events,
    tips,
    isLoaded,
    error,
    reload: (force = false) => loadConfig(force), // Expose reload function
  }
}

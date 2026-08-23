/**
 * Storage Initializer Component
 *
 * This component initializes the events and tips data from the configuration
 * when the application loads. It's used in the app layout to ensure data is
 * loaded before rendering the UI.
 */
"use client"

import { useEffect } from "react"
import { useEvents } from "@/hooks/use-events"
import { useTips } from "@/hooks/use-tips"
import { useAdminState } from "@/hooks/use-admin-state"

export function StorageInitializer() {
  const initializeEvents = useEvents((state) => state.initializeFromConfig)
  const eventsHydrated = useEvents((state) => state.hydrated)
  const initializeTips = useTips((state) => state.initializeFromConfig)
  const tipsHydrated = useTips((state) => state.hydrated)
  const { adminMode } = useAdminState()

  useEffect(() => {
    // In admin mode, ensure local storage has data for the current tag
    if (!adminMode || !eventsHydrated) return

    initializeEvents().catch(() => undefined)
  }, [adminMode, eventsHydrated, initializeEvents])

  useEffect(() => {
    if (!adminMode || !tipsHydrated) return
    initializeTips().catch(() => undefined)
  }, [adminMode, tipsHydrated, initializeTips])

  return null
}

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
  const initializeTips = useTips((state) => state.initializeFromConfig)
  const { isAdmin } = useAdminState()

  useEffect(() => {
    // In admin mode, ensure local storage has data for the current tag
    if (!isAdmin) return

    initializeEvents().catch(() => undefined)
    initializeTips().catch(() => undefined)
  }, [isAdmin, initializeEvents, initializeTips])

  return null
}

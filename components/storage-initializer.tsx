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
    // Only initialize data if in admin mode
    if (isAdmin) {
      // Initialize data from configuration
      const initialize = async () => {
        try {
          await Promise.all([initializeEvents(), initializeTips()])
        } catch (error) {
          // Error initializing storage
        }
      }

      initialize()
    }
  }, [initializeEvents, initializeTips, isAdmin])

  // This component doesn't render anything
  return null
}

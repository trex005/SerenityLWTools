"use client"

import { createContext, useContext, useMemo, useState, useCallback, type ReactNode } from "react"
import { useConfigData } from "@/hooks/use-config-data"
import { getTipIdFromLocation } from "@/lib/hash-navigation"
import { useAdminState } from "@/hooks/use-admin-state"

type DataType = "events" | "tips"
type TagDataValue = ReturnType<typeof useConfigData> & { ensureAllData: () => void }

const TagDataContext = createContext<TagDataValue | null>(null)

export function TagDataProvider({ children }: { children: ReactNode }) {
  const { adminMode } = useAdminState()
  const tipDeepLink = typeof window !== "undefined" && getTipIdFromLocation()
  const [requestedTypes, setRequestedTypes] = useState<DataType[] | undefined>(() => {
    if (adminMode) return undefined
    return tipDeepLink ? ["tips"] : undefined
  })

  const ensureAllData = useCallback(() => {
    if (adminMode) return
    setRequestedTypes((current) => {
      if (!current) return current
      const hasEvents = current.includes("events")
      const hasTips = current.includes("tips")
      if (hasEvents && hasTips) return current
      return ["events", "tips"]
    })
  }, [adminMode])

  const data = useConfigData({ dataTypes: requestedTypes })
  const value = useMemo(
    () => ({
      tag: data.tag,
      events: data.events,
      tips: data.tips,
      tagConfig: data.tagConfig,
      brand: data.brand,
      brandLabel: data.brandLabel,
      isLoaded: data.isLoaded,
      error: data.error,
      reload: data.reload,
      ensureAllData,
    }),
    [
      data.tag,
      data.events,
      data.tips,
      data.tagConfig,
      data.brand,
      data.brandLabel,
      data.isLoaded,
      data.error,
      data.reload,
      ensureAllData,
    ],
  )

  return <TagDataContext.Provider value={value}>{children}</TagDataContext.Provider>
}

export const useTagData = (): TagDataValue => {
  const context = useContext(TagDataContext)
  if (!context) {
    throw new Error("useTagData must be used within a TagDataProvider")
  }
  return context
}

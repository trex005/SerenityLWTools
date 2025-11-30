"use client"

import { createContext, useContext, useMemo, type ReactNode } from "react"
import { useConfigData } from "@/hooks/use-config-data"

type TagDataValue = ReturnType<typeof useConfigData>

const TagDataContext = createContext<TagDataValue | null>(null)

export function TagDataProvider({ children }: { children: ReactNode }) {
  const data = useConfigData()
  const value = useMemo(
    () => ({
      tag: data.tag,
      events: data.events,
      tips: data.tips,
      isLoaded: data.isLoaded,
      error: data.error,
      reload: data.reload,
    }),
    [data.tag, data.events, data.tips, data.isLoaded, data.error, data.reload],
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

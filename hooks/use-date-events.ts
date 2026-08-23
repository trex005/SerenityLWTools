"use client"

import { useMemo } from "react"
import { useEvents, type Event } from "./use-events"
import { mergeStoredEventOperations } from "@/lib/date-scoped-config"
import { composeEventsForDate } from "@/lib/serenity-engine/composition"
import { createEmptyStoredEventOperations } from "@/lib/local-event-operations"
import type { ConfigurationLayer } from "@/lib/serenity-engine/composition"

export const useEffectiveEventLayers = (): { layers: ConfigurationLayer[]; localTag: string } => {
  const layers = useEvents((state) => state.layers)
  const activeTag = useEvents((state) => state.activeTag)
  const operations = useEvents((state) => state.eventOperations)
  const localOperationsEnabled = useEvents((state) => state.localOperationsEnabled)
  return useMemo(() => {
    const stored = localOperationsEnabled ? operations : createEmptyStoredEventOperations()
    return {
      localTag: activeTag,
      layers: layers.map((layer, index) => index === layers.length - 1
        ? { ...layer, eventOperations: mergeStoredEventOperations(layer.eventOperations!, stored) }
        : layer),
    }
  }, [activeTag, layers, localOperationsEnabled, operations])
}

export const useDateEvents = (dateKey: string): Event[] => {
  const effective = useEffectiveEventLayers()
  const fallback = useEvents((state) => state.events)

  return useMemo(() => {
    if (!effective.layers.length) return fallback
    return composeEventsForDate({ layers: effective.layers, localTag: effective.localTag, date: dateKey }).events as unknown as Event[]
  }, [dateKey, effective, fallback])
}

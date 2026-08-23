"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { clearConfigCache, primeTagStorageSuffixes } from "@/lib/config-fetcher"
import { loadDateScopedConfiguration, mergeStoredEventOperations } from "@/lib/date-scoped-config"
import { composeEventsForDate, type ConfigurationLayer } from "@/lib/serenity-engine/composition"
import { getAppTodayKey } from "@/lib/date-utils"
import {
  createEmptyStoredEventOperations,
  discardStoredInheritedOperation,
  resetInheritedEventOperation,
  storeEventDeletion,
  storeInheritedEdit,
  storeOwnedEvent,
} from "@/lib/local-event-operations"
import { scopedPersistStorage } from "@/lib/scoped-storage"
import type { StoredEventOperations } from "@/lib/scoped-storage"
import { getActiveTag, onTagChange } from "@/lib/config-tag"
import { matchesSearchTokens, tokenizeSearchTerm } from "@/lib/search-utils"
import { useAdminStore } from "@/hooks/use-admin-state"
import { isAdminModeEnabledForTag } from "@/lib/scoped-storage"

export interface Event {
  id: string
  title: string
  days: string[]
  startTime: string
  endTime: string
  archived?: boolean
  isAllDay?: boolean
  order_value?: number
  order?: Record<string, number>
  dateOverrides?: Record<string, Partial<Event> & { hidden?: boolean }>
  dateIncludeOverrides?: Record<string, boolean>
  description?: string
  color?: string
  remindTomorrow?: boolean
  remindEndOfDay?: boolean
  includeInBriefing?: boolean
  includeOnWebsite?: boolean
  recurrence?: {
    type: "days" | "weeks" | "none"
    startTag: string
    startOffset: number
    endOffset?: number
    onPeriods: number
    offPeriods: number
    daysOfWeek: string[]
  }
  variations?: Record<string, {
    startTime?: string
    endTime?: string
    description?: string
    isAllDay?: boolean
    hidden?: boolean
  }>
}

interface EventsState {
  activeTag: string
  events: Event[]
  baseEvents: Event[]
  baseEventsMap: Record<string, Event>
  lowerEventsMap: Record<string, Event>
  sourceTagById: Record<string, string>
  publishedLocalOwnedIds: string[]
  eventOperations: StoredEventOperations
  localOperationsEnabled: boolean
  layers: ConfigurationLayer[]
  initialized: boolean
  hydrated: boolean
  searchTerm: string
  filteredEvents: Event[]
  setSearchTerm: (term: string) => void
  setEvents: (events: Event[], options?: { fromBase?: boolean }) => void
  addEvent: (event: Event) => void
  updateEvent: (event: Event, contextDate?: string) => void
  deleteEvent: (id: string, contextDate?: string) => void
  initializeFromConfig: (forceRefresh?: boolean) => Promise<void>
  archiveEvent: (id: string, contextDate?: string) => void
  restoreEvent: (id: string, contextDate?: string) => void
  updateEventOrderValue: (id: string, orderValue: number, contextDate?: string) => void
  clearEvents: () => void
  deleteAllEvents: () => void
  resetToDefaults: () => void
  resetEventOverrides: (eventId: string, contextDate?: string) => Promise<boolean>
  discardStoredInheritedOperation: (eventId: string) => void
  updateDateOverride: (eventId: string, date: string, override: Partial<Event> | null) => void
  updateDateIncludeOverride: (eventId: string, date: string, include: boolean | null) => void
}

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value))
const idMap = (events: Event[]): Record<string, Event> => Object.fromEntries(events.map((event) => [event.id, event]))
const applySearchFilter = (events: Event[], term: string): Event[] => {
  const tokens = tokenizeSearchTerm(term)
  return tokens.length ? events.filter((event) => matchesSearchTokens(tokens, [event.title, event.description])) : events
}

const composeWithStored = (state: EventsState, operations: StoredEventOperations, date: string) => {
  if (!state.layers.length) return null
  const effectiveOperations = state.localOperationsEnabled ? operations : createEmptyStoredEventOperations()
  const layers = state.layers.map((layer, index) => index === state.layers.length - 1
    ? { ...layer, eventOperations: mergeStoredEventOperations(layer.eventOperations!, effectiveOperations) }
    : layer)
  const composed = composeEventsForDate({ layers, localTag: state.activeTag, date })
  const lowerLayers = layers.map((layer, index) => index === layers.length - 1
    ? { ...layer, eventOperations: { ownedEventsById: {}, inheritedOverridesById: {}, inheritedDeletedIds: [] } }
    : layer)
  const lower = composeEventsForDate({ layers: lowerLayers, localTag: state.activeTag, date })
  return {
    events: composed.events as unknown as Event[],
    lowerEventsMap: idMap(lower.events as unknown as Event[]),
    sourceTagById: composed.sourceTagById,
  }
}

const stateForOperations = (state: EventsState, operations: StoredEventOperations, date = getAppTodayKey()) => {
  const result = composeWithStored(state, operations, date)
  if (!result) return { eventOperations: operations }
  return {
    eventOperations: operations,
    events: result.events,
    filteredEvents: applySearchFilter(result.events, state.searchTerm),
    lowerEventsMap: result.lowerEventsMap,
    sourceTagById: result.sourceTagById,
  }
}

export const useEvents = create<EventsState>()(
  persist(
    (set, get) => ({
      activeTag: getActiveTag(),
      events: [],
      baseEvents: [],
      baseEventsMap: {},
      lowerEventsMap: {},
      sourceTagById: {},
      publishedLocalOwnedIds: [],
      eventOperations: createEmptyStoredEventOperations(),
      localOperationsEnabled: false,
      layers: [],
      initialized: false,
      hydrated: false,
      searchTerm: "",
      filteredEvents: [],

      setSearchTerm: (term) => set((state) => ({
        searchTerm: term,
        filteredEvents: applySearchFilter(state.events, term),
      })),

      setEvents: (events, options) => set((state) => {
        if (options?.fromBase) {
          return { baseEvents: events, baseEventsMap: idMap(events) }
        }
        let operations = createEmptyStoredEventOperations()
        for (const event of events) operations = storeOwnedEvent(operations, event)
        return stateForOperations(state, operations)
      }),

      addEvent: (event) => set((state) => stateForOperations(
        state,
        storeOwnedEvent(state.eventOperations, event),
      )),

      updateEvent: (event, contextDate = getAppTodayKey()) => set((state) => {
        const contextual = composeWithStored(state, state.eventOperations, contextDate)
        const locallyOwned = contextual?.sourceTagById[event.id] === state.activeTag
        const inheritedBaseline = contextual?.lowerEventsMap[event.id]
        const publishedLeaf = state.layers[state.layers.length - 1]?.eventOperations
        const publishedInherited = !!publishedLeaf && (
          Object.prototype.hasOwnProperty.call(publishedLeaf.inheritedOverridesById, event.id)
          || publishedLeaf.inheritedDeletedIds.includes(event.id)
        )
        const operations = locallyOwned
          ? storeOwnedEvent(state.eventOperations, event)
          : inheritedBaseline
            ? storeInheritedEdit(state.eventOperations, inheritedBaseline, event, { publishedInherited })
            : state.eventOperations
        return stateForOperations(state, operations)
      }),

      deleteEvent: (id, contextDate = getAppTodayKey()) => set((state) => {
        const contextual = composeWithStored(state, state.eventOperations, contextDate)
        const locallyOwned = contextual?.sourceTagById[id] === state.activeTag
        const operations = storeEventDeletion(state.eventOperations, id, {
          locallyOwned,
          publishedOwned: state.publishedLocalOwnedIds.includes(id),
        })
        return stateForOperations(state, operations)
      }),

      initializeFromConfig: async (forceRefresh = false) => {
        const state = get()
        if (!state.hydrated || (!forceRefresh && state.initialized)) return
        try {
          if (forceRefresh) clearConfigCache()
          const activeTag = getActiveTag()
          const localOperationsEnabled = useAdminStore.getState().adminMode || isAdminModeEnabledForTag(activeTag)
          const loaded = await loadDateScopedConfiguration(activeTag)
          const date = getAppTodayKey()
          const remote = loaded.composeForDate(date)
          const lower = loaded.composeLowerStackForDate(date)
          const publishedLeaf = loaded.layers[loaded.layers.length - 1].eventOperations!
          const initializedState: EventsState = {
            ...get(),
            activeTag,
            localOperationsEnabled,
            layers: loaded.layers,
            baseEvents: remote.events as unknown as Event[],
            baseEventsMap: idMap(remote.events as unknown as Event[]),
            lowerEventsMap: idMap(lower.events as unknown as Event[]),
            sourceTagById: remote.sourceTagById,
            publishedLocalOwnedIds: Object.keys(publishedLeaf.ownedEventsById),
            initialized: true,
          }
          const composed = composeWithStored(initializedState, get().eventOperations, date)!
          set({
            activeTag,
            localOperationsEnabled,
            layers: loaded.layers,
            baseEvents: initializedState.baseEvents,
            baseEventsMap: initializedState.baseEventsMap,
            lowerEventsMap: composed.lowerEventsMap,
            sourceTagById: composed.sourceTagById,
            publishedLocalOwnedIds: initializedState.publishedLocalOwnedIds,
            events: composed.events,
            filteredEvents: applySearchFilter(composed.events, get().searchTerm),
            initialized: true,
          })
        } catch (error) {
          console.error("Error initializing date-scoped events:", error)
          set({ initialized: true })
        }
      },

      archiveEvent: (id, contextDate) => {
        const date = contextDate || getAppTodayKey()
        const contextual = composeWithStored(get(), get().eventOperations, date)
        const event = contextual?.events.find((candidate) => candidate.id === id)
        if (event) get().updateEvent({ ...event, archived: true }, contextDate)
      },
      restoreEvent: (id, contextDate) => {
        const date = contextDate || getAppTodayKey()
        const contextual = composeWithStored(get(), get().eventOperations, date)
        const event = contextual?.events.find((candidate) => candidate.id === id)
        if (event) get().updateEvent({ ...event, archived: false }, contextDate)
      },
      updateEventOrderValue: (id, orderValue, contextDate) => {
        const event = get().events.find((candidate) => candidate.id === id)
        if (event) get().updateEvent({ ...event, order_value: orderValue }, contextDate)
      },
      updateDateOverride: (id, date, override) => {
        const event = get().events.find((candidate) => candidate.id === id)
        if (!event) return
        const dateOverrides = { ...(event.dateOverrides || {}) }
        if (override === null) delete dateOverrides[date]
        else dateOverrides[date] = { ...(dateOverrides[date] || {}), ...override }
        get().updateEvent({ ...event, dateOverrides }, date)
      },
      updateDateIncludeOverride: (id, date, include) => {
        const event = get().events.find((candidate) => candidate.id === id)
        if (!event) return
        const dateIncludeOverrides = { ...(event.dateIncludeOverrides || {}) }
        if (include === null) delete dateIncludeOverrides[date]
        else dateIncludeOverrides[date] = include
        get().updateEvent({ ...event, dateIncludeOverrides }, date)
      },
      resetEventOverrides: async (id, contextDate = getAppTodayKey()) => {
        const before = get().eventOperations
        const publishedLeaf = get().layers[get().layers.length - 1]?.eventOperations
        const publishedInherited = !!publishedLeaf && (
          Object.prototype.hasOwnProperty.call(publishedLeaf.inheritedOverridesById, id)
          || publishedLeaf.inheritedDeletedIds.includes(id)
        )
        const operations = resetInheritedEventOperation(before, id, { publishedInherited })
        const changed = JSON.stringify(before) !== JSON.stringify(operations)
        if (changed) set((state) => stateForOperations(state, operations))
        return changed
      },
      discardStoredInheritedOperation: (id) => set((state) => stateForOperations(
        state,
        discardStoredInheritedOperation(state.eventOperations, id),
      )),
      clearEvents: () => set({ events: [], filteredEvents: [] }),
      deleteAllEvents: () => set((state) => stateForOperations(state, createEmptyStoredEventOperations())),
      resetToDefaults: () => {
        set({
          eventOperations: createEmptyStoredEventOperations(),
          events: [],
          filteredEvents: [],
          initialized: false,
        })
        setTimeout(() => get().initializeFromConfig(true), 0)
      },
    }),
    {
      name: "events",
      storage: scopedPersistStorage,
      skipHydration: true,
      partialize: (state) => ({ eventOperations: state.eventOperations }),
      version: 2,
      migrate: (persisted: any, version) => version === 2 && persisted?.eventOperations
        ? persisted
        : { eventOperations: createEmptyStoredEventOperations() },
      onRehydrateStorage: () => () => {
        useEvents.setState({ hydrated: true })
        useEvents.getState().initializeFromConfig(false).catch(console.error)
      },
    },
  ),
)

const triggerEventsRehydrate = () => {
  const hydration = useEvents.persist?.rehydrate?.()
  if (hydration && typeof (hydration as Promise<void>).then === "function") {
    ;(hydration as Promise<void>).catch(() => undefined)
  }
}

onTagChange((activeTag) => {
  useEvents.setState({
    activeTag,
    events: [],
    baseEvents: [],
    baseEventsMap: {},
    lowerEventsMap: {},
    sourceTagById: {},
    publishedLocalOwnedIds: [],
    eventOperations: createEmptyStoredEventOperations(),
    localOperationsEnabled: false,
    layers: [],
    initialized: false,
    hydrated: false,
  })
  primeTagStorageSuffixes(activeTag).catch(() => undefined).finally(triggerEventsRehydrate)
})

export const refreshEventsStore = async (forceRefresh = true) => useEvents.getState().initializeFromConfig(forceRefresh)
export const invalidateAndRefreshEvents = async () => {
  clearConfigCache()
  await refreshEventsStore(true)
}

if (typeof window !== "undefined") {
  primeTagStorageSuffixes().catch(() => undefined).finally(triggerEventsRehydrate)
  useAdminStore.subscribe((state, previous) => {
    if (state.adminMode !== previous.adminMode) refreshEventsStore(true).catch(console.error)
  })
}

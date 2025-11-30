/**
 * Events Store Hook
 *
 * This hook provides a global store for managing events data.
 * It uses Zustand for state management with persistence to local storage.
 */
"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { fetchConfig } from "@/lib/config-fetcher"
import { fetchParentEvent } from "@/lib/config-diff"
import { scopedStateStorage } from "@/lib/scoped-storage"
import { getActiveTag, onTagChange } from "@/lib/config-tag"
import { matchesSearchTokens, tokenizeSearchTerm } from "@/lib/search-utils"
import { useAdminStore } from "@/hooks/use-admin-state"
import {
  buildIdMap,
  composeWithOverrides,
  deriveOverridesFromFinal,
  upsertOverrideMap,
  ensureIdAdded,
  ensureIdRemoved,
} from "@/lib/override-helpers"

// Define the event interface
interface Event {
  id: string
  title: string
  days: string[]
  startTime: string
  endTime: string
  description?: string
  color?: string
  remindTomorrow?: boolean
  remindEndOfDay?: boolean
  includeInBriefing?: boolean
  includeOnWebsite?: boolean
  recurrence?: {
    pattern: "daily" | "weekly" | "monthly" | "yearly"
    interval: number
    endDate?: string
    count?: number
  }
  variations?: Record<
    string,
    {
      startTime?: string
      endTime?: string
      description?: string
    }
  >
}

// Define the events store state
interface EventsState {
  activeTag: string
  events: Event[]
  baseEvents: Event[]
  baseEventsMap: Record<string, Event>
  overridesById: Record<string, Event>
  deletedEventIds: string[]
  legacyEvents: Event[] | null
  initialized: boolean
  hydrated: boolean
  searchTerm: string
  filteredEvents: Event[]
  setSearchTerm: (term: string) => void
  setEvents: (events: Event[], options?: { fromBase?: boolean }) => void
  addEvent: (event: Event) => void
  updateEvent: (event: Event) => void
  deleteEvent: (id: string) => void
  initializeFromConfig: (forceRefresh?: boolean) => Promise<void>
  archiveEvent: (id: string) => void // Archive an event by ID
  restoreEvent: (id: string) => void // Restore an event from archive by ID
  reorderEvents: (events: Event[], day: string) => void // Reorder events for a specific day
  clearEvents: () => void // Clear all events
  deleteAllEvents: () => void // Delete all events without reinitialization
  resetToDefaults: () => void // Reset to default data
  resetEventOverrides: (eventId: string) => Promise<boolean> // Reset overrides by reverting to parent data
  updateDateOverride: (eventId: string, date: string, override: Partial<Event> | null) => void // Add or update a date override
  updateDateIncludeOverride: (eventId: string, date: string, include: boolean | null) => void // Add or update a date include override
}

/**
 * Helper function to normalize day names to lowercase
 * This ensures consistency in day references throughout the application
 */
const normalizeDayName = (day: string): string => {
  return day.toLowerCase()
}

const applySearchFilter = (events: Event[], term: string): Event[] => {
  const tokens = tokenizeSearchTerm(term)
  if (tokens.length === 0) return events

  return events.filter((event) => matchesSearchTokens(tokens, [event.title, event.description]))
}

// Create the events store with persistence
export const useEvents = create<EventsState>()(
  persist(
    (set, get) => ({
      activeTag: getActiveTag(),
      events: [],
      baseEvents: [],
      baseEventsMap: {},
      overridesById: {},
      deletedEventIds: [],
      legacyEvents: null,
      initialized: false,
      hydrated: false,
      searchTerm: "",
      filteredEvents: [],

      // Set search term and filter events
      setSearchTerm: (term: string) => {
        set((state) => ({
          searchTerm: term,
          filteredEvents: applySearchFilter(state.events, term),
        }))
      },

      // Set all events, optionally treating them as the new base data
      setEvents: (events: Event[], options?: { fromBase?: boolean }) => {
        set((state) => {
          if (options?.fromBase) {
            const baseMap = buildIdMap(events)
            let overrides = state.overridesById
            let deletedIds = state.deletedEventIds
            if (state.legacyEvents && state.legacyEvents.length > 0) {
              const reconciled = deriveOverridesFromFinal(state.legacyEvents, baseMap)
              overrides = reconciled.overridesById
              deletedIds = reconciled.deletedIds
            }
            const composed = composeWithOverrides(events, overrides, deletedIds)
            return {
              baseEvents: events,
              baseEventsMap: baseMap,
              overridesById: overrides,
              deletedEventIds: deletedIds,
              legacyEvents: null,
              events: composed,
              filteredEvents: applySearchFilter(composed, state.searchTerm),
            }
          }

          const overrideState = deriveOverridesFromFinal(events, state.baseEventsMap)
          return {
            events,
            filteredEvents: applySearchFilter(events, state.searchTerm),
            overridesById: overrideState.overridesById,
            deletedEventIds: overrideState.deletedIds,
            legacyEvents: null,
          }
        })
      },

      // Add a new event
      addEvent: (event: Event) => {
        set((state) => {
          const newEvents = [...state.events, event]
          const filtered = applySearchFilter(newEvents, state.searchTerm)
          const overridesById = upsertOverrideMap(state.baseEventsMap, state.overridesById, [event])
          const deletedEventIds = ensureIdRemoved(state.deletedEventIds, event.id)

          return {
            events: newEvents,
            filteredEvents: filtered,
            overridesById,
            deletedEventIds,
          }
        })
      },

      // Update an existing event
      updateEvent: (updatedEvent: Event) => {
        set((state) => {
          const updatedEvents = state.events.map((event) => (event.id === updatedEvent.id ? updatedEvent : event))
          const filtered = applySearchFilter(updatedEvents, state.searchTerm)
          const overridesById = upsertOverrideMap(state.baseEventsMap, state.overridesById, [updatedEvent])
          const deletedEventIds = ensureIdRemoved(state.deletedEventIds, updatedEvent.id)

          return {
            events: updatedEvents,
            filteredEvents: filtered,
            overridesById,
            deletedEventIds,
          }
        })
      },

      // Delete an event
      deleteEvent: (id: string) => {
        set((state) => {
          const updatedEvents = state.events.filter((event) => event.id !== id)
          const filtered = applySearchFilter(updatedEvents, state.searchTerm)
          const overridesById = { ...state.overridesById }
          delete overridesById[id]
          const deletedEventIds = state.baseEventsMap[id]
            ? ensureIdAdded(state.deletedEventIds, id)
            : ensureIdRemoved(state.deletedEventIds, id)

          return {
            events: updatedEvents,
            filteredEvents: filtered,
            overridesById,
            deletedEventIds,
          }
        })
      },

      // Initialize events from configuration if not already initialized
      initializeFromConfig: async (forceRefresh = false) => {
        const { initialized, baseEvents, activeTag } = get()
        if (!forceRefresh && initialized && baseEvents.length > 0 && !get().legacyEvents?.length) {
          return
        }

        try {
          const includeAncestorLocalOverrides = useAdminStore.getState().isAdmin
          const config = await fetchConfig(forceRefresh, {
            includeAncestorLocalOverrides,
          })
          const resolvedEvents = Array.isArray(config?.events) ? config.events : []
          const resolvedTag = config?.tag || getActiveTag()
          const baseMap = buildIdMap(resolvedEvents)

          set((state) => {
            let overrides = state.overridesById
            let deletedIds = state.deletedEventIds
            if (state.legacyEvents && state.legacyEvents.length > 0) {
              const reconciled = deriveOverridesFromFinal(state.legacyEvents, baseMap)
              overrides = reconciled.overridesById
              deletedIds = reconciled.deletedIds
            }
            const composed = composeWithOverrides(resolvedEvents, overrides, deletedIds)

            return {
              activeTag: resolvedTag,
              baseEvents: resolvedEvents,
              baseEventsMap: baseMap,
              overridesById: overrides,
              deletedEventIds: deletedIds,
              legacyEvents: null,
              events: composed,
              filteredEvents: applySearchFilter(composed, state.searchTerm),
              initialized: true,
            }
          })
        } catch (error) {
          console.error("Error initializing events:", error)
          set({ initialized: true, activeTag })
        }
      },

      // Add the archive and restore functions to the store
      archiveEvent: (id) => {
        const target = get().events.find((event) => event.id === id)
        if (!target) return
        get().updateEvent({ ...target, archived: true })
      },

      restoreEvent: (id) => {
        const target = get().events.find((event) => event.id === id)
        if (!target) return
        get().updateEvent({ ...target, archived: false })
      },

      /**
       * Reorder events for a specific day
       * Updates the order property for each event
       */
      reorderEvents: (updatedEvents, day) => {
        set((state) => {
          // Create a map of event IDs to their new order values
          const orderMap: Record<string, number> = {}
          updatedEvents.forEach((event, index) => {
            orderMap[event.id] = index
          })

          const changedEvents: Event[] = []
          const newEvents = state.events.map((event) => {
            if (orderMap[event.id] === undefined) return event
            const nextOrder = { ...(event.order || {}) }
            nextOrder[day] = orderMap[event.id]
            const updatedEvent = { ...event, order: nextOrder }
            changedEvents.push(updatedEvent)
            return updatedEvent
          })

          const filtered = applySearchFilter(newEvents, state.searchTerm)
          const overridesById = upsertOverrideMap(state.baseEventsMap, state.overridesById, changedEvents)
          const affectedIds = new Set(changedEvents.map((event) => event.id))
          const deletedEventIds = state.deletedEventIds.filter((id) => !affectedIds.has(id))

          return {
            events: newEvents,
            filteredEvents: filtered,
            overridesById,
            deletedEventIds,
          }
        })
      },

      /**
       * Add or update a date-specific override for an event
       * If override is null, remove the override for that date
       */
      updateDateOverride: (eventId, date, override) => {
        set((state) => {
          let changedEvent: Event | null = null
          const updatedEvents = state.events.map((event) => {
            if (event.id !== eventId) return event
            const dateOverrides = { ...(event.dateOverrides || {}) }

            if (override === null) {
              delete dateOverrides[date]
            } else {
              dateOverrides[date] = {
                ...dateOverrides[date],
                ...override,
              }
            }

            changedEvent = {
              ...event,
              dateOverrides,
            }
            return changedEvent
          })

          const filtered = applySearchFilter(updatedEvents, state.searchTerm)
          const overridesById = changedEvent
            ? upsertOverrideMap(state.baseEventsMap, state.overridesById, [changedEvent])
            : state.overridesById
          const deletedEventIds = changedEvent
            ? ensureIdRemoved(state.deletedEventIds, changedEvent.id)
            : state.deletedEventIds

          return {
            events: updatedEvents,
            filteredEvents: filtered,
            overridesById,
            deletedEventIds,
          }
        })
      },

      /**
       * Add or update a date-specific override for event scheduling
       * If include is null, remove the override for that date
       */
      updateDateIncludeOverride: (eventId, date: string, include: boolean | null) => {
        set((state) => {
          let changedEvent: Event | null = null
          const updatedEvents = state.events.map((event) => {
            if (event.id !== eventId) return event
            const dateIncludeOverrides = { ...(event.dateIncludeOverrides || {}) }

            if (include === null) {
              delete dateIncludeOverrides[date]
            } else {
              dateIncludeOverrides[date] = include
            }

            changedEvent = {
              ...event,
              dateIncludeOverrides,
            }
            return changedEvent
          })

          const filtered = applySearchFilter(updatedEvents, state.searchTerm)
          const overridesById = changedEvent
            ? upsertOverrideMap(state.baseEventsMap, state.overridesById, [changedEvent])
            : state.overridesById
          const deletedEventIds = changedEvent
            ? ensureIdRemoved(state.deletedEventIds, changedEvent.id)
            : state.deletedEventIds

          return {
            events: updatedEvents,
            filteredEvents: filtered,
            overridesById,
            deletedEventIds,
          }
        })
      },

      /**
       * Reset an event back to its parent data, removing local overrides for the current tag.
       * Returns true if a parent version was applied.
       */
      resetEventOverrides: async (eventId: string) => {
        try {
          const parent = await fetchParentEvent(get().activeTag, eventId)
          if (!parent) {
            return false
          }

          set((state) => {
            const parentEvent = parent as Event
            const updatedEvents = state.events.map((event) => (event.id === eventId ? parentEvent : event))
            const filtered = applySearchFilter(updatedEvents, state.searchTerm)
            const overridesById = upsertOverrideMap(state.baseEventsMap, state.overridesById, [parentEvent])
            const deletedEventIds = ensureIdRemoved(state.deletedEventIds, eventId)

            return {
              events: updatedEvents,
              filteredEvents: filtered,
              overridesById,
              deletedEventIds,
            }
          })

          return true
        } catch (error) {
          console.error("Failed to reset event overrides", error)
          return false
        }
      },

      /**
       * Clear all events from the store
       * This may trigger reinitialization from config if onRehydrateStorage runs
       */
      clearEvents: () => {
        set({
          events: [],
          filteredEvents: [],
        })
      },

      /**
       * Delete all events without triggering reinitialization
       * This explicitly keeps the initialized flag as true
       */
      deleteAllEvents: () => {
        set({
          events: [],
          filteredEvents: [],
          overridesById: {},
          deletedEventIds: [],
          baseEvents: [],
          baseEventsMap: {},
          legacyEvents: null,
          initialized: true,
        })
      },

      /**
       * Reset to default data from config
       */
      resetToDefaults: () => {
        set({
          events: [],
          filteredEvents: [],
          overridesById: {},
          deletedEventIds: [],
          baseEvents: [],
          baseEventsMap: {},
          legacyEvents: null,
          initialized: false,
        })
        setTimeout(() => {
          get().initializeFromConfig(true)
        }, 0)
      },
    }),
    {
      name: "daily-agenda-events",
      storage: scopedStateStorage,
      partialize: (state) => ({
        overridesById: state.overridesById,
        deletedEventIds: state.deletedEventIds,
        legacyEvents: state.legacyEvents,
      }),
      version: 1,
      migrate: (persisted: any, version) => {
        if (!persisted) return { overridesById: {}, deletedEventIds: [], legacyEvents: null }
        if (version === 0) {
          const legacyEvents = Array.isArray(persisted?.events) ? persisted.events : null
          return {
            overridesById: persisted?.overridesById || {},
            deletedEventIds: persisted?.deletedEventIds || [],
            legacyEvents,
          }
        }
        return persisted
      },
      // Disable automatic rehydration initialization
      onRehydrateStorage: () => () => {
        // Mark store as hydrated after rehydration completes
        useEvents.setState({ hydrated: true })
      },
    },
  ),
)

onTagChange((nextTag) => {
  useEvents.setState({
    activeTag: nextTag,
    events: [],
    filteredEvents: [],
    baseEvents: [],
    baseEventsMap: {},
    overridesById: {},
    deletedEventIds: [],
    legacyEvents: null,
    initialized: false,
  })

  const scheduleInit = () => {
    setTimeout(() => {
      useEvents
        .getState()
        .initializeFromConfig(false)
        .catch((error) => {
          console.error("Failed to load events for tag", nextTag, error)
        })
    }, 0)
  }

  const hydrator = useEvents.persist?.rehydrate?.()
  if (hydrator && typeof (hydrator as Promise<void>).then === "function") {
    ;(hydrator as Promise<void>).finally(scheduleInit)
  } else {
    scheduleInit()
  }
})

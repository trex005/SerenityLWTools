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

// Define the event interface
interface Event {
  id: string
  title: string
  days: string[]
  startTime: string
  endTime: string
  description?: string
  color?: string
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
  events: Event[]
  initialized: boolean
  searchTerm: string
  filteredEvents: Event[]
  setSearchTerm: (term: string) => void
  setEvents: (events: Event[]) => void
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

// Create the events store with persistence
export const useEvents = create<EventsState>()(
  persist(
    (set, get) => ({
      events: [],
      initialized: false,
      searchTerm: "",
      filteredEvents: [],

      // Set search term and filter events
      setSearchTerm: (term: string) => {
        set((state) => {
          const lowerSearchTerm = term.toLowerCase()
          const filtered = term
            ? state.events.filter(
                (event) =>
                  event.title.toLowerCase().includes(lowerSearchTerm) ||
                  (event.description && event.description.toLowerCase().includes(lowerSearchTerm)),
              )
            : state.events

          return {
            searchTerm: term,
            filteredEvents: filtered,
          }
        })
      },

      // Set all events
      setEvents: (events: Event[]) => {
        set((state) => {
          const lowerSearchTerm = state.searchTerm.toLowerCase()
          const filtered = state.searchTerm
            ? events.filter(
                (event) =>
                  event.title.toLowerCase().includes(lowerSearchTerm) ||
                  (event.description && event.description.toLowerCase().includes(lowerSearchTerm)),
              )
            : events

          return {
            events,
            filteredEvents: filtered,
          }
        })
      },

      // Add a new event
      addEvent: (event: Event) => {
        set((state) => {
          const newEvents = [...state.events, event]
          const lowerSearchTerm = state.searchTerm.toLowerCase()
          const filtered = state.searchTerm
            ? newEvents.filter(
                (event) =>
                  event.title.toLowerCase().includes(lowerSearchTerm) ||
                  (event.description && event.description.toLowerCase().includes(lowerSearchTerm)),
              )
            : newEvents

          return {
            events: newEvents,
            filteredEvents: filtered,
          }
        })
      },

      // Update an existing event
      updateEvent: (updatedEvent: Event) => {
        set((state) => {
          const updatedEvents = state.events.map((event) => (event.id === updatedEvent.id ? updatedEvent : event))

          const lowerSearchTerm = state.searchTerm.toLowerCase()
          const filtered = state.searchTerm
            ? updatedEvents.filter(
                (event) =>
                  event.title.toLowerCase().includes(lowerSearchTerm) ||
                  (event.description && event.description.toLowerCase().includes(lowerSearchTerm)),
              )
            : updatedEvents

          return {
            events: updatedEvents,
            filteredEvents: filtered,
          }
        })
      },

      // Delete an event
      deleteEvent: (id: string) => {
        set((state) => {
          const updatedEvents = state.events.filter((event) => event.id !== id)
          const lowerSearchTerm = state.searchTerm.toLowerCase()
          const filtered = state.searchTerm
            ? updatedEvents.filter(
                (event) =>
                  event.title.toLowerCase().includes(lowerSearchTerm) ||
                  (event.description && event.description.toLowerCase().includes(lowerSearchTerm)),
              )
            : updatedEvents

          return {
            events: updatedEvents,
            filteredEvents: filtered,
          }
        })
      },

      // Initialize events from configuration if not already initialized
      initializeFromConfig: async (forceRefresh = false) => {
        const { initialized, events } = get()

        // Skip if already initialized and we have events, unless forceRefresh is true
        if (initialized && events.length > 0 && !forceRefresh) {
          return
        }

        try {
          // Fetch configuration with forceRefresh flag
          const config = await fetchConfig(forceRefresh)

          if (config && config.events && Array.isArray(config.events)) {
            set({
              events: config.events,
              filteredEvents: config.events,
              initialized: true,
            })
          } else {
            // Mark as initialized even if no events were found
            set({ initialized: true })
          }
        } catch (error) {
          console.error("Error initializing events:", error)
          // Mark as initialized to prevent repeated attempts
          set({ initialized: true })
        }
      },

      // Add the archive and restore functions to the store
      archiveEvent: (id) => {
        set((state) => {
          const updatedEvents = state.events.map((event) => (event.id === id ? { ...event, archived: true } : event))

          const lowerSearchTerm = state.searchTerm.toLowerCase()
          const filtered = state.searchTerm
            ? updatedEvents.filter(
                (event) =>
                  event.title.toLowerCase().includes(lowerSearchTerm) ||
                  (event.description && event.description.toLowerCase().includes(lowerSearchTerm)),
              )
            : updatedEvents

          return {
            events: updatedEvents,
            filteredEvents: filtered,
          }
        })
      },

      restoreEvent: (id) => {
        set((state) => {
          const updatedEvents = state.events.map((event) => (event.id === id ? { ...event, archived: false } : event))

          const lowerSearchTerm = state.searchTerm.toLowerCase()
          const filtered = state.searchTerm
            ? updatedEvents.filter(
                (event) =>
                  event.title.toLowerCase().includes(lowerSearchTerm) ||
                  (event.description && event.description.toLowerCase().includes(lowerSearchTerm)),
              )
            : updatedEvents

          return {
            events: updatedEvents,
            filteredEvents: filtered,
          }
        })
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

          // Update the order property for each event in the original array
          const newEvents = state.events.map((event) => {
            if (orderMap[event.id] !== undefined) {
              return {
                ...event,
                order: {
                  ...event.order,
                  [day]: orderMap[event.id],
                },
              }
            }
            return event
          })

          const lowerSearchTerm = state.searchTerm.toLowerCase()
          const filtered = state.searchTerm
            ? newEvents.filter(
                (event) =>
                  event.title.toLowerCase().includes(lowerSearchTerm) ||
                  (event.description && event.description.toLowerCase().includes(lowerSearchTerm)),
              )
            : newEvents

          return {
            events: newEvents,
            filteredEvents: filtered,
          }
        })
      },

      /**
       * Add or update a date-specific override for an event
       * If override is null, remove the override for that date
       */
      updateDateOverride: (eventId, date, override) => {
        set((state) => {
          const updatedEvents = state.events.map((event) => {
            if (event.id === eventId) {
              const dateOverrides = { ...event.dateOverrides }

              if (override === null) {
                // Remove the override for this date
                delete dateOverrides[date]
              } else {
                // Add or update the override
                dateOverrides[date] = {
                  ...dateOverrides[date],
                  ...override,
                }
              }

              return {
                ...event,
                dateOverrides,
              }
            }
            return event
          })

          const lowerSearchTerm = state.searchTerm.toLowerCase()
          const filtered = state.searchTerm
            ? updatedEvents.filter(
                (event) =>
                  event.title.toLowerCase().includes(lowerSearchTerm) ||
                  (event.description && event.description.toLowerCase().includes(lowerSearchTerm)),
              )
            : updatedEvents

          return {
            events: updatedEvents,
            filteredEvents: filtered,
          }
        })
      },

      /**
       * Add or update a date-specific override for event scheduling
       * If include is null, remove the override for that date
       */
      updateDateIncludeOverride: (eventId, date: string, include: boolean | null) => {
        set((state) => {
          const updatedEvents = state.events.map((event) => {
            if (event.id === eventId) {
              const dateIncludeOverrides = { ...(event.dateIncludeOverrides || {}) }

              if (include === null) {
                // Remove the override for this date
                delete dateIncludeOverrides[date]
              } else {
                // Add or update the override
                dateIncludeOverrides[date] = include
              }

              return {
                ...event,
                dateIncludeOverrides,
              }
            }
            return event
          })

          const lowerSearchTerm = state.searchTerm.toLowerCase()
          const filtered = state.searchTerm
            ? updatedEvents.filter(
                (event) =>
                  event.title.toLowerCase().includes(lowerSearchTerm) ||
                  (event.description && event.description.toLowerCase().includes(lowerSearchTerm)),
              )
            : updatedEvents

          return {
            events: updatedEvents,
            filteredEvents: filtered,
          }
        })
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
          initialized: false,
        })
        setTimeout(() => {
          get().initializeFromConfig(true)
        }, 0)
      },
    }),
    {
      name: "daily-agenda-events",
      // Disable automatic rehydration initialization
      onRehydrateStorage: () => () => {
        // Do nothing - let the StorageInitializer handle initialization
      },
    },
  ),
)

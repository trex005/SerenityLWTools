/**
 * Tips Store Hook
 *
 * This hook provides a global store for managing tips data.
 * It uses Zustand for state management with persistence to local storage.
 */
"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { fetchConfig } from "@/lib/config-fetcher"
import { scopedStateStorage } from "@/lib/scoped-storage"
import { getActiveTag, onTagChange } from "@/lib/config-tag"

// Define the tip interface
export interface Tip {
  id: string
  title: string
  content: string
  category?: string
  tags?: string[]
  lastUsed?: string // ISO date string
  useCount?: number
  archived?: boolean
  customId?: string // Custom ID for the tip
  imageUrl?: string // URL for an image to display with the tip
  adminOnly?: boolean // Whether this tip is only visible to admins
  canUseInBriefing?: boolean // Whether this tip can be used in email briefings
  unlisted?: boolean // Whether this tip is unlisted (only accessible via direct link)
  isHtml?: boolean // Whether the content contains HTML formatting
  altText?: string // Alternative text for the entire tip content when copied
  type?: "text" | "html" | "image" | "embedded" // Type of content
  embedUrl?: string // URL for embedded content (when type is "embedded")
}

const applyTipSearch = (tips: Tip[], term: string): Tip[] => {
  const lowerSearchTerm = term.toLowerCase()
  return term
    ? tips.filter(
        (tip) =>
          tip.title.toLowerCase().includes(lowerSearchTerm) || tip.content.toLowerCase().includes(lowerSearchTerm),
      )
    : tips
}

const TIPS_STORAGE_KEY = "daily-agenda-tips"

const readStoredTips = (): { exists: boolean; tips: Tip[] } => {
  try {
    const raw = scopedStateStorage.getItem(TIPS_STORAGE_KEY)
    if (!raw) return { exists: false, tips: [] }
    const parsed = JSON.parse(raw)
    const stored = Array.isArray(parsed?.state?.tips) ? parsed.state.tips : []
    return { exists: true, tips: stored }
  } catch {
    return { exists: false, tips: [] }
  }
}

// Define the tips store state
interface TipsState {
  activeTag: string
  tips: Tip[]
  initialized: boolean
  hydrated: boolean
  searchTerm: string
  filteredTips: Tip[]
  setSearchTerm: (term: string) => void
  setTips: (tips: Tip[]) => void
  addTip: (tip: Tip) => void
  updateTip: (tip: Tip) => void
  deleteTip: (id: string) => void
  initializeFromConfig: (forceRefresh?: boolean) => Promise<void>
  markTipAsUsed: (id: string) => void
  archiveTip: (id: string) => void
  restoreTip: (id: string) => void
  clearTips: () => void
  deleteAllTips: () => void
  resetToDefaults: () => void
}

// Create the tips store with persistence
export const useTips = create<TipsState>()(
  persist(
    (set, get) => ({
      activeTag: getActiveTag(),
      tips: [],
      initialized: false,
      hydrated: false,
      searchTerm: "",
      filteredTips: [],

      // Set search term and filter tips
      setSearchTerm: (term: string) => {
        set((state) => ({
          searchTerm: term,
          filteredTips: applyTipSearch(state.tips, term),
        }))
      },

      // Set all tips
      setTips: (tips: Tip[]) => {
        set((state) => ({
          tips,
          filteredTips: applyTipSearch(tips, state.searchTerm),
        }))
      },

      // Add a new tip
      addTip: (tip: Tip) => {
        set((state) => {
          const newTips = [...state.tips, tip]
          const lowerSearchTerm = state.searchTerm.toLowerCase()
          const filtered = state.searchTerm
            ? newTips.filter(
                (tip) =>
                  tip.title.toLowerCase().includes(lowerSearchTerm) ||
                  tip.content.toLowerCase().includes(lowerSearchTerm),
              )
            : newTips

          return {
            tips: newTips,
            filteredTips: filtered,
          }
        })
      },

      // Update an existing tip
      updateTip: (updatedTip: Tip) => {
        set((state) => {
          const updatedTips = state.tips.map((tip) => (tip.id === updatedTip.id ? updatedTip : tip))

          const lowerSearchTerm = state.searchTerm.toLowerCase()
          const filtered = state.searchTerm
            ? updatedTips.filter(
                (tip) =>
                  tip.title.toLowerCase().includes(lowerSearchTerm) ||
                  tip.content.toLowerCase().includes(lowerSearchTerm),
              )
            : updatedTips

          return {
            tips: updatedTips,
            filteredTips: filtered,
          }
        })
      },

      // Delete a tip
      deleteTip: (id: string) => {
        set((state) => {
          const updatedTips = state.tips.filter((tip) => tip.id !== id)
          const lowerSearchTerm = state.searchTerm.toLowerCase()
          const filtered = state.searchTerm
            ? updatedTips.filter(
                (tip) =>
                  tip.title.toLowerCase().includes(lowerSearchTerm) ||
                  tip.content.toLowerCase().includes(lowerSearchTerm),
              )
            : updatedTips

          return {
            tips: updatedTips,
            filteredTips: filtered,
          }
        })
      },

      // Initialize tips from configuration if not already initialized
      initializeFromConfig: async (forceRefresh = false) => {
        const { initialized, tips, activeTag } = get()

        if (!forceRefresh) {
          const stored = readStoredTips()
          if (stored.exists) {
            get().setTips(stored.tips)
            set({ initialized: true, activeTag: getActiveTag() })
            return
          }

          if (initialized && tips.length > 0) {
            return
          }
        }

        try {
          // Fetch configuration with forceRefresh flag
          const config = await fetchConfig(forceRefresh)

          if (config && config.tips && Array.isArray(config.tips)) {
            get().setTips(config.tips)
            set({ initialized: true, activeTag: config.tag || getActiveTag() })
          } else {
            // Mark as initialized even if no tips were found
            set({ initialized: true, activeTag: config?.tag || activeTag })
          }
        } catch (error) {
          console.error("Error initializing tips:", error)
          // Mark as initialized to prevent repeated attempts
          set({ initialized: true, activeTag })
        }
      },

      // Mark a tip as used
      markTipAsUsed: (id: string) => {
        set((state) => {
          const updatedTips = state.tips.map((tip) => {
            if (tip.id === id) {
              return {
                ...tip,
                lastUsed: new Date().toISOString(),
                useCount: (tip.useCount || 0) + 1,
              }
            }
            return tip
          })

          const lowerSearchTerm = state.searchTerm.toLowerCase()
          const filtered = state.searchTerm
            ? updatedTips.filter(
                (tip) =>
                  tip.title.toLowerCase().includes(lowerSearchTerm) ||
                  tip.content.toLowerCase().includes(lowerSearchTerm),
              )
            : updatedTips

          return {
            tips: updatedTips,
            filteredTips: filtered,
          }
        })
      },

      // Archive a tip
      archiveTip: (id: string) => {
        set((state) => {
          const updatedTips = state.tips.map((tip) => {
            if (tip.id === id) {
              return { ...tip, archived: true }
            }
            return tip
          })

          const lowerSearchTerm = state.searchTerm.toLowerCase()
          const filtered = state.searchTerm
            ? updatedTips.filter(
                (tip) =>
                  tip.title.toLowerCase().includes(lowerSearchTerm) ||
                  tip.content.toLowerCase().includes(lowerSearchTerm),
              )
            : updatedTips

          return {
            tips: updatedTips,
            filteredTips: filtered,
          }
        })
      },

      // Restore a tip from archive
      restoreTip: (id: string) => {
        set((state) => {
          const updatedTips = state.tips.map((tip) => {
            if (tip.id === id) {
              return { ...tip, archived: false }
            }
            return tip
          })

          const lowerSearchTerm = state.searchTerm.toLowerCase()
          const filtered = state.searchTerm
            ? updatedTips.filter(
                (tip) =>
                  tip.title.toLowerCase().includes(lowerSearchTerm) ||
                  tip.content.toLowerCase().includes(lowerSearchTerm),
              )
            : updatedTips

          return {
            tips: updatedTips,
            filteredTips: filtered,
          }
        })
      },

      // Clear all tips
      clearTips: () => {
        set({
          tips: [],
          filteredTips: [],
        })
      },

      // Delete all tips without triggering reinitialization
      deleteAllTips: () => {
        set({
          tips: [],
          filteredTips: [],
          initialized: true,
        })
      },

      // Reset to default data from config
      resetToDefaults: () => {
        set({
          tips: [],
          filteredTips: [],
          initialized: false,
        })
        setTimeout(() => {
          get().initializeFromConfig(true)
        }, 0)
      },
    }),
    {
      name: "daily-agenda-tips",
      storage: scopedStateStorage,
      // Disable automatic rehydration initialization
      onRehydrateStorage: () => () => {
        useTips.setState({ hydrated: true })
      },
    },
  ),
)

onTagChange((nextTag) => {
  const stored = readStoredTips()

  if (stored.exists) {
    useTips.setState((state) => ({
      activeTag: nextTag,
      tips: stored.tips,
      filteredTips: applyTipSearch(stored.tips, state.searchTerm),
      initialized: true,
    }))
  } else {
    useTips.setState({
      activeTag: nextTag,
      tips: [],
      filteredTips: [],
      initialized: false,
    })

    setTimeout(() => {
      useTips
        .getState()
        .initializeFromConfig(false)
        .catch((error) => {
          console.error("Failed to load tips for tag", nextTag, error)
        })
    }, 0)
  }
})

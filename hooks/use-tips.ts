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
  const tokens = tokenizeSearchTerm(term)
  if (tokens.length === 0) return tips

  return tips.filter((tip) => matchesSearchTokens(tokens, [tip.title, tip.content, tip.customId]))
}

// Define the tips store state
interface TipsState {
  activeTag: string
  tips: Tip[]
  baseTips: Tip[]
  baseTipsMap: Record<string, Tip>
  overridesById: Record<string, Tip>
  deletedTipIds: string[]
  legacyTips: Tip[] | null
  initialized: boolean
  hydrated: boolean
  searchTerm: string
  filteredTips: Tip[]
  setSearchTerm: (term: string) => void
  setTips: (tips: Tip[], options?: { fromBase?: boolean }) => void
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
      baseTips: [],
      baseTipsMap: {},
      overridesById: {},
      deletedTipIds: [],
      legacyTips: null,
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
      setTips: (tips: Tip[], options?: { fromBase?: boolean }) => {
        set((state) => {
          if (options?.fromBase) {
            const baseMap = buildIdMap(tips)
            let overrides = state.overridesById
            let deletedIds = state.deletedTipIds
            if (state.legacyTips && state.legacyTips.length > 0) {
              const reconciled = deriveOverridesFromFinal(state.legacyTips, baseMap)
              overrides = reconciled.overridesById
              deletedIds = reconciled.deletedIds
            }
            const composed = composeWithOverrides(tips, overrides, deletedIds)
            return {
              baseTips: tips,
              baseTipsMap: baseMap,
              overridesById: overrides,
              deletedTipIds: deletedIds,
              legacyTips: null,
              tips: composed,
              filteredTips: applyTipSearch(composed, state.searchTerm),
            }
          }

          const overrideState = deriveOverridesFromFinal(tips, state.baseTipsMap)
          return {
            tips,
            filteredTips: applyTipSearch(tips, state.searchTerm),
            overridesById: overrideState.overridesById,
            deletedTipIds: overrideState.deletedIds,
            legacyTips: null,
          }
        })
      },

      // Add a new tip
      addTip: (tip: Tip) => {
        set((state) => {
          const newTips = [...state.tips, tip]
          const filtered = applyTipSearch(newTips, state.searchTerm)
          const overridesById = upsertOverrideMap(state.baseTipsMap, state.overridesById, [tip])
          const deletedTipIds = ensureIdRemoved(state.deletedTipIds, tip.id)

          return {
            tips: newTips,
            filteredTips: filtered,
            overridesById,
            deletedTipIds,
          }
        })
      },

      // Update an existing tip
      updateTip: (updatedTip: Tip) => {
        set((state) => {
          const updatedTips = state.tips.map((tip) => (tip.id === updatedTip.id ? updatedTip : tip))
          const filtered = applyTipSearch(updatedTips, state.searchTerm)
          const overridesById = upsertOverrideMap(state.baseTipsMap, state.overridesById, [updatedTip])
          const deletedTipIds = ensureIdRemoved(state.deletedTipIds, updatedTip.id)

          return {
            tips: updatedTips,
            filteredTips: filtered,
            overridesById,
            deletedTipIds,
          }
        })
      },

      // Delete a tip
      deleteTip: (id: string) => {
        set((state) => {
          const updatedTips = state.tips.filter((tip) => tip.id !== id)
          const filtered = applyTipSearch(updatedTips, state.searchTerm)
          const overridesById = { ...state.overridesById }
          delete overridesById[id]
          const deletedTipIds = state.baseTipsMap[id]
            ? ensureIdAdded(state.deletedTipIds, id)
            : ensureIdRemoved(state.deletedTipIds, id)

          return {
            tips: updatedTips,
            filteredTips: filtered,
            overridesById,
            deletedTipIds,
          }
        })
      },

      // Initialize tips from configuration if not already initialized
      initializeFromConfig: async (forceRefresh = false) => {
        const { initialized, baseTips, activeTag } = get()
        if (!forceRefresh && initialized && baseTips.length > 0 && !get().legacyTips?.length) {
          return
        }

        try {
          const includeAncestorLocalOverrides = useAdminStore.getState().isAdmin
          // Fetch configuration with forceRefresh flag
          const config = await fetchConfig(forceRefresh, {
            includeAncestorLocalOverrides,
          })

          const resolvedTips = Array.isArray(config?.tips) ? config.tips : []
          const resolvedTag = config?.tag || getActiveTag()
          const baseMap = buildIdMap(resolvedTips)

          set((state) => {
            let overrides = state.overridesById
            let deletedIds = state.deletedTipIds
            if (state.legacyTips && state.legacyTips.length > 0) {
              const reconciled = deriveOverridesFromFinal(state.legacyTips, baseMap)
              overrides = reconciled.overridesById
              deletedIds = reconciled.deletedIds
            }

            const composed = composeWithOverrides(resolvedTips, overrides, deletedIds)
            return {
              activeTag: resolvedTag,
              baseTips: resolvedTips,
              baseTipsMap: baseMap,
              overridesById: overrides,
              deletedTipIds: deletedIds,
              legacyTips: null,
              tips: composed,
              filteredTips: applyTipSearch(composed, state.searchTerm),
              initialized: true,
            }
          })
        } catch (error) {
          console.error("Error initializing tips:", error)
          // Mark as initialized to prevent repeated attempts
          set({ initialized: true, activeTag })
        }
      },

      // Mark a tip as used
      markTipAsUsed: (id: string) => {
        const target = get().tips.find((tip) => tip.id === id)
        if (!target) return
        get().updateTip({
          ...target,
          lastUsed: new Date().toISOString(),
          useCount: (target.useCount || 0) + 1,
        })
      },

      // Archive a tip
      archiveTip: (id: string) => {
        const target = get().tips.find((tip) => tip.id === id)
        if (!target) return
        get().updateTip({ ...target, archived: true })
      },

      // Restore a tip from archive
      restoreTip: (id: string) => {
        const target = get().tips.find((tip) => tip.id === id)
        if (!target) return
        get().updateTip({ ...target, archived: false })
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
          overridesById: {},
          deletedTipIds: [],
          baseTips: [],
          baseTipsMap: {},
          legacyTips: null,
          initialized: true,
        })
      },

      // Reset to default data from config
      resetToDefaults: () => {
        set({
          tips: [],
          filteredTips: [],
          overridesById: {},
          deletedTipIds: [],
          baseTips: [],
          baseTipsMap: {},
          legacyTips: null,
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
      partialize: (state) => ({
        overridesById: state.overridesById,
        deletedTipIds: state.deletedTipIds,
        legacyTips: state.legacyTips,
      }),
      version: 1,
      migrate: (persisted: any, version) => {
        if (!persisted) return { overridesById: {}, deletedTipIds: [], legacyTips: null }
        if (version === 0) {
          const legacyTips = Array.isArray(persisted?.tips) ? persisted.tips : null
          return {
            overridesById: persisted?.overridesById || {},
            deletedTipIds: persisted?.deletedTipIds || [],
            legacyTips,
          }
        }
        return persisted
      },
      // Disable automatic rehydration initialization
      onRehydrateStorage: () => () => {
        useTips.setState({ hydrated: true })
      },
    },
  ),
)

onTagChange((nextTag) => {
  useTips.setState({
    activeTag: nextTag,
    tips: [],
    filteredTips: [],
    baseTips: [],
    baseTipsMap: {},
    overridesById: {},
    deletedTipIds: [],
    legacyTips: null,
    initialized: false,
  })

  const scheduleInit = () => {
    setTimeout(() => {
      useTips
        .getState()
        .initializeFromConfig(false)
        .catch((error) => {
          console.error("Failed to load tips for tag", nextTag, error)
        })
    }, 0)
  }

  const hydrator = useTips.persist?.rehydrate?.()
  if (hydrator && typeof (hydrator as Promise<void>).then === "function") {
    ;(hydrator as Promise<void>).finally(scheduleInit)
  } else {
    scheduleInit()
  }
})

/**
 * Tips Management Component
 *
 * This component allows users to add, edit, and delete tips.
 * It's displayed in the Tips tab of the main interface.
 */
"use client"

import type React from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { useTips } from "@/hooks/use-tips"
import { Edit, Trash2, Plus, Search, Copy, Check, Link, ZoomIn, X, ChevronDown } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { v4 as uuidv4 } from "uuid"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { useDebounce } from "@/hooks/use-debounce"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent } from "@/components/ui/dialog"

// Add these imports at the top
import { sanitizeHtml, extractTextFromHtml, containsHtml, stripHtml } from "@/lib/html-utils"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { FileCode, FileText, ImageIcon, Video } from "lucide-react"

// Update the Tip interface to include isHtml and altText
interface Tip {
  id: string
  title: string
  content: string
  lastUsed: string | null
  customId?: string
  imageUrl?: string
  adminOnly?: boolean
  canUseInBriefing?: boolean
  unlisted?: boolean
  isHtml?: boolean
  altText?: string
}

/**
 * TipsManagement component
 * Provides a UI for managing tips - adding, editing, and deleting them
 */
export function TipsManagement({ forceRefresh }: { forceRefresh?: string }) {
  // Access tips store
  const { tips, addTip, updateTip, deleteTip } = useTips()

  // Update the newTip state to include isHtml and altText
  const [newTip, setNewTip] = useState({
    title: "",
    content: "",
    customId: "",
    imageUrl: "",
    adminOnly: false,
    canUseInBriefing: true,
    unlisted: false,
    isHtml: false,
    altText: "",
  })

  // State to show/hide the add tip form
  const [showAddForm, setShowAddForm] = useState(false)

  // State to track which tips are being edited
  const [editingTips, setEditingTips] = useState<Record<string, boolean>>({})

  // Update the editedContent state type to include isHtml and altText
  const [editedContent, setEditedContent] = useState<
    Record<
      string,
      {
        title: string
        content: string
        customId?: string
        imageUrl?: string
        adminOnly?: boolean
        canUseInBriefing?: boolean
        unlisted?: boolean
        isHtml?: boolean
        altText?: string
      }
    >
  >({})

  // State for delete confirmation dialog
  const [tipToDelete, setTipToDelete] = useState<string | null>(null)

  // State for search term
  const [searchTerm, setSearchTerm] = useState("")
  const debouncedSearchTerm = useDebounce(searchTerm, 300)

  // State to track recently copied tip for visual feedback
  const [copiedTipId, setCopiedTipId] = useState<string | null>(null)

  // Ref for the new tip textarea
  const newTipTextareaRef = useRef<HTMLTextAreaElement>(null)

  // State for filter options
  const [filterOption, setFilterOption] = useState<"all" | "used" | "unused">("all")

  // Add a state for tracking custom ID validation errors
  const [customIdError, setCustomIdError] = useState<string | null>(null)
  const [editCustomIdError, setEditCustomIdError] = useState<Record<string, string | null>>({})

  // State for full-screen image viewing
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null)

  // Add state for image dimensions
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })

  // Add a new state to track the tip that should be at the top
  const [topTipId, setTopTipId] = useState<string | null>(null)

  // Add state to track whether to show all tips or just the linked one
  const [showAllTips, setShowAllTips] = useState(false)

  // Add debug state to show search results
  const [debugInfo, setDebugInfo] = useState<string>("")

  // Add state for HTML preview
  const [showHtmlPreview, setShowHtmlPreview] = useState<Record<string, boolean>>({})

  // Add state for active tab in new tip form
  const [newTipActiveTab, setNewTipActiveTab] = useState<"edit" | "preview">("edit")

  // Add state for media insertion dialogs
  const [showMediaDialog, setShowMediaDialog] = useState(false)
  const [mediaDialogType, setMediaDialogType] = useState<"image" | "video">("image")
  const [mediaDialogTipId, setMediaDialogTipId] = useState<string | null>(null)
  const [mediaUrl, setMediaUrl] = useState("")
  const [mediaAltText, setMediaAltText] = useState("")
  const [mediaWidth, setMediaWidth] = useState("")
  const [mediaHeight, setMediaHeight] = useState("")

  // Add state for copied link ID
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)

  // Check for tip ID in URL hash and highlight it
  useEffect(() => {
    if (typeof window !== "undefined") {
      const hash = window.location.hash
      if (hash && hash.startsWith("#tip-")) {
        const tipId = hash.substring(5) // Remove '#tip-' prefix

        // Initially only show the linked tip
        setShowAllTips(false)

        // Find the tip by customId first, then by id
        const tipWithCustomId = tips.find((tip) => tip.customId === tipId)
        const tipWithId = tips.find((tip) => tip.id === tipId)

        // Set the top tip ID
        if (tipWithCustomId) {
          setTopTipId(tipWithCustomId.id)
        } else if (tipWithId) {
          setTopTipId(tipWithId.id)
        } else {
          setTopTipId(tipId)
        }

        // Find the tip element and scroll to it
        setTimeout(() => {
          // Try to find the element by ID first
          let tipElement = document.getElementById(`tip-${tipId}`)

          // If not found and we have a tip with custom ID, try the actual ID
          if (!tipElement && tipWithCustomId) {
            tipElement = document.getElementById(`tip-${tipWithCustomId.id}`)
          } else if (!tipElement && tipWithId) {
            tipElement = document.getElementById(`tip-${tipWithId.id}`)
          }

          if (tipElement) {
            tipElement.scrollIntoView({ behavior: "smooth", block: "start" })
            tipElement.classList.add("border-primary", "bg-primary/5")

            // Remove highlight after a few seconds
            setTimeout(() => {
              tipElement.classList.remove("border-primary", "bg-primary/5")
            }, 3000)
          }
        }, 500)
      } else {
        // If no hash, show all tips
        setShowAllTips(true)
      }
    }
  }, [forceRefresh, tips]) // Add tips as a dependency

  // Reset copied state after delay
  useEffect(() => {
    if (copiedTipId) {
      const timer = setTimeout(() => {
        setCopiedTipId(null)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [copiedTipId])

  // Focus the textarea when the add form is shown
  useEffect(() => {
    if (showAddForm && newTipTextareaRef.current) {
      newTipTextareaRef.current.focus()
    }
  }, [showAddForm])

  // Update debug info when search term changes
  useEffect(() => {
    if (debouncedSearchTerm) {
      const searchLower = debouncedSearchTerm.toLowerCase()
      const matchingTips = tips.filter((tip) => {
        const titleMatch = tip.title ? tip.title.toLowerCase().includes(searchLower) : false
        const contentMatch = tip.content ? tip.content.toLowerCase().includes(searchLower) : false
        const customIdMatch = tip.customId ? tip.customId.toLowerCase().includes(searchLower) : false

        return titleMatch || contentMatch || customIdMatch
      })

      setDebugInfo(`Search term: "${searchLower}" - Found ${matchingTips.length} matches`)
    } else {
      setDebugInfo("")
    }
  }, [debouncedSearchTerm, tips])

  // Update the filter function to show all tips to admins (including unlisted ones)
  const filteredTips = tips.filter((tip) => {
    // First filter by search term
    if (debouncedSearchTerm) {
      const searchLower = debouncedSearchTerm.toLowerCase()

      // Safely check title match
      const titleMatch = tip.title ? tip.title.toLowerCase().includes(searchLower) : false

      // Safely check content match
      const contentMatch = tip.content ? tip.content.toLowerCase().includes(searchLower) : false

      // Safely check customId match
      const customIdMatch = tip.customId ? tip.customId.toLowerCase().includes(searchLower) : false

      // If none of the fields match, exclude this tip
      if (!(titleMatch || contentMatch || customIdMatch)) {
        return false
      }
    }

    // Then filter by usage status
    if (filterOption === "used" && !tip.lastUsed) {
      return false
    }
    if (filterOption === "unused" && tip.lastUsed) {
      return false
    }

    return true
  })

  // Determine which tips to display based on showAllTips state and topTipId
  const displayedTips = (() => {
    // If there's no top tip or we're showing all tips, return all filtered tips
    if (!topTipId || showAllTips || searchTerm) {
      return filteredTips
    }

    // Otherwise, only show the top tip
    const topTip = filteredTips.find((tip) => tip.id === topTipId)
    return topTip ? [topTip] : []
  })()

  /**
   * Sort tips by last used date (most recent at bottom)
   */
  const sortedTips = [...displayedTips].sort((a, b) => {
    // If one of the tips is the top tip, it should come first
    if (a.id === topTipId) return -1
    if (b.id === topTipId) return 1

    // Otherwise, use the original sorting logic
    // If neither has been used, sort by content
    if (!a.lastUsed && !b.lastUsed) {
      return a.content.localeCompare(b.content)
    }

    // If only one has been used, put the unused one first
    if (!a.lastUsed) return -1
    if (!b.lastUsed) return 1

    // Both have been used, sort by date (oldest first)
    return new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime()
  })

  /**
   * Validate a custom ID
   * Returns null if valid, or an error message if invalid
   */
  const validateCustomId = (customId: string, currentTipId?: string): string | null => {
    if (!customId) return null // Empty is valid (will use UUID)

    // Check for valid characters (letters, numbers, hyphens, underscores)
    if (!/^[a-zA-Z0-9-_]+$/.test(customId)) {
      return "Custom ID can only contain letters, numbers, hyphens, and underscores"
    }

    // Check for uniqueness
    const duplicate = tips.find((tip) => tip.customId === customId && (!currentTipId || tip.id !== currentTipId))

    if (duplicate) {
      return "This custom ID is already in use"
    }

    return null
  }

  // Update the handleAddTip function to include isHtml and altText
  const handleAddTip = () => {
    // Check if either content or imageUrl is provided
    if (newTip.content.trim() || newTip.imageUrl.trim()) {
      // Validate custom ID if provided
      const validationError = validateCustomId(newTip.customId)
      if (validationError) {
        setCustomIdError(validationError)
        return
      }

      // Sanitize HTML content if isHtml is true
      const finalContent = newTip.isHtml ? sanitizeHtml(newTip.content.trim()) : newTip.content.trim()

      addTip({
        id: uuidv4(),
        title: newTip.title.trim(),
        content: finalContent,
        lastUsed: null,
        customId: newTip.customId.trim() || undefined,
        imageUrl: newTip.imageUrl.trim() || undefined,
        adminOnly: newTip.adminOnly,
        canUseInBriefing: newTip.canUseInBriefing,
        unlisted: newTip.unlisted,
        isHtml: newTip.isHtml,
        altText: newTip.altText.trim() || undefined,
      })

      setNewTip({
        title: "",
        content: "",
        customId: "",
        imageUrl: "",
        adminOnly: false,
        canUseInBriefing: true,
        unlisted: false,
        isHtml: false,
        altText: "",
      })
      setCustomIdError(null)
      setShowAddForm(false)
    }
  }

  // Update the startEditing function to include isHtml and altText
  const startEditing = (tip: any) => {
    setEditingTips((prev) => ({
      ...prev,
      [tip.id]: true,
    }))
    setEditedContent((prev) => ({
      ...prev,
      [tip.id]: {
        title: tip.title || "",
        content: tip.content || "",
        customId: tip.customId || "",
        imageUrl: tip.imageUrl || "",
        adminOnly: tip.adminOnly || false,
        canUseInBriefing: tip.canUseInBriefing !== false,
        unlisted: tip.unlisted || false,
        isHtml: tip.isHtml || false,
        altText: tip.altText || "",
      },
    }))
    // Initialize preview state for this tip
    setShowHtmlPreview((prev) => ({
      ...prev,
      [tip.id]: false,
    }))
  }

  // Update the saveEditedTip function to include isHtml and altText
  const saveEditedTip = (tip: any) => {
    const edited = editedContent[tip.id]
    if (edited && (edited.content.trim() || edited.imageUrl.trim())) {
      // Validate custom ID if provided
      const validationError = validateCustomId(edited.customId, tip.id)
      if (validationError) {
        setEditCustomIdError((prev) => ({
          ...prev,
          [tip.id]: validationError,
        }))
        return
      }

      // Sanitize HTML content if isHtml is true
      const finalContent = edited.isHtml ? sanitizeHtml(edited.content.trim()) : edited.content.trim()

      updateTip({
        ...tip,
        title: edited.title.trim(),
        content: finalContent,
        customId: edited.customId?.trim() || undefined,
        imageUrl: edited.imageUrl?.trim() || undefined,
        adminOnly: edited.adminOnly,
        canUseInBriefing: edited.canUseInBriefing,
        unlisted: edited.unlisted,
        isHtml: edited.isHtml,
        altText: edited.altText?.trim() || undefined,
      })

      setEditCustomIdError((prev) => ({
        ...prev,
        [tip.id]: null,
      }))
    }

    setEditingTips((prev) => ({
      ...prev,
      [tip.id]: false,
    }))
    setShowHtmlPreview((prev) => ({
      ...prev,
      [tip.id]: false,
    }))
  }

  // Update the handleEditContentChange function to handle isHtml and altText
  const handleEditContentChange = (
    tipId: string,
    field:
      | "title"
      | "content"
      | "customId"
      | "imageUrl"
      | "adminOnly"
      | "canUseInBriefing"
      | "unlisted"
      | "isHtml"
      | "altText",
    value: string | boolean,
  ) => {
    setEditedContent((prev) => ({
      ...prev,
      [tipId]: {
        ...prev[tipId],
        [field]: value,
      },
    }))

    // Clear error when editing the customId field
    if (field === "customId") {
      setEditCustomIdError((prev) => ({
        ...prev,
        [tipId]: null,
      }))
    }

    // If switching to HTML mode, check if content contains HTML
    if (field === "isHtml") {
      if (value === true) {
        // Switching to HTML mode
        setEditedContent((prev) => {
          const content = prev[tipId]?.content || ""
          if (!containsHtml(content)) {
            // If no HTML detected, wrap content in paragraph tags
            return {
              ...prev,
              [tipId]: {
                ...prev[tipId],
                content: `<p>${content}</p>`,
              },
            }
          }
          return prev
        })
      } else {
        // Switching from HTML mode to plain text
        setEditedContent((prev) => {
          const content = prev[tipId]?.content || ""
          // Strip HTML tags when switching to plain text
          return {
            ...prev,
            [tipId]: {
              ...prev[tipId],
              content: stripHtml(content),
            },
          }
        })

        // Also disable preview mode when switching to plain text
        setShowHtmlPreview((prev) => ({
          ...prev,
          [tipId]: false,
        }))
      }
    }
  }

  // Add function to handle media insertion
  const handleInsertMedia = (tipId: string | null, type: "image" | "video") => {
    setMediaDialogType(type)
    setMediaDialogTipId(tipId)
    setMediaUrl("")
    setMediaAltText("")
    setMediaWidth("")
    setMediaHeight("")
    setShowMediaDialog(true)
  }

  // Add function to insert media into content
  const insertMediaIntoContent = () => {
    if (!mediaDialogTipId || !mediaUrl.trim()) return

    let mediaHtml = ""
    const dimensions =
      mediaWidth || mediaHeight
        ? `${mediaWidth ? `width="${mediaWidth}" ` : ""}${mediaHeight ? `height="${mediaHeight}" ` : ""}`
        : ""

    if (mediaDialogType === "image") {
      mediaHtml = `<img src="${mediaUrl}" ${dimensions}loading="lazy" alt="${mediaAltText}" data-alt-text="${mediaAltText}" />`
    } else {
      mediaHtml = `
        <video ${dimensions}controls preload="none" data-alt-text="${mediaAltText}" poster="${mediaUrl.replace(/\.(mp4|webm|ogg)$/, ".jpg")}">
          <source src="${mediaUrl}" type="video/${mediaUrl.split(".").pop()}" />
          Your browser does not support the video tag.
        </video>
      `
    }

    if (mediaDialogTipId === "new") {
      // Insert into new tip
      setNewTip((prev) => ({
        ...prev,
        content: prev.content + mediaHtml,
        isHtml: true,
      }))
    } else {
      // Insert into existing tip
      setEditedContent((prev) => ({
        ...prev,
        [mediaDialogTipId]: {
          ...prev[mediaDialogTipId],
          content: prev[mediaDialogTipId].content + mediaHtml,
          isHtml: true,
        },
      }))
    }

    setShowMediaDialog(false)
  }

  /**
   * Handle delete button click
   * Opens confirmation dialog or deletes directly if shift key is pressed
   */
  const handleDeleteClick = (tipId: string, e: React.MouseEvent) => {
    if (e.shiftKey) {
      // Delete immediately if shift key is pressed
      deleteTip(tipId)
    } else {
      // Otherwise show confirmation dialog
      setTipToDelete(tipId)
    }
  }

  /**
   * Confirm deletion of a tip
   */
  const confirmDelete = () => {
    if (tipToDelete) {
      deleteTip(tipToDelete)
      setTipToDelete(null)
    }
  }

  /**
   * Copy tip content to clipboard
   */
  // Update the handleCopyTip function to handle HTML content
  const handleCopyTip = (tipId: string, content: string, title?: string, isHtml?: boolean, altText?: string) => {
    // If there's an alt text, use that for copying
    if (altText) {
      navigator.clipboard.writeText(altText).then(() => {
        setCopiedTipId(tipId)
      })
      return
    }

    // If it's HTML content, extract the text
    const textToCopy = isHtml ? extractTextFromHtml(content) : content || (title ? `${title}` : "Image tip")
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedTipId(tipId)
    })
  }

  /**
   * Copy link to tip
   */
  const handleCopyLink = (tipId: string, customId?: string) => {
    if (typeof window !== "undefined") {
      const baseUrl = window.location.href.split("#")[0]
      // Use customId if available, otherwise use the UUID
      const linkId = customId || tipId

      // Create the tip URL
      let tipUrl = `${baseUrl}#tip-${linkId}`

      // Replace any case variation of lwserenity.com with the correct casing
      tipUrl = tipUrl.replace(/lwserenity\.com/i, "LWSerenity.com")

      navigator.clipboard.writeText(tipUrl).then(() => {
        setCopiedLinkId(tipId)
      })
    }
  }

  /**
   * Auto-resize textarea based on content
   */
  const autoResizeTextarea = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target
    textarea.style.height = "auto"
    textarea.style.height = `${textarea.scrollHeight}px`
  }

  const cancelEditing = (tipId: string) => {
    setEditingTips((prev) => ({
      ...prev,
      [tipId]: false,
    }))
  }

  /**
   * Format custom ID by replacing spaces with hyphens
   */
  const formatCustomId = (value: string): string => {
    return value.replace(/\s+/g, "-")
  }

  // Add a new function to generate a sanitized custom ID from a title
  // Place this after the formatCustomId function
  const generateCustomIdFromTitle = (title: string): string => {
    if (!title) return ""

    // Convert to lowercase
    let customId = title.toLowerCase()

    // Replace spaces with hyphens
    customId = customId.replace(/\s+/g, "-")

    // Strip non-alphanumeric characters (except hyphens and underscores)
    customId = customId.replace(/[^a-z0-9-_]/g, "")

    // Trim to a reasonable length (optional)
    customId = customId.substring(0, 50)

    return customId
  }

  /**
   * Handle opening an image in full screen
   */
  const openFullScreenImage = (imageUrl: string) => {
    setFullScreenImage(imageUrl)
    // Reset dimensions when opening a new image
    setImageDimensions({ width: 0, height: 0 })
  }

  /**
   * Handle image load to get dimensions
   */
  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImageDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight,
    })
  }

  /**
   * Handle background click to close the dialog
   */
  const handleBackdropClick = () => {
    setFullScreenImage(null)
  }

  // Handle showing all tips
  const handleShowAllTips = () => {
    setShowAllTips(true)
  }

  // Handle HTML toggle for new tip
  const handleNewTipHtmlToggle = (checked: boolean) => {
    if (checked) {
      // Switching to HTML mode
      setNewTip((prev) => {
        // If no HTML detected, wrap in paragraph
        let content = prev.content
        if (!containsHtml(content)) {
          content = `<p>${content}</p>`
        }
        return { ...prev, isHtml: checked, content }
      })
    } else {
      // Switching from HTML mode to plain text
      setNewTip((prev) => ({
        ...prev,
        isHtml: checked,
        content: stripHtml(prev.content),
      }))
      // Reset to edit mode when switching to plain text
      setNewTipActiveTab("edit")
    }
  }

  // Handle HTML toggle for editing tip
  const handleEditTipHtmlToggle = (tipId: string, checked: boolean) => {
    if (checked) {
      // Switching to HTML mode
      setEditedContent((prev) => {
        const content = prev[tipId]?.content || ""
        if (!containsHtml(content)) {
          // If no HTML detected, wrap content in paragraph tags
          return {
            ...prev,
            [tipId]: {
              ...prev[tipId],
              content: `<p>${content}</p>`,
              isHtml: checked,
            },
          }
        }
        return {
          ...prev,
          [tipId]: {
            ...prev[tipId],
            isHtml: checked,
          },
        }
      })
    } else {
      // Switching from HTML mode to plain text
      setEditedContent((prev) => {
        const content = prev[tipId]?.content || ""
        // Strip HTML tags when switching to plain text
        return {
          ...prev,
          [tipId]: {
            ...prev[tipId],
            content: stripHtml(content),
            isHtml: checked,
          },
        }
      })

      // Also disable preview mode when switching to plain text
      setShowHtmlPreview((prev) => ({
        ...prev,
        [tipId]: false,
      }))
    }
  }

  // Add this near the top of the component, after the state declarations
  useEffect(() => {
    // Add CSS for expandable images in the admin view
    if (typeof window !== "undefined") {
      const style = document.createElement("style")
      style.innerHTML = `
        .html-content img {
          cursor: pointer;
          transition: transform 0.2s ease;
          max-width: 100%;
          max-height: 400px;
          border-radius: 0.375rem;
          border: 1px solid var(--border);
        }
        .html-content img:hover {
          transform: scale(1.02);
        }
      `
      document.head.appendChild(style)

      return () => {
        document.head.removeChild(style)
      }
    }
  }, [])

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold">Manage Tips</h2>
        <div className="flex items-center gap-2">
          {!showAddForm && (
            <Button onClick={() => setShowAddForm(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add Tip
            </Button>
          )}
        </div>
      </div>

      {/* Add new tip form and search */}
      <div className="grid gap-4">
        {showAddForm && (
          <div className="space-y-2">
            <div>
              <Label htmlFor="new-tip-title">Title</Label>
              <Input
                id="new-tip-title"
                value={newTip.title}
                onChange={(e) => setNewTip((prev) => ({ ...prev, title: e.target.value }))}
                onBlur={() => {
                  if (!newTip.customId && newTip.title) {
                    setNewTip((prev) => ({
                      ...prev,
                      customId: generateCustomIdFromTitle(newTip.title),
                    }))
                  }
                }}
                placeholder="Enter a title..."
                className="mb-2"
              />
            </div>
            <div>
              <Label htmlFor="new-tip-custom-id">Custom ID (optional)</Label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">
                  tip-
                </div>
                <Input
                  id="new-tip-custom-id"
                  value={newTip.customId}
                  onChange={(e) => setNewTip((prev) => ({ ...prev, customId: formatCustomId(e.target.value) }))}
                  placeholder="my-awesome-tip"
                  className="pl-10"
                />
              </div>
              {customIdError && <p className="text-sm text-destructive mt-1">{customIdError}</p>}
              <p className="text-xs text-muted-foreground mt-1">
                Leave empty to use auto-generated ID, or enter a custom ID for more memorable links
              </p>
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="new-tip-content">Content (optional if image URL is provided)</Label>
              <div className="flex items-center space-x-2">
                {newTip.isHtml && (
                  <div className="flex space-x-1">
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleInsertMedia("new", "image")}
                            className="h-8 w-8"
                          >
                            <ImageIcon size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Insert Image</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleInsertMedia("new", "video")}
                            className="h-8 w-8"
                          >
                            <Video size={16} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Insert Video</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>

                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setNewTipActiveTab(newTipActiveTab === "edit" ? "preview" : "edit")}
                            className="h-8 w-8"
                          >
                            {newTipActiveTab === "preview" ? <FileText size={16} /> : <FileCode size={16} />}
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          {newTipActiveTab === "preview" ? "Show Editor" : "Preview HTML"}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                )}
                <span className="text-sm text-muted-foreground">HTML</span>
                <Switch id="new-tip-html-toggle" checked={newTip.isHtml} onCheckedChange={handleNewTipHtmlToggle} />
              </div>
            </div>

            {newTipActiveTab === "preview" && newTip.isHtml ? (
              <div
                className="min-h-[120px] p-3 border rounded-md bg-background html-content"
                dangerouslySetInnerHTML={{
                  __html: sanitizeHtml(newTip.content),
                }}
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  if (target.tagName === "IMG") {
                    e.preventDefault()
                    e.stopPropagation()
                    openFullScreenImage(target.getAttribute("src") || "")
                  }
                }}
              />
            ) : (
              <Textarea
                id="new-tip-content"
                ref={newTipTextareaRef}
                value={newTip.content}
                onChange={(e) => {
                  setNewTip((prev) => ({ ...prev, content: e.target.value }))
                  autoResizeTextarea(e)
                }}
                placeholder={newTip.isHtml ? "<p>Enter HTML content here...</p>" : "Enter tip content..."}
                className="flex-1 min-h-[120px] font-mono"
                onInput={autoResizeTextarea}
              />
            )}

            <div>
              <Label htmlFor="new-tip-alt-text">Alt Text (optional)</Label>
              <Textarea
                id="new-tip-alt-text"
                value={newTip.altText}
                onChange={(e) => setNewTip((prev) => ({ ...prev, altText: e.target.value }))}
                placeholder="Alternative text for when this tip is copied"
                className="min-h-[60px]"
              />
              <p className="text-xs text-muted-foreground mt-1">
                If provided, this text will be used when copying the tip instead of the content
              </p>
            </div>

            {!newTip.isHtml && (
              <div>
                <Label htmlFor="new-tip-image-url">Image URL (optional)</Label>
                <Input
                  id="new-tip-image-url"
                  value={newTip.imageUrl}
                  onChange={(e) => setNewTip((prev) => ({ ...prev, imageUrl: e.target.value }))}
                  placeholder="https://example.com/image.jpg"
                  className="mb-2"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Enter a URL to an image that will be displayed with this tip
                </p>
              </div>
            )}

            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="new-tip-admin-only"
                  checked={newTip.adminOnly}
                  onChange={(e) => setNewTip((prev) => ({ ...prev, adminOnly: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="new-tip-admin-only">Admin Only</Label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="new-tip-can-use-in-briefing"
                  checked={newTip.canUseInBriefing}
                  onChange={(e) => setNewTip((prev) => ({ ...prev, canUseInBriefing: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="new-tip-can-use-in-briefing">Include in briefings</Label>
              </div>

              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="new-tip-unlisted"
                  checked={newTip.unlisted}
                  onChange={(e) => setNewTip((prev) => ({ ...prev, unlisted: e.target.checked }))}
                  className="rounded border-gray-300"
                />
                <Label htmlFor="new-tip-unlisted">Unlisted (only accessible via direct link)</Label>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setShowAddForm(false)
                  setNewTip({
                    title: "",
                    content: "",
                    customId: "",
                    imageUrl: "",
                    adminOnly: false,
                    canUseInBriefing: true,
                    unlisted: false,
                    isHtml: false,
                    altText: "",
                  })
                }}
              >
                Cancel
              </Button>
              <Button onClick={handleAddTip}>
                <Plus className="mr-2 h-4 w-4" /> Add
              </Button>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search tips..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value)
                // Show all tips when searching
                if (e.target.value) {
                  setShowAllTips(true)
                }
              }}
            />
          </div>
          <div className="flex gap-2">
            <Button
              variant={filterOption === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterOption("all")}
              className="whitespace-nowrap"
            >
              All Tips
            </Button>
            <Button
              variant={filterOption === "used" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterOption("used")}
              className="whitespace-nowrap"
            >
              Used
            </Button>
            <Button
              variant={filterOption === "unused" ? "default" : "outline"}
              size="sm"
              onClick={() => setFilterOption("unused")}
              className="whitespace-nowrap"
            >
              Unused
            </Button>
          </div>
        </div>
      </div>

      {/* Debug info */}
      {debugInfo && (
        <div className="text-sm p-2 bg-yellow-50 border border-yellow-200 rounded-md text-yellow-800">{debugInfo}</div>
      )}

      {sortedTips.length > 0 && (
        <div className="text-sm text-muted-foreground">
          Showing {sortedTips.length} of {tips.length} tips
        </div>
      )}

      {/* Tips list */}
      <div className="space-y-2">
        {sortedTips.length > 0 ? (
          <>
            {sortedTips.map((tip) => (
              <Card key={tip.id} id={`tip-${tip.id}`}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      {!editingTips[tip.id] ? (
                        <>
                          {tip.title && <div className="font-medium mb-2">{tip.title}</div>}
                          {tip.customId && (
                            <div className="text-xs text-muted-foreground mb-2">ID: tip-{tip.customId}</div>
                          )}
                          <div className="flex gap-2 mb-2">
                            {tip.adminOnly && (
                              <span className="px-2 py-0.5 bg-yellow-100 text-yellow-800 rounded-full text-xs">
                                Admin Only
                              </span>
                            )}
                            {tip.canUseInBriefing === false && (
                              <span className="px-2 py-0.5 bg-gray-100 text-gray-800 rounded-full text-xs">
                                Not for Briefing
                              </span>
                            )}
                            {tip.unlisted && (
                              <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs">
                                Unlisted
                              </span>
                            )}
                            {tip.isHtml && (
                              <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs">HTML</span>
                            )}
                          </div>
                          {tip.content && (
                            <div
                              className={`py-1 ${tip.isHtml ? "html-content" : "whitespace-pre-wrap break-words text-sm"}`}
                              onClick={(e) => {
                                if (tip.isHtml) {
                                  const target = e.target as HTMLElement
                                  if (target.tagName === "IMG") {
                                    e.preventDefault()
                                    e.stopPropagation()
                                    openFullScreenImage(target.getAttribute("src") || "")
                                  }
                                }
                              }}
                            >
                              {tip.isHtml ? (
                                <div dangerouslySetInnerHTML={{ __html: tip.content }} />
                              ) : (
                                <div className="whitespace-pre-wrap break-words text-sm">{tip.content}</div>
                              )}
                            </div>
                          )}
                          {tip.imageUrl && !tip.isHtml && (
                            <div className="mt-2">
                              <div
                                className="relative inline-block cursor-pointer group"
                                onClick={() => openFullScreenImage(tip.imageUrl!)}
                              >
                                <img
                                  src={tip.imageUrl || "/placeholder.svg"}
                                  alt="Tip illustration"
                                  className="max-w-full max-h-[400px] rounded-md border border-border object-contain"
                                  loading="lazy"
                                  onError={(e) => {
                                    // Hide the image if it fails to load
                                    ;(e.target as HTMLImageElement).style.display = "none"
                                  }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity bg-black/20 rounded-md">
                                  <ZoomIn className="h-8 w-8 text-white drop-shadow-md" />
                                </div>
                              </div>
                            </div>
                          )}
                          {tip.altText && (
                            <div className="mt-2 text-xs text-muted-foreground italic">Alt text: {tip.altText}</div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2">
                          <div>
                            <Label htmlFor={`edit-title-${tip.id}`}>Title</Label>
                            <Input
                              id={`edit-title-${tip.id}`}
                              value={editedContent[tip.id]?.title || ""}
                              onChange={(e) => handleEditContentChange(tip.id, "title", e.target.value)}
                              onBlur={() => {
                                if (
                                  (!editedContent[tip.id]?.customId || editedContent[tip.id]?.customId === "") &&
                                  editedContent[tip.id]?.title
                                ) {
                                  handleEditContentChange(
                                    tip.id,
                                    "customId",
                                    generateCustomIdFromTitle(editedContent[tip.id]?.title || ""),
                                  )
                                }
                              }}
                              className="mb-2"
                            />
                          </div>
                          <div>
                            <Label htmlFor={`edit-custom-id-${tip.id}`}>Custom ID (optional)</Label>
                            <div className="relative">
                              <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-muted-foreground">
                                tip-
                              </div>
                              <Input
                                id={`edit-custom-id-${tip.id}`}
                                value={editedContent[tip.id]?.customId || ""}
                                onChange={(e) =>
                                  handleEditContentChange(tip.id, "customId", formatCustomId(e.target.value))
                                }
                                placeholder="my-awesome-tip"
                                className="pl-10"
                              />
                            </div>
                            {editCustomIdError[tip.id] && (
                              <p className="text-sm text-destructive mt-1">{editCustomIdError[tip.id]}</p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              Leave empty to use auto-generated ID, or enter a custom ID for more memorable links
                            </p>
                          </div>

                          <div className="flex items-center justify-between">
                            <Label htmlFor={`edit-content-${tip.id}`}>
                              Content (optional if image URL is provided)
                            </Label>
                            <div className="flex items-center space-x-2">
                              {editedContent[tip.id]?.isHtml && (
                                <div className="flex space-x-1">
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleInsertMedia(tip.id, "image")}
                                          className="h-8 w-8"
                                        >
                                          <ImageIcon size={16} />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Insert Image</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>

                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() => handleInsertMedia(tip.id, "video")}
                                          className="h-8 w-8"
                                        >
                                          <Video size={16} />
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>Insert Video</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>

                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Button
                                          variant="ghost"
                                          size="icon"
                                          onClick={() =>
                                            setShowHtmlPreview((prev) => ({
                                              ...prev,
                                              [tip.id]: !prev[tip.id],
                                            }))
                                          }
                                          className="h-8 w-8"
                                        >
                                          {showHtmlPreview[tip.id] ? <FileText size={16} /> : <FileCode size={16} />}
                                        </Button>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        {showHtmlPreview[tip.id] ? "Show Editor" : "Preview HTML"}
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              )}
                              <span className="text-sm text-muted-foreground">HTML</span>
                              <Switch
                                id={`edit-html-toggle-${tip.id}`}
                                checked={editedContent[tip.id]?.isHtml || false}
                                onCheckedChange={(checked) => handleEditTipHtmlToggle(tip.id, checked)}
                              />
                            </div>
                          </div>

                          {showHtmlPreview[tip.id] && editedContent[tip.id]?.isHtml ? (
                            <div
                              className="min-h-[120px] p-3 border rounded-md bg-background html-content"
                              dangerouslySetInnerHTML={{
                                __html: sanitizeHtml(editedContent[tip.id]?.content || ""),
                              }}
                              onClick={(e) => {
                                const target = e.target as HTMLElement
                                if (target.tagName === "IMG") {
                                  e.preventDefault()
                                  e.stopPropagation()
                                  openFullScreenImage(target.getAttribute("src") || "")
                                }
                              }}
                            />
                          ) : (
                            <Textarea
                              id={`edit-content-${tip.id}`}
                              value={editedContent[tip.id]?.content || ""}
                              onChange={(e) => {
                                handleEditContentChange(tip.id, "content", e.target.value)
                                autoResizeTextarea(e)
                              }}
                              className="flex-1 min-h-[120px] font-mono"
                              onInput={autoResizeTextarea}
                            />
                          )}

                          <div>
                            <Label htmlFor={`edit-alt-text-${tip.id}`}>Alt Text (optional)</Label>
                            <Textarea
                              id={`edit-alt-text-${tip.id}`}
                              value={editedContent[tip.id]?.altText || ""}
                              onChange={(e) => handleEditContentChange(tip.id, "altText", e.target.value)}
                              placeholder="Alternative text for when this tip is copied"
                              className="min-h-[60px]"
                            />
                            <p className="text-xs text-muted-foreground mt-1">
                              If provided, this text will be used when copying the tip instead of the content
                            </p>
                          </div>

                          {!editedContent[tip.id]?.isHtml && (
                            <div>
                              <Label htmlFor={`edit-image-url-${tip.id}`}>Image URL (optional)</Label>
                              <Input
                                id={`edit-image-url-${tip.id}`}
                                value={editedContent[tip.id]?.imageUrl || ""}
                                onChange={(e) => handleEditContentChange(tip.id, "imageUrl", e.target.value)}
                                placeholder="https://example.com/image.jpg"
                                className="mb-2"
                              />
                              <p className="text-xs text-muted-foreground mt-1">
                                Enter a URL to an image that will be displayed with this tip
                              </p>
                            </div>
                          )}

                          <div className="space-y-2">
                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`edit-admin-only-${tip.id}`}
                                checked={editedContent[tip.id]?.adminOnly || false}
                                onChange={(e) => handleEditContentChange(tip.id, "adminOnly", e.target.checked)}
                                className="rounded border-gray-300"
                              />
                              <Label htmlFor={`edit-admin-only-${tip.id}`}>Admin Only</Label>
                            </div>

                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`edit-can-use-in-briefing-${tip.id}`}
                                checked={editedContent[tip.id]?.canUseInBriefing !== false}
                                onChange={(e) => handleEditContentChange(tip.id, "canUseInBriefing", e.target.checked)}
                                className="rounded border-gray-300"
                              />
                              <Label htmlFor={`edit-can-use-in-briefing-${tip.id}`}>Include in briefings</Label>
                            </div>

                            <div className="flex items-center space-x-2">
                              <input
                                type="checkbox"
                                id={`edit-unlisted-${tip.id}`}
                                checked={editedContent[tip.id]?.unlisted || false}
                                onChange={(e) => handleEditContentChange(tip.id, "unlisted", e.target.checked)}
                                className="rounded border-gray-300"
                              />
                              <Label htmlFor={`edit-unlisted-${tip.id}`}>
                                Unlisted (only accessible via direct link)
                              </Label>
                            </div>
                          </div>

                          <div className="flex justify-end gap-2 mt-2">
                            <Button variant="outline" onClick={() => cancelEditing(tip.id)}>
                              Cancel
                            </Button>
                            <Button onClick={() => saveEditedTip(tip)}>Save</Button>
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="flex gap-1">
                      {/* Update the button onClick handler in the tip card */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopyTip(tip.id, tip.content, tip.title, tip.isHtml, tip.altText)}
                        className={`${
                          copiedTipId === tip.id
                            ? "text-green-600 hover:text-green-600 hover:bg-green-100"
                            : "text-muted-foreground hover:text-muted-foreground hover:bg-muted/50"
                        }`}
                        title="Copy to clipboard"
                      >
                        {copiedTipId === tip.id ? <Check size={16} /> : <Copy size={16} />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopyLink(tip.id, tip.customId)}
                        className={`${
                          copiedLinkId === tip.id
                            ? "text-green-600 hover:text-green-600 hover:bg-green-100"
                            : "text-muted-foreground hover:text-muted-foreground hover:bg-muted/50"
                        }`}
                        title="Copy link to this tip"
                      >
                        {copiedLinkId === tip.id ? <Check size={16} /> : <Link size={16} />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => startEditing(tip)}
                        className="text-muted-foreground hover:text-muted-foreground hover:bg-muted/50"
                        title="Edit"
                      >
                        <Edit size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => handleDeleteClick(tip.id, e)}
                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                        title="Delete"
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                  {tip.lastUsed && (
                    <div className="text-xs text-muted-foreground mt-2">
                      Last used: {new Date(tip.lastUsed).toLocaleDateString()}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}

            {/* Show "Load More Intel" button if we're only showing one tip */}
            {topTipId && !showAllTips && filteredTips.length > 1 && (
              <Button
                variant="outline"
                className="w-full mt-4 flex items-center justify-center gap-2"
                onClick={handleShowAllTips}
              >
                Load More Intel <ChevronDown className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : (
          <div className="text-center py-4 text-muted-foreground">
            {tips.length === 0 ? "No tips available. Add some tips above." : `No tips found matching your criteria.`}
          </div>
        )}
      </div>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={tipToDelete !== null} onOpenChange={(open) => !open && setTipToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tip</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this tip? This action cannot be undone.
              <br />
              <br />
              <span className="text-sm italic">
                Tip: To skip this confirmation in the future, hold the Shift key while clicking the delete icon.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Full Screen Image Dialog */}
      <Dialog open={!!fullScreenImage} onOpenChange={(open) => !open && setFullScreenImage(null)}>
        <DialogContent
          className="p-0 overflow-hidden bg-black/50 border-0 shadow-xl"
          style={{
            maxWidth: "100vw",
            maxHeight: "100vh",
            width: "100vw",
            height: "100vh",
          }}
          aria-label="Full-size image view"
          onClick={handleBackdropClick}
        >
          {fullScreenImage && (
            <div
              className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
              style={{
                width: "96vw",
                height: "96vh",
              }}
            >
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 z-10 bg-black/50 text-white hover:bg-black/70 hover:text-white"
                onClick={() => setFullScreenImage(null)}
              >
                <X className="h-4 w-4" />
              </Button>
              <img
                src={fullScreenImage || "/placeholder.svg"}
                alt="Full screen view"
                className="max-w-full max-h-full object-contain"
                onLoad={handleImageLoad}
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Media Dialog */}
      <Dialog open={showMediaDialog} onOpenChange={setShowMediaDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <div className="space-y-4">
            <h3 className="text-lg font-medium">Insert {mediaDialogType === "image" ? "Image" : "Video"}</h3>

            <div className="space-y-2">
              <Label htmlFor="media-url">{mediaDialogType === "image" ? "Image URL" : "Video URL"}</Label>
              <Input
                id="media-url"
                value={mediaUrl}
                onChange={(e) => setMediaUrl(e.target.value)}
                placeholder={
                  mediaDialogType === "image" ? "https://example.com/image.jpg" : "https://example.com/video.mp4"
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="media-alt-text">Alt Text</Label>
              <Input
                id="media-alt-text"
                value={mediaAltText}
                onChange={(e) => setMediaAltText(e.target.value)}
                placeholder="Description of the media content"
              />
              <p className="text-xs text-muted-foreground">
                This text will be used when the media cannot be displayed or when copying the tip
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="media-width">Width (optional)</Label>
                <Input
                  id="media-width"
                  value={mediaWidth}
                  onChange={(e) => setMediaWidth(e.target.value)}
                  placeholder="e.g., 300 or 100%"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="media-height">Height (optional)</Label>
                <Input
                  id="media-height"
                  value={mediaHeight}
                  onChange={(e) => setMediaHeight(e.target.value)}
                  placeholder="e.g., 200"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowMediaDialog(false)}>
                Cancel
              </Button>
              <Button onClick={insertMediaIntoContent}>Insert</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

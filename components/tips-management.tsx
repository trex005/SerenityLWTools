/* eslint-disable @next/next/no-img-element */
"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"
import { v4 as uuidv4 } from "uuid"

import { useTips } from "@/hooks/use-tips"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Edit2, Trash2, Copy, Check, X, Search, Link as LinkIcon, ZoomIn } from "lucide-react"
import { EmbeddedContent } from "@/components/embedded-content"
import { sanitizeHtml, extractTextFromHtml } from "@/lib/html-utils"
import { matchesSearchTokens, tokenizeSearchTerm } from "@/lib/search-utils"
import { useDebounce } from "@/hooks/use-debounce"
import { useOverrideDiff } from "@/hooks/use-override-diff"
import { useToast } from "@/hooks/use-toast"
import { listAdminEnabledTags } from "@/lib/scoped-storage"
import { loadTipForTag, saveTipForTag } from "@/lib/tag-overrides"
import { clearConfigCache } from "@/lib/config-fetcher"

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
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"

type TipContentType = "text" | "html" | "image" | "embedded"
type TipFormFieldsState = {
  title: string
  content: string
  customId: string
  imageUrl: string
  type: TipContentType
  embedUrl: string
}

type NewTipState = TipFormFieldsState & {
  adminOnly: boolean
  canUseInBriefing: boolean
  unlisted: boolean
  isHtml: boolean
  altText: string
}

const createEmptyNewTip = (): NewTipState => ({
  title: "",
  content: "",
  customId: "",
  imageUrl: "",
  adminOnly: false,
  canUseInBriefing: true,
  unlisted: false,
  isHtml: false,
  altText: "",
  type: "text",
  embedUrl: "",
})

const areTipFormValuesEqual = (left: TipFormFieldsState, right: TipFormFieldsState): boolean => {
  return (
    left.title === right.title &&
    left.content === right.content &&
    left.customId === right.customId &&
    left.imageUrl === right.imageUrl &&
    left.type === right.type &&
    left.embedUrl === right.embedUrl
  )
}

function TipTypeSelect({
  value,
  onValueChange,
}: {
  value: TipContentType
  onValueChange: (value: TipContentType) => void
}) {
  return (
    <Select value={value} onValueChange={(value) => onValueChange(value as TipContentType)}>
      <SelectTrigger>
        <SelectValue placeholder="Select content type" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="text">Text</SelectItem>
        <SelectItem value="html">HTML</SelectItem>
        <SelectItem value="image">Image</SelectItem>
        <SelectItem value="embedded">Embedded Content</SelectItem>
      </SelectContent>
    </Select>
  )
}

function TipFormFields({
  idPrefix,
  values,
  onValuesChange,
  renderOverridePill,
  sanitizeCustomId,
  contentPlaceholder = "Enter content...",
  contentMinHeightClass = "min-h-[100px]",
  showEmbedHint = false,
  showEmbedPreview = false,
  debounceMs = 3000,
}: {
  idPrefix: string
  values: TipFormFieldsState
  onValuesChange: (values: TipFormFieldsState) => void
  renderOverridePill?: (key: string) => React.ReactNode
  sanitizeCustomId?: (value: string) => string
  contentPlaceholder?: string
  contentMinHeightClass?: string
  showEmbedHint?: boolean
  showEmbedPreview?: boolean
  debounceMs?: number
}) {
  const maybePill = (key: string) => (renderOverridePill ? renderOverridePill(key) : null)
  const [localValues, setLocalValues] = useState<TipFormFieldsState>(values)
  const debouncedValues = useDebounce(localValues, debounceMs)
  const onValuesChangeRef = useRef(onValuesChange)

  useEffect(() => {
    onValuesChangeRef.current = onValuesChange
  }, [onValuesChange])

  useEffect(() => {
    const nextValues: TipFormFieldsState = {
      title: values.title,
      content: values.content,
      customId: values.customId,
      imageUrl: values.imageUrl,
      type: values.type,
      embedUrl: values.embedUrl,
    }
    setLocalValues((prev) => {
      if (areTipFormValuesEqual(prev, nextValues)) {
        return prev
      }
      return nextValues
    })
  }, [values.title, values.content, values.customId, values.imageUrl, values.type, values.embedUrl])

  useEffect(() => {
    onValuesChangeRef.current(debouncedValues)
  }, [debouncedValues])

  const updateLocalField = (field: keyof TipFormFieldsState, value: string) => {
    setLocalValues((prev) => {
      if (field === "type") {
        return {
          ...prev,
          type: value as TipContentType,
        }
      }
      return {
        ...prev,
        [field]: value,
      }
    })
  }

  const commitNow = (nextValues?: TipFormFieldsState) => {
    onValuesChangeRef.current(nextValues ?? localValues)
  }

  const handleTitleBlur = () => {
    if (!sanitizeCustomId) {
      commitNow()
      return
    }
    const existingCustomId = localValues.customId.trim()
    const titleValue = localValues.title.trim()
    if (existingCustomId || !titleValue) {
      commitNow()
      return
    }
    const nextValues = {
      ...localValues,
      customId: sanitizeCustomId(titleValue),
    }
    setLocalValues(nextValues)
    commitNow(nextValues)
  }

  const handleCustomIdBlur = () => {
    if (!sanitizeCustomId) {
      commitNow()
      return
    }
    const currentCustomId = localValues.customId
    if (!currentCustomId) {
      commitNow()
      return
    }
    const cleaned = sanitizeCustomId(currentCustomId)
    if (cleaned === currentCustomId) {
      commitNow()
      return
    }
    const nextValues = {
      ...localValues,
      customId: cleaned,
    }
    setLocalValues(nextValues)
    commitNow(nextValues)
  }

  return (
    <>
      <div>
        <Label htmlFor={`${idPrefix}-title`} className="flex items-center gap-2">
          Title
          {maybePill("title")}
        </Label>
        <Input
          id={`${idPrefix}-title`}
          value={localValues.title}
          onChange={(e) => updateLocalField("title", e.target.value)}
          onBlur={handleTitleBlur}
          placeholder="Enter title..."
        />
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-custom-id`} className="flex items-center gap-2">
          Custom ID
          {maybePill("customId")}
        </Label>
        <Input
          id={`${idPrefix}-custom-id`}
          value={localValues.customId}
          onChange={(e) => updateLocalField("customId", e.target.value)}
          onBlur={handleCustomIdBlur}
          placeholder="auto-generated from title"
        />
      </div>

      <div>
        <Label className="flex items-center gap-2">
          Content Type
          {maybePill("type")}
        </Label>
        <TipTypeSelect
          value={localValues.type}
          onValueChange={(value) => {
            updateLocalField("type", value)
            commitNow({ ...localValues, type: value })
          }}
        />
      </div>

      <div>
        <Label htmlFor={`${idPrefix}-image-url`} className="flex items-center gap-2">
          Image URL
          {maybePill("imageUrl")}
        </Label>
        <Input
          id={`${idPrefix}-image-url`}
          value={localValues.imageUrl}
          onChange={(e) => updateLocalField("imageUrl", e.target.value)}
          onBlur={() => commitNow()}
          placeholder="https://example.com/image.jpg"
        />
      </div>

      {localValues.imageUrl && (
        <div>
          <Label>Image Preview</Label>
          <div className="mt-2">
            <img
              src={localValues.imageUrl}
              alt={localValues.title || "Tip image"}
              className="max-h-48 rounded border border-border object-contain"
              onError={(e) => {
                ;(e.target as HTMLImageElement).style.display = "none"
              }}
            />
          </div>
        </div>
      )}

      {localValues.type === "embedded" && (
        <div>
          <Label htmlFor={`${idPrefix}-embed-url`} className="flex items-center gap-2">
            Embed URL
            {maybePill("embedUrl")}
          </Label>
          <Input
            id={`${idPrefix}-embed-url`}
            value={localValues.embedUrl}
            onChange={(e) => updateLocalField("embedUrl", e.target.value)}
            onBlur={() => commitNow()}
            placeholder="/server_birthday.html"
          />
          {showEmbedHint && (
            <p className="mt-1 text-xs text-muted-foreground">
              Enter a relative URL to HTML content (e.g., /server_birthday.html)
            </p>
          )}
        </div>
      )}

      {showEmbedPreview && localValues.type === "embedded" && localValues.embedUrl && (
        <div>
          <Label>Preview</Label>
          <EmbeddedContent url={localValues.embedUrl} className="mt-2" />
        </div>
      )}

      {localValues.type !== "embedded" && (
        <div>
          <Label htmlFor={`${idPrefix}-content`} className="flex items-center gap-2">
            Content
            {maybePill("content")}
          </Label>
          <Textarea
            id={`${idPrefix}-content`}
            value={localValues.content}
            onChange={(e) => updateLocalField("content", e.target.value)}
            onBlur={() => commitNow()}
            placeholder={contentPlaceholder}
            className={contentMinHeightClass}
          />
        </div>
      )}
    </>
  )
}

function TipHtmlPreview({ html }: { html: string }) {
  return (
    <div
      className="text-sm break-words [&_*]:max-w-full [&_img]:max-w-full [&_video]:max-w-full [&_iframe]:max-w-full"
      dangerouslySetInnerHTML={{ __html: sanitizeHtml(html) }}
    />
  )
}

/**
 * TipsManagement component
 * Provides a UI for managing tips - adding, editing, and deleting them
 */
export function TipsManagement({ forceRefresh }: { forceRefresh?: string }) {
  // Access tips store
  const { tips, addTip, updateTip, deleteTip, activeTag } = useTips()

  // State for new tip form
  const [newTip, setNewTip] = useState<NewTipState>(() => createEmptyNewTip())
  const [newTipTargetTag, setNewTipTargetTag] = useState<string>(() => activeTag)

  const [showAddForm, setShowAddForm] = useState(false)
  const [tipToDelete, setTipToDelete] = useState<string | null>(null)
  const [editingTips, setEditingTips] = useState<Record<string, boolean>>({})
  const [editedContent, setEditedContent] = useState<Record<string, any>>({})
  const [searchTerm, setSearchTerm] = useState("")
  const [copiedTipId, setCopiedTipId] = useState<string | null>(null)
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)
  const { diffIndex } = useOverrideDiff()
  const tipOverrideIndex = diffIndex?.tips ?? {}
  const [availableAdminTags, setAvailableAdminTags] = useState<string[]>([])
  const [tipTargetTags, setTipTargetTags] = useState<Record<string, string>>({})
  const [tipMissingForTags, setTipMissingForTags] = useState<Record<string, boolean>>({})
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null)
  const { toast } = useToast()

  const searchTokens = tokenizeSearchTerm(searchTerm)

  // Filter tips based on search
  const filteredTips = tips.filter((tip) => matchesSearchTokens(searchTokens, [tip.title, tip.content, tip.customId]))

  const formatOverrideKey = (key: string) =>
    key
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase())

  const sanitizeCustomId = (value: string) =>
    value
      .toLowerCase()
      .trim()
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")

  const buildDraftFromTip = (tip: any) => {
    const inferredType = (
      tip.type ||
      (tip.embedUrl ? "embedded" : tip.isHtml ? "html" : tip.imageUrl ? "image" : "text")
    ) as "text" | "html" | "image" | "embedded"
    return {
      title: tip.title || "",
      content: tip.content || "",
      type: inferredType,
      embedUrl: tip.embedUrl || "",
      imageUrl: tip.imageUrl || "",
      customId: tip.customId || "",
    }
  }

  useEffect(() => {
    if (!copiedTipId) return
    const timer = setTimeout(() => setCopiedTipId(null), 2000)
    return () => clearTimeout(timer)
  }, [copiedTipId])

  useEffect(() => {
    if (!copiedLinkId) return
    const timer = setTimeout(() => setCopiedLinkId(null), 2000)
    return () => clearTimeout(timer)
  }, [copiedLinkId])

  useEffect(() => {
    const tags = (() => {
      try {
        return listAdminEnabledTags()
      } catch {
        return []
      }
    })()
    const normalized = new Set(tags)
    normalized.add(activeTag)
    setAvailableAdminTags(Array.from(normalized).sort())
  }, [activeTag])

  useEffect(() => {
    if (availableAdminTags.length === 0) {
      setNewTipTargetTag(activeTag)
      return
    }
    if (!availableAdminTags.includes(newTipTargetTag)) {
      setNewTipTargetTag(activeTag)
    }
  }, [activeTag, availableAdminTags, newTipTargetTag])

  // Start editing a tip
  const startEditing = (tip: any) => {
    setEditingTips((prev) => ({ ...prev, [tip.id]: true }))
    setEditedContent((prev) => ({
      ...prev,
      [tip.id]: buildDraftFromTip(tip),
    }))
    setTipTargetTags((prev) => ({ ...prev, [tip.id]: activeTag }))
    setTipMissingForTags((prev) => ({ ...prev, [tip.id]: false }))
  }

  // Save edited tip
  const saveEditedTip = async (tip: any) => {
    const edited = editedContent[tip.id]
    if (!edited || (!edited.content.trim() && !edited.embedUrl?.trim() && !edited.title.trim() && !edited.imageUrl?.trim())) {
      return
    }
    const targetTag = tipTargetTags[tip.id] ?? activeTag
    const nextType = (edited.type || "text") as "text" | "html" | "image" | "embedded"
    const rawCustomId = edited.customId ?? tip.customId ?? ""
    const payload = {
      ...tip,
      title: edited.title.trim(),
      content: edited.content.trim(),
      type: nextType,
      isHtml: nextType === "html",
      embedUrl: edited.embedUrl?.trim() || undefined,
      imageUrl: edited.imageUrl?.trim() || undefined,
      customId: rawCustomId ? sanitizeCustomId(rawCustomId) || undefined : undefined,
    }
    try {
      await saveTipForTag(targetTag, payload)
      if (targetTag === activeTag) {
        updateTip(payload)
      } else {
        toast({
          title: "Tip saved",
          description: `Updated ${targetTag} without switching tags.`,
          variant: "success",
        })
      }
      clearConfigCache()
      useTips
        .getState()
        .initializeFromConfig(true)
        .catch((error) => console.error("Failed to refresh tips after save", error))
      setEditingTips((prev) => ({ ...prev, [tip.id]: false }))
      setEditedContent((prev) => {
        const next = { ...prev }
        delete next[tip.id]
        return next
      })
      setTipTargetTags((prev) => {
        const next = { ...prev }
        delete next[tip.id]
        return next
      })
      setTipMissingForTags((prev) => {
        const next = { ...prev }
        delete next[tip.id]
        return next
      })
    } catch (error) {
      console.error("Failed to save tip", error)
      toast({
        title: "Save failed",
        description: "Could not save the tip for the selected tag.",
        variant: "destructive",
      })
    }
  }

  // Cancel editing
  const cancelEditing = (tipId: string) => {
    setEditingTips((prev) => ({ ...prev, [tipId]: false }))
    setEditedContent((prev) => {
      const newState = { ...prev }
      delete newState[tipId]
      return newState
    })
    setTipTargetTags((prev) => {
      const next = { ...prev }
      delete next[tipId]
      return next
    })
    setTipMissingForTags((prev) => {
      const next = { ...prev }
      delete next[tipId]
      return next
    })
  }

  const resetAddForm = () => {
    setNewTip(createEmptyNewTip())
    setNewTipTargetTag(activeTag)
    setShowAddForm(false)
  }

  const handleCopyContent = (tip: any) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      return
    }

    let textToCopy = ""

    if (tip.altText) {
      textToCopy = tip.altText
    } else if ((tip.isHtml || tip.type === "html") && tip.content) {
      textToCopy = extractTextFromHtml(tip.content)
    } else if (tip.content) {
      textToCopy = tip.content
    } else if (tip.imageUrl) {
      textToCopy = tip.imageUrl
    } else if (tip.embedUrl) {
      textToCopy = tip.embedUrl
    } else if (tip.title) {
      textToCopy = tip.title
    }

    if (!textToCopy) {
      textToCopy = "Tip content"
    }

    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedTipId(tip.id)
    })
  }

  const handleCopyLink = (tip: any) => {
    if (typeof window === "undefined" || typeof navigator === "undefined" || !navigator.clipboard) {
      return
    }

    const url = new URL(window.location.href)
    const linkId = tip.customId || tip.id

    url.pathname = `/t/${linkId}`
    url.hash = ""
    url.search = ""
    let tipUrl = url.toString()
    tipUrl = tipUrl.replace(/lwserenity\.com/i, "LWSerenity.com")

    navigator.clipboard.writeText(tipUrl).then(() => {
      setCopiedLinkId(tip.id)
    })
  }

  const handleTipTargetSelection = async (tip: any, tag: string) => {
    setTipTargetTags((prev) => ({ ...prev, [tip.id]: tag }))
    if (!editingTips[tip.id] || !tip?.id) return
    if (tag === activeTag) {
      setEditedContent((prev) => ({ ...prev, [tip.id]: buildDraftFromTip(tip) }))
      setTipMissingForTags((prev) => ({ ...prev, [tip.id]: false }))
      return
    }
    try {
      const loaded = await loadTipForTag(tag, tip.id)
      if (loaded) {
        setEditedContent((prev) => ({ ...prev, [tip.id]: buildDraftFromTip(loaded) }))
        setTipMissingForTags((prev) => ({ ...prev, [tip.id]: false }))
      } else {
        setTipMissingForTags((prev) => ({ ...prev, [tip.id]: true }))
      }
    } catch (error) {
      console.error(`Failed to load tip for tag ${tag}`, error)
      setTipMissingForTags((prev) => ({ ...prev, [tip.id]: true }))
    }
  }

  // Handle adding new tip
  const handleAddTip = async () => {
    if (!newTip.content.trim() && !newTip.imageUrl.trim() && !newTip.embedUrl.trim()) {
      return
    }

    const cleanedCustomId = sanitizeCustomId(newTip.customId)
    const payload = {
      id: uuidv4(),
      title: newTip.title.trim(),
      content: newTip.content.trim(),
      customId: cleanedCustomId || undefined,
      imageUrl: newTip.imageUrl.trim() || undefined,
      adminOnly: newTip.adminOnly,
      canUseInBriefing: newTip.canUseInBriefing,
      unlisted: newTip.unlisted,
      isHtml: newTip.type === "html",
      altText: newTip.altText.trim() || undefined,
      type: newTip.type,
      embedUrl: newTip.embedUrl.trim() || undefined,
    }

    const targetTag = newTipTargetTag || activeTag

    try {
      if (targetTag === activeTag) {
        addTip(payload)
      } else {
        await saveTipForTag(targetTag, payload)
        clearConfigCache()
        toast({
          title: "Tip added",
          description: `Added tip to ${targetTag} without switching tags.`,
          variant: "success",
        })
      }
      resetAddForm()
    } catch (error) {
      console.error("Failed to add tip", error)
      toast({
        title: "Add failed",
        description: "Could not add the tip for the selected tag.",
        variant: "destructive",
      })
    }
  }

  const openFullScreenImage = (url: string) => {
    if (!url) return
    setFullScreenImage(url)
  }

  const handleBackdropClick = () => {
    setFullScreenImage(null)
  }

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

      {/* Add new tip form */}
      {showAddForm && (
        <Card>
          <CardContent className="p-4">
            <div className="space-y-2">
              {availableAdminTags.length > 1 && (
                <div className="space-y-1">
                  <Label className="flex items-center gap-2 text-xs">Add to tag</Label>
                  <Select value={newTipTargetTag} onValueChange={setNewTipTargetTag}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {availableAdminTags.map((tag) => (
                        <SelectItem key={tag} value={tag}>
                          {tag}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    New tip is saved to the selected tag without switching Command mode.
                  </p>
                </div>
              )}

              <TipFormFields
                idPrefix="new-tip"
                values={newTip}
                onValuesChange={(nextValues) =>
                  setNewTip((prev) => {
                    const currentValues: TipFormFieldsState = {
                      title: prev.title,
                      content: prev.content,
                      customId: prev.customId,
                      imageUrl: prev.imageUrl,
                      type: prev.type,
                      embedUrl: prev.embedUrl,
                    }
                    if (areTipFormValuesEqual(currentValues, nextValues) && prev.isHtml === (nextValues.type === "html")) {
                      return prev
                    }
                    return {
                      ...prev,
                      ...nextValues,
                      isHtml: nextValues.type === "html",
                    }
                  })
                }
                sanitizeCustomId={sanitizeCustomId}
                contentPlaceholder="Enter tip content..."
                contentMinHeightClass="min-h-[120px]"
                showEmbedHint
                showEmbedPreview
                debounceMs={3000}
              />

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={resetAddForm}>
                  Cancel
                </Button>
                <Button onClick={handleAddTip}>
                  <Plus className="mr-2 h-4 w-4" /> Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search tips..."
          className="pl-8 pr-8"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
        {searchTerm && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-0 top-0 h-9 w-9"
            onClick={() => setSearchTerm("")}
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Tips list */}
      <div className="space-y-2">
        {filteredTips.length > 0 ? (
          <>
            {filteredTips.map((tip) => {
              const overrideInfo = tipOverrideIndex[tip.id]
              const overrideKeys = overrideInfo?.overrideKeys ?? []
              const overrideKeySet = new Set(overrideKeys)
              const hasOverrides = overrideKeys.length > 0
              const renderOverridePill = (keys: string | string[]) => {
                const list = Array.isArray(keys) ? keys : [keys]
                return list.some((key) => overrideKeySet.has(key)) ? (
                  <span className="rounded border border-border bg-muted/60 px-2 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground dark:bg-muted/40">
                    Overridden
                  </span>
                ) : null
              }
              const isHtmlContent = tip.type === "html" || tip.isHtml
              const draft = editedContent[tip.id]
              return (
                <Card key={tip.id}>
                  <CardContent className="p-4">
                    {!editingTips[tip.id] ? (
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1">
                          {tip.title && <div className="font-medium mb-2">{tip.title}</div>}
                          {tip.content && (
                            <div className={isHtmlContent ? "" : "whitespace-pre-wrap break-words text-sm"}>
                              {isHtmlContent ? (
                                <TipHtmlPreview html={tip.content} />
                              ) : (
                                <div className="whitespace-pre-wrap break-words text-sm">{tip.content}</div>
                              )}
                            </div>
                          )}
                          {!isHtmlContent && tip.imageUrl && (
                            <div className={`${tip.content ? "mt-2" : ""}`}>
                              <div
                                className="relative inline-block cursor-pointer group"
                                onClick={() => openFullScreenImage(tip.imageUrl!)}
                              >
                                <img
                                  src={tip.imageUrl}
                                  alt={tip.title || "Tip image"}
                                  className="max-w-full max-h-[400px] rounded-md border border-border object-contain"
                                  loading="lazy"
                                  onError={(e) => {
                                    ;(e.target as HTMLImageElement).style.display = "none"
                                  }}
                                />
                                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity bg-black/20 rounded-md">
                                  <ZoomIn className="h-6 w-6 text-white drop-shadow-md" />
                                </div>
                              </div>
                            </div>
                          )}
                          {tip.type === "embedded" && tip.embedUrl && (
                            <div className={`${tip.content ? "mt-2" : ""}`}>
                              <EmbeddedContent url={tip.embedUrl} />
                            </div>
                          )}
                          {tip.altText && (
                            <div className="mt-2 text-xs text-muted-foreground italic">Alt text: {tip.altText}</div>
                          )}
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyContent(tip)}
                            className={`${
                              copiedTipId === tip.id
                                ? "text-green-600 hover:text-green-600 hover:bg-green-100"
                                : "text-muted-foreground hover:text-muted-foreground hover:bg-muted/50"
                            }`}
                            title="Copy content to clipboard"
                          >
                            {copiedTipId === tip.id ? <Check size={16} /> : <Copy size={16} />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleCopyLink(tip)}
                            className={`${
                              copiedLinkId === tip.id
                                ? "text-green-600 hover:text-green-600 hover:bg-green-100"
                                : "text-muted-foreground hover:text-muted-foreground hover:bg-muted/50"
                            }`}
                            title="Copy link to this tip"
                          >
                            {copiedLinkId === tip.id ? <Check size={16} /> : <LinkIcon size={16} />}
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => startEditing(tip)}>
                            <Edit2 size={16} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setTipToDelete(tip.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex justify-between items-start gap-2">
                        <div className="flex-1 space-y-2">
                          {hasOverrides && (
                            <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
                              <p className="font-medium">Overridden fields</p>
                              <ul className="mt-1 list-disc space-y-0.5 pl-4">
                                {overrideKeys.map((key) => (
                                  <li key={key}>{formatOverrideKey(key)}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {availableAdminTags.filter((tag) => tag !== activeTag).length > 0 && (
                            <div className="space-y-1">
                              <Label className="flex items-center gap-2 text-xs">Apply changes to tag</Label>
                              <Select
                                value={tipTargetTags[tip.id] ?? activeTag}
                                onValueChange={(value) => handleTipTargetSelection(tip, value)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableAdminTags.map((tag) => (
                                    <SelectItem key={tag} value={tag}>
                                      {tag}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                              <p className="text-[11px] text-muted-foreground">
                                The selected tag receives these edits without leaving Command mode.
                              </p>
                              {tipMissingForTags[tip.id] && (
                                <p className="text-[11px] text-amber-600">
                                  This tip does not exist for the selected tag; saving will create it with the current
                                  content.
                                </p>
                              )}
                            </div>
                          )}
                          <TipFormFields
                            idPrefix={`edit-tip-${tip.id}`}
                            values={{
                              title: draft?.title ?? tip.title ?? "",
                              content: draft?.content ?? tip.content ?? "",
                              customId: draft?.customId ?? tip.customId ?? "",
                              imageUrl: draft?.imageUrl ?? tip.imageUrl ?? "",
                              type: (draft?.type ?? tip.type ?? "text") as TipContentType,
                              embedUrl: draft?.embedUrl ?? tip.embedUrl ?? "",
                            }}
                            onValuesChange={(nextValues) =>
                              setEditedContent((prev) => {
                                const currentValues: TipFormFieldsState = {
                                  title: prev[tip.id]?.title ?? tip.title ?? "",
                                  content: prev[tip.id]?.content ?? tip.content ?? "",
                                  customId: prev[tip.id]?.customId ?? tip.customId ?? "",
                                  imageUrl: prev[tip.id]?.imageUrl ?? tip.imageUrl ?? "",
                                  type: (prev[tip.id]?.type ?? tip.type ?? "text") as TipContentType,
                                  embedUrl: prev[tip.id]?.embedUrl ?? tip.embedUrl ?? "",
                                }
                                if (areTipFormValuesEqual(currentValues, nextValues)) {
                                  return prev
                                }
                                return {
                                  ...prev,
                                  [tip.id]: {
                                    ...prev[tip.id],
                                    ...nextValues,
                                  },
                                }
                              })
                            }
                            renderOverridePill={renderOverridePill}
                            sanitizeCustomId={sanitizeCustomId}
                            debounceMs={3000}
                          />
                          <div className="flex gap-2">
                            <Button onClick={() => saveEditedTip(tip)} size="sm">
                              Save
                            </Button>
                            <Button onClick={() => cancelEditing(tip.id)} variant="outline" size="sm">
                              Cancel
                            </Button>
                          </div>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setTipToDelete(tip.id)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 size={16} />
                          </Button>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )
            })}
          </>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">
                {searchTerm ? "No tips match your search." : "No tips yet. Add your first tip to get started."}
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Delete confirmation dialog */}
      <AlertDialog open={!!tipToDelete} onOpenChange={() => setTipToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Tip</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this tip? This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (tipToDelete) {
                  deleteTip(tipToDelete)
                  setTipToDelete(null)
                }
              }}
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
          <DialogTitle asChild>
            <span className="sr-only">Full-size image view</span>
          </DialogTitle>
          {fullScreenImage && (
            <div className="absolute inset-0 flex items-center justify-center">
              <img
                src={fullScreenImage}
                alt="Full screen view"
                className="max-w-full max-h-full object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}

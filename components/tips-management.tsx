"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { v4 as uuidv4 } from "uuid"

import { useTips } from "@/hooks/use-tips"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Plus, Edit2, Trash2, Copy, Check, X, Search, Link as LinkIcon } from "lucide-react"
import { EmbeddedContent } from "@/components/embedded-content"
import { sanitizeHtml, extractTextFromHtml } from "@/lib/html-utils"
import { matchesSearchTokens, tokenizeSearchTerm } from "@/lib/search-utils"
import { useOverrideDiff } from "@/hooks/use-override-diff"

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
  const { tips, addTip, updateTip, deleteTip } = useTips()

  // State for new tip form
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
    type: "text" as "text" | "html" | "image" | "embedded",
    embedUrl: "",
  })

  const [showAddForm, setShowAddForm] = useState(false)
  const [tipToDelete, setTipToDelete] = useState<string | null>(null)
  const [editingTips, setEditingTips] = useState<Record<string, boolean>>({})
  const [editedContent, setEditedContent] = useState<Record<string, any>>({})
  const [searchTerm, setSearchTerm] = useState("")
  const [copiedTipId, setCopiedTipId] = useState<string | null>(null)
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)
  const { diffIndex } = useOverrideDiff()
  const tipOverrideIndex = diffIndex?.tips ?? {}

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

  // Start editing a tip
  const startEditing = (tip: any) => {
    const inferredType = (
      tip.type ||
      (tip.embedUrl ? "embedded" : tip.isHtml ? "html" : tip.imageUrl ? "image" : "text")
    ) as "text" | "html" | "image" | "embedded"
    setEditingTips((prev) => ({ ...prev, [tip.id]: true }))
    setEditedContent((prev) => ({
      ...prev,
      [tip.id]: {
        title: tip.title || "",
        content: tip.content || "",
        type: inferredType,
        embedUrl: tip.embedUrl || "",
        imageUrl: tip.imageUrl || "",
      },
    }))
  }

  // Save edited tip
  const saveEditedTip = (tip: any) => {
    const edited = editedContent[tip.id]
    if (edited && (edited.content.trim() || edited.embedUrl?.trim())) {
      const nextType = (edited.type || "text") as "text" | "html" | "image" | "embedded"
      updateTip({
        ...tip,
        title: edited.title.trim(),
        content: edited.content.trim(),
        type: nextType,
        isHtml: nextType === "html",
        embedUrl: edited.embedUrl?.trim() || undefined,
        imageUrl: edited.imageUrl?.trim() || undefined,
      })
      setEditingTips(prev => ({ ...prev, [tip.id]: false }))
    }
  }

  // Cancel editing
  const cancelEditing = (tipId: string) => {
    setEditingTips(prev => ({ ...prev, [tipId]: false }))
    setEditedContent(prev => {
      const newState = { ...prev }
      delete newState[tipId]
      return newState
    })
  }

  // Handle content change during editing
  const handleEditContentChange = (tipId: string, field: string, value: string) => {
    setEditedContent(prev => ({
      ...prev,
      [tipId]: {
        ...prev[tipId],
        [field]: value,
      }
    }))
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

    const baseUrl = window.location.href.split("#")[0]
    const linkId = tip.customId || tip.id

    let tipUrl = `${baseUrl}#tip-${linkId}`
    tipUrl = tipUrl.replace(/lwserenity\.com/i, "LWSerenity.com")

    navigator.clipboard.writeText(tipUrl).then(() => {
      setCopiedLinkId(tip.id)
    })
  }

  // Handle adding new tip
  const handleAddTip = () => {
    if (newTip.content.trim() || newTip.imageUrl.trim() || newTip.embedUrl.trim()) {
      addTip({
        id: uuidv4(),
        title: newTip.title.trim(),
        content: newTip.content.trim(),
        customId: newTip.customId.trim() || undefined,
        imageUrl: newTip.imageUrl.trim() || undefined,
      adminOnly: newTip.adminOnly,
      canUseInBriefing: newTip.canUseInBriefing,
      unlisted: newTip.unlisted,
      isHtml: newTip.type === "html",
      altText: newTip.altText.trim() || undefined,
      type: newTip.type,
      embedUrl: newTip.embedUrl.trim() || undefined,
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
        type: "text" as "text" | "html" | "image" | "embedded",
        embedUrl: "",
      })
      setShowAddForm(false)
    }
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
            <div className="space-y-4">
              <div>
                <Label htmlFor="new-tip-title">Title</Label>
                <Input
                  id="new-tip-title"
                  value={newTip.title}
                  onChange={(e) => setNewTip((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter a title..."
                />
              </div>

              <div>
                <Label>Content Type</Label>
                <Select
                  value={newTip.type}
                  onValueChange={(value) =>
                    setNewTip((prev) => ({
                      ...prev,
                      type: value as "text" | "html" | "image" | "embedded",
                      isHtml: value === "html",
                    }))
                  }
                >
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
              </div>

              {newTip.type === "embedded" && (
                <div>
                  <Label htmlFor="new-tip-embed-url">Embed URL</Label>
                  <Input
                    id="new-tip-embed-url"
                    value={newTip.embedUrl}
                    onChange={(e) => setNewTip((prev) => ({ ...prev, embedUrl: e.target.value }))}
                    placeholder="/server_birthday.html"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Enter a relative URL to HTML content (e.g., /server_birthday.html)
                  </p>
                </div>
              )}

              {newTip.type === "embedded" && newTip.embedUrl && (
                <div>
                  <Label>Preview</Label>
                  <EmbeddedContent url={newTip.embedUrl} className="mt-2" />
                </div>
              )}

              <div>
                <Label htmlFor="new-tip-image-url">Image URL</Label>
                <Input
                  id="new-tip-image-url"
                  value={newTip.imageUrl}
                  onChange={(e) => setNewTip((prev) => ({ ...prev, imageUrl: e.target.value }))}
                  placeholder="https://example.com/image.jpg"
                />
              </div>

              {newTip.imageUrl && (
                <div>
                  <Label>Image Preview</Label>
                  <div className="mt-2">
                    <img
                      src={newTip.imageUrl}
                      alt={newTip.title || "Tip preview image"}
                      className="max-h-48 rounded border border-border object-contain"
                      onError={(e) => {
                        ;(e.target as HTMLImageElement).style.display = "none"
                      }}
                    />
                  </div>
                </div>
              )}

              {newTip.type !== "embedded" && (
                <div>
                  <Label htmlFor="new-tip-content">Content</Label>
                  <Textarea
                    id="new-tip-content"
                    value={newTip.content}
                    onChange={(e) => setNewTip((prev) => ({ ...prev, content: e.target.value }))}
                    placeholder="Enter tip content..."
                    className="min-h-[120px]"
                  />
                </div>
              )}

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
                      type: "text" as "text" | "html" | "image" | "embedded",
                      embedUrl: "",
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
                  <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800">
                    Override
                  </span>
                ) : null
              }
              const isHtmlContent = tip.type === "html" || tip.isHtml
              const draft = editedContent[tip.id]
              const currentImageUrl = draft?.imageUrl ?? tip.imageUrl ?? ""
              return (
                <Card key={tip.id}>
                  <CardContent className="p-4">
                    <div className="flex justify-between items-start gap-2">
                      <div className="flex-1">
                      {!editingTips[tip.id] ? (
                        <>
                          {tip.title && (
                            <div className="font-medium mb-2 flex items-center gap-2">
                              {tip.title}
                              {hasOverrides && (
                                <Badge variant="secondary" className="text-amber-900 bg-amber-100 border-amber-200">
                                  Overrides
                                </Badge>
                              )}
                            </div>
                          )}
                          {tip.type === "embedded" && (
                            <span className="px-2 py-0.5 bg-green-100 text-green-800 rounded-full text-xs mb-2 inline-block">
                              Embedded
                            </span>
                          )}
                          {tip.type === "embedded" && tip.embedUrl && (
                            <div className="mt-2">
                              <EmbeddedContent url={tip.embedUrl} />
                            </div>
                          )}
                          {tip.content && tip.type !== "embedded" && (
                            <div className="py-1">
                              {isHtmlContent ? (
                                <TipHtmlPreview html={tip.content} />
                              ) : (
                                <div className="whitespace-pre-wrap break-words text-sm">{tip.content}</div>
                              )}
                            </div>
                          )}
                          {tip.imageUrl && (
                            <div className={`${tip.content ? "mt-2" : ""}`}>
                              <img
                                src={tip.imageUrl}
                                alt={tip.title || "Tip image"}
                                className="max-h-48 rounded border border-border object-contain"
                                loading="lazy"
                                onError={(e) => {
                                  ;(e.target as HTMLImageElement).style.display = "none"
                                }}
                              />
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2">
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
                          <div>
                            <Label className="flex items-center gap-2">
                              Title
                              {renderOverridePill("title")}
                            </Label>
                            <Input
                              value={draft?.title ?? tip.title ?? ""}
                              onChange={(e) => handleEditContentChange(tip.id, "title", e.target.value)}
                              placeholder="Enter title..."
                            />
                          </div>
                          
                          <div>
                            <Label className="flex items-center gap-2">
                              Content Type
                              {renderOverridePill("type")}
                            </Label>
                            <Select
                              value={draft?.type ?? tip.type ?? "text"}
                              onValueChange={(value) => handleEditContentChange(tip.id, "type", value)}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="text">Text</SelectItem>
                                <SelectItem value="html">HTML</SelectItem>
                                <SelectItem value="image">Image</SelectItem>
                                <SelectItem value="embedded">Embedded Content</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>

                          <div>
                            <Label className="flex items-center gap-2">
                              Image URL
                              {renderOverridePill("imageUrl")}
                            </Label>
                            <Input
                              value={draft?.imageUrl ?? tip.imageUrl ?? ""}
                              onChange={(e) => handleEditContentChange(tip.id, "imageUrl", e.target.value)}
                              placeholder="https://example.com/image.jpg"
                            />
                          </div>

                          {currentImageUrl && (
                            <div>
                              <Label>Image Preview</Label>
                              <div className="mt-2">
                                <img
                                  src={currentImageUrl}
                                  alt={draft?.title || tip.title || "Tip image"}
                                  className="max-h-48 rounded border border-border object-contain"
                                />
                              </div>
                            </div>
                          )}

                          {(draft?.type ?? tip.type) === "embedded" && (
                            <div>
                              <Label className="flex items-center gap-2">
                                Embed URL
                                {renderOverridePill("embedUrl")}
                              </Label>
                              <Input
                                value={draft?.embedUrl ?? tip.embedUrl ?? ""}
                                onChange={(e) => handleEditContentChange(tip.id, "embedUrl", e.target.value)}
                                placeholder="/server_birthday.html"
                              />
                            </div>
                          )}

                          {(draft?.type ?? tip.type) !== "embedded" && (
                            <div>
                              <Label className="flex items-center gap-2">
                                Content
                                {renderOverridePill("content")}
                              </Label>
                              <Textarea
                                value={draft?.content ?? tip.content ?? ""}
                                onChange={(e) => handleEditContentChange(tip.id, "content", e.target.value)}
                                placeholder="Enter content..."
                                className="min-h-[100px]"
                              />
                            </div>
                          )}

                          <div className="flex gap-2">
                            <Button onClick={() => saveEditedTip(tip)} size="sm">
                              Save
                            </Button>
                            <Button onClick={() => cancelEditing(tip.id)} variant="outline" size="sm">
                              Cancel
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                    <div className="flex gap-1">
                      {!editingTips[tip.id] && (
                        <>
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
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => startEditing(tip)}
                          >
                            <Edit2 size={16} />
                          </Button>
                        </>
                      )}
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
    </div>
  )
}

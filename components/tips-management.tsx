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
import { Plus, Edit2, Trash2, Copy, Check, X, Search } from "lucide-react"
import { EmbeddedContent } from "@/components/embedded-content"
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

  // Filter tips based on search
  const filteredTips = tips.filter(tip => {
    if (!searchTerm) return true
    const lowerSearch = searchTerm.toLowerCase()
    return (
      tip.title?.toLowerCase().includes(lowerSearch) ||
      tip.content?.toLowerCase().includes(lowerSearch) ||
      tip.customId?.toLowerCase().includes(lowerSearch)
    )
  })

  // Start editing a tip
  const startEditing = (tip: any) => {
    setEditingTips(prev => ({ ...prev, [tip.id]: true }))
    setEditedContent(prev => ({
      ...prev,
      [tip.id]: {
        title: tip.title || "",
        content: tip.content || "",
        type: tip.type || "text",
        embedUrl: tip.embedUrl || "",
      }
    }))
  }

  // Save edited tip
  const saveEditedTip = (tip: any) => {
    const edited = editedContent[tip.id]
    if (edited && (edited.content.trim() || edited.embedUrl?.trim())) {
      updateTip({
        ...tip,
        title: edited.title.trim(),
        content: edited.content.trim(),
        type: edited.type,
        embedUrl: edited.embedUrl?.trim() || undefined,
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

  // Handle adding new tip
  const handleAddTip = () => {
    if (newTip.content.trim() || newTip.imageUrl.trim() || newTip.embedUrl.trim()) {
      addTip({
        id: uuidv4(),
        title: newTip.title.trim(),
        content: newTip.content.trim(),
        lastUsed: null,
        customId: newTip.customId.trim() || undefined,
        imageUrl: newTip.imageUrl.trim() || undefined,
        adminOnly: newTip.adminOnly,
        canUseInBriefing: newTip.canUseInBriefing,
        unlisted: newTip.unlisted,
        isHtml: newTip.isHtml,
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
                  onValueChange={(value) => setNewTip((prev) => ({ ...prev, type: value as "text" | "html" | "image" | "embedded" }))}
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
            {filteredTips.map((tip) => (
              <Card key={tip.id}>
                <CardContent className="p-4">
                  <div className="flex justify-between items-start gap-2">
                    <div className="flex-1">
                      {!editingTips[tip.id] ? (
                        <>
                          {tip.title && <div className="font-medium mb-2">{tip.title}</div>}
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
                            <div className="py-1 whitespace-pre-wrap break-words text-sm">
                              {tip.content}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2">
                          <div>
                            <Label>Title</Label>
                            <Input
                              value={editedContent[tip.id]?.title || ""}
                              onChange={(e) => handleEditContentChange(tip.id, "title", e.target.value)}
                              placeholder="Enter title..."
                            />
                          </div>
                          
                          <div>
                            <Label>Content Type</Label>
                            <Select
                              value={editedContent[tip.id]?.type || "text"}
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

                          {editedContent[tip.id]?.type === "embedded" && (
                            <div>
                              <Label>Embed URL</Label>
                              <Input
                                value={editedContent[tip.id]?.embedUrl || ""}
                                onChange={(e) => handleEditContentChange(tip.id, "embedUrl", e.target.value)}
                                placeholder="/server_birthday.html"
                              />
                            </div>
                          )}

                          {editedContent[tip.id]?.type !== "embedded" && (
                            <div>
                              <Label>Content</Label>
                              <Textarea
                                value={editedContent[tip.id]?.content || ""}
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
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => startEditing(tip)}
                        >
                          <Edit2 size={16} />
                        </Button>
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
            ))}
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
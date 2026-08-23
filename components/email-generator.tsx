/**
 * Email Generator Component
 *
 * This component provides the email generation functionality in a tab view
 * rather than a dialog. It allows users to generate an email with events
 * from a selected date range.
 */
"use client"

import type React from "react"

import { useState, useEffect, useRef, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DateRangeSelector } from "@/components/date-range-selector"
import { useEvents } from "@/hooks/use-events"
import { useEffectiveEventLayers } from "@/hooks/use-date-events"
import { useTips } from "@/hooks/use-tips"
import {
  addAppDays,
  formatInAppTimezone,
  getAppToday,
  getEndOfAppDay,
} from "@/lib/date-utils"
import { Copy, Check, RefreshCw } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
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
import { Checkbox } from "@/components/ui/checkbox"
import { scopedLocalStorage } from "@/lib/scoped-storage"
import { matchesSearchTokens, tokenizeSearchTerm } from "@/lib/search-utils"
import { formatIndentedDescription, generateAgendaFromLayers } from "@/lib/serenity-engine/reports/agenda"

interface EmailGeneratorProps {
  initialDateRange?: [Date | undefined, Date | undefined]
}

export function EmailGenerator({ initialDateRange }: EmailGeneratorProps) {
  // Access events and tips from stores
  const { events } = useEvents()
  const effectiveEventLayers = useEffectiveEventLayers()
  const { tips, updateTip } = useTips()

  // State for date range - default to today + next two days in UTC-2
  const [dateRange, setDateRange] = useState<[Date | undefined, Date | undefined]>(() => {
    if (initialDateRange?.[0] && initialDateRange?.[1]) {
      return initialDateRange
    }

    const today = getAppToday()
    const threeDayEnd = getEndOfAppDay(addAppDays(today, 2))
    return [today, threeDayEnd] // Default to a three-day window (today + next 2 days) in UTC-2
  })

  // State for selected tip
  const [selectedTip, setSelectedTip] = useState<string | null>(null)

  // State for generated email content
  const [agendaContent, setAgendaContent] = useState("")

  // State for tip content (now separate)
  const [tipContent, setTipContent] = useState("")

  // State for tracking user edits to the email content
  const [editedAgendaContent, setEditedAgendaContent] = useState("")

  // State for edited tip content
  const [editedTipContent, setEditedTipContent] = useState("")

  // State for optional header (persisted in localStorage)
  const [headerContent, setHeaderContent] = useState("")

  // State for copy button
  const [copied, setCopied] = useState(false)

  // State for tip search and filter
  const [tipSearchTerm, setTipSearchTerm] = useState("")
  const [tipFilterOption, setTipFilterOption] = useState<"all" | "used" | "unused">("all")
  const tipSearchTokens = tokenizeSearchTerm(tipSearchTerm)

  // State for regeneration dialog
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false)
  const [clearTipOnRegenerate, setClearTipOnRegenerate] = useState(() => {
    const saved = scopedLocalStorage.getItem("daily-agenda-clear-tip-preference")
    return saved ? JSON.parse(saved) : true
  })
  const [rememberDecision, setRememberDecision] = useState(false)

  // Ref to track previous date range for comparison
  const prevDateRangeRef = useRef<[Date | undefined, Date | undefined]>(dateRange)
  
  // Check localStorage for remembered decision
  const rememberedDecision = scopedLocalStorage.getItem("regenerate-agenda-decision")

  /**
   * Format description text with proper indentation for multi-line descriptions
   */
  const formatDescription = useCallback(formatIndentedDescription, [])

  /**
   * Generate agenda content based on selected date range
   */
  const generateAgendaContent = useCallback((alsoUpdateEdited = false) => {
    if (!dateRange[0] || !dateRange[1]) return
    if (!effectiveEventLayers.layers.length) return
    const content = generateAgendaFromLayers({
      layers: effectiveEventLayers.layers,
      localTag: effectiveEventLayers.localTag,
      startDate: formatInAppTimezone(dateRange[0], "yyyy-MM-dd"),
      endDate: formatInAppTimezone(dateRange[1], "yyyy-MM-dd"),
      referenceDate: formatInAppTimezone(getAppToday(), "yyyy-MM-dd"),
    }).content

    setAgendaContent(content)

    // Optionally mirror the generated content into the editable field so we don't show stale text
    if (alsoUpdateEdited) {
      setEditedAgendaContent(content)
    }

    return content
  }, [dateRange, effectiveEventLayers])

  /**
   * Generate tip content based on selected tip
   */
  const generateTipContent = useCallback(() => {
    if (!selectedTip) return

    const tip = tips.find((t) => t.id === selectedTip)
    if (tip) {
      let content = "Tip of the Day: " + (tip.title || "") + "\n"

      // Format the tip content with proper indentation
      const formattedTipContent = formatDescription(tip.content)
      content += formattedTipContent

      setTipContent(content)

      // Update tip's last used date
      updateTip({
        ...tip,
        lastUsed: formatInAppTimezone(new Date(), "yyyy-MM-dd'T'HH:mm:ssXXX"),
      })
    }
  }, [formatDescription, selectedTip, tips, updateTip])

  // Load persisted content from localStorage on initial render
  useEffect(() => {
    const savedHeader = scopedLocalStorage.getItem("email-header")
    if (savedHeader) {
      setHeaderContent(savedHeader)
    }

    const savedAgenda = scopedLocalStorage.getItem("email-content")
    if (savedAgenda) {
      setEditedAgendaContent(savedAgenda)
    }

    const savedTip = scopedLocalStorage.getItem("tip-content")
    if (savedTip) {
      setEditedTipContent(savedTip)
    }
  }, [])

  // Save header content to localStorage whenever it changes
  useEffect(() => {
    scopedLocalStorage.setItem("email-header", headerContent)
  }, [headerContent])

  // Save agenda content to localStorage whenever it changes
  useEffect(() => {
    scopedLocalStorage.setItem("email-content", editedAgendaContent)
  }, [editedAgendaContent])

  // Save tip content to localStorage whenever it changes
  useEffect(() => {
    scopedLocalStorage.setItem("tip-content", editedTipContent)
  }, [editedTipContent])

  // Save clear tip preference to localStorage
  useEffect(() => {
    scopedLocalStorage.setItem("daily-agenda-clear-tip-preference", JSON.stringify(clearTipOnRegenerate))
  }, [clearTipOnRegenerate])

  // Check if date range has changed and show regenerate dialog
  useEffect(() => {
    // Skip on initial render
    const prevStart = prevDateRangeRef.current[0]?.getTime()
    const prevEnd = prevDateRangeRef.current[1]?.getTime()
    const currentStart = dateRange[0]?.getTime()
    const currentEnd = dateRange[1]?.getTime()

    if (
      prevStart !== undefined &&
      prevEnd !== undefined &&
      currentStart !== undefined &&
      currentEnd !== undefined &&
      (prevStart !== currentStart || prevEnd !== currentEnd)
    ) {
      // Check if user has a remembered decision
      if (rememberedDecision === "regenerate") {
        generateAgendaContent(true)
      } else if (rememberedDecision === "keep") {
        // Do nothing, keep current content
      } else {
        // Show dialog if no remembered decision
        setShowRegenerateDialog(true)
      }
    }

    // Update ref with current date range
    prevDateRangeRef.current = dateRange
  }, [agendaContent, dateRange, generateAgendaContent, rememberedDecision])

  // Generate email content when date range changes
  useEffect(() => {
    if (dateRange[0] && dateRange[1]) {
      generateAgendaContent()
    }
  }, [dateRange, events, generateAgendaContent])

  // Update editedAgendaContent whenever agendaContent changes
  useEffect(() => {
    if (agendaContent && !editedAgendaContent) {
      setEditedAgendaContent(agendaContent)
    }
  }, [agendaContent, editedAgendaContent])

  // Update editedTipContent whenever tipContent changes
  useEffect(() => {
    if (tipContent) {
      setEditedTipContent(tipContent)
    }
  }, [tipContent])

  // Generate tip content when selected tip changes
  useEffect(() => {
    if (selectedTip) {
      generateTipContent()
    }
  }, [generateTipContent, selectedTip])

  // Filter tips based on search term and filter option
  const filteredTips = tips.filter((tip) => {
    // First filter by search term
    if (tipSearchTokens.length > 0 && !matchesSearchTokens(tipSearchTokens, [tip.title, tip.content, tip.customId])) {
      return false
    }

    // Filter out tips that can't be used in briefing
    if (tip.canUseInBriefing === false) {
      return false
    }

    // Then filter by usage status
    if (tipFilterOption === "used" && !tip.lastUsed) {
      return false
    }
    if (tipFilterOption === "unused" && tip.lastUsed) {
      return false
    }

    return true
  })

  // Sort tips by last used date (most recent at bottom)
  const sortedTips = [...filteredTips].sort((a, b) => {
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

  // Add a new state for character count after the other state declarations
  const [characterCount, setCharacterCount] = useState(0)

  /**
   * Auto-resize textarea based on content
   */
  const autoResizeTextarea = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const textarea = e.target
    textarea.style.height = "auto"
    textarea.style.height = `${textarea.scrollHeight}px`
  }

  /**
   * Handle copying email content to clipboard
   */
  const handleCopy = () => {
    // Combine header, agenda, and tip content for copying
    let fullContent = ""

    if (headerContent) {
      fullContent += headerContent + "\n\n"
    }

    fullContent += editedAgendaContent

    if (editedTipContent) {
      fullContent += "\n\n" + editedTipContent
    }

    navigator.clipboard.writeText(fullContent).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  // Add a useEffect to calculate character count whenever content changes
  useEffect(() => {
    // Calculate total character count from all content that will be copied
    let fullContent = ""

    if (headerContent) {
      fullContent += headerContent + "\n\n"
    }

    fullContent += editedAgendaContent

    if (editedTipContent) {
      fullContent += "\n\n" + editedTipContent
    }

    setCharacterCount(fullContent.length)
  }, [headerContent, editedAgendaContent, editedTipContent])

  // Add effect to resize textareas when their content changes
  useEffect(() => {
    const resizeTextareas = () => {
      const textareas = document.querySelectorAll("textarea")
      textareas.forEach((textarea) => {
        textarea.style.height = "auto"
        textarea.style.height = `${textarea.scrollHeight}px`
      })
    }

    // Resize on initial render and when content changes
    resizeTextareas()
  }, [headerContent, editedAgendaContent, editedTipContent])

  /**
   * Handle selecting a tip
   */
  const handleSelectTip = (tipId: string) => {
    if (tipId === selectedTip) {
      setSelectedTip(null)
      setTipContent("")
      setEditedTipContent("")
    } else {
      setSelectedTip(tipId)
    }
  }

  /**
   * Format the relative time for last used date
   */
  const formatLastUsed = (lastUsed: string | null) => {
    if (!lastUsed) return "Never used"

    const lastUsedDate = new Date(lastUsed)
    const now = new Date()
    const diffTime = Math.abs(now.getTime() - lastUsedDate.getTime())
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24))

    if (diffDays === 0) return "Used today"
    if (diffDays === 1) return "Used yesterday"
    return `Used ${diffDays} days ago`
  }

  /**
   * Handle changes to the agenda content textarea
   */
  const handleAgendaContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedAgendaContent(e.target.value)
  }

  /**
   * Handle changes to the tip content textarea
   */
  const handleTipContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setEditedTipContent(e.target.value)
  }

  /**
   * Handle changes to the header content textarea
   */
  const handleHeaderChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setHeaderContent(e.target.value)
  }

  /**
   * Handle regenerate button click
   */
  const handleRegenerateAgenda = () => {
    generateAgendaContent(true)
  }

  /**
   * Handle regenerate dialog confirmation
   */
  const handleRegenerateConfirm = () => {
    if (rememberDecision) {
      scopedLocalStorage.setItem("regenerate-agenda-decision", "regenerate")
    }
    generateAgendaContent(true)

    if (clearTipOnRegenerate) {
      setSelectedTip(null)
      setTipContent("")
      setEditedTipContent("")
    }

    setShowRegenerateDialog(false)
    setRememberDecision(false)
  }

  const handleRegenerateCancel = () => {
    if (rememberDecision) {
      scopedLocalStorage.setItem("regenerate-agenda-decision", "keep")
    }
    setShowRegenerateDialog(false)
    setRememberDecision(false)
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="space-y-6">
          {/* Date range selector */}
          <div className="space-y-2 mb-4">
            <DateRangeSelector value={dateRange} onChange={setDateRange} />
          </div>

          <div className="flex justify-between items-center mb-4">
            <div
              className={`text-sm ${
                characterCount > 3000
                  ? "text-destructive font-medium"
                  : characterCount > 2700
                    ? "text-amber-500 font-medium"
                    : "text-muted-foreground"
              }`}
            >
              {characterCount > 3000
                ? `Character limit exceeded: ${characterCount}/3000`
                : characterCount > 2700
                  ? `Approaching limit: ${characterCount}/3000`
                  : `Characters: ${characterCount}/3000`}
            </div>
            <Button onClick={handleCopy} className="flex items-center gap-1">
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied!" : "Finalize and Copy"}
            </Button>
          </div>
          {/* Optional header textarea */}
          <div className="space-y-2">
            <Label htmlFor="email-header">Header</Label>
            <Textarea
              id="email-header"
              value={headerContent}
              onChange={(e) => {
                handleHeaderChange(e)
                autoResizeTextarea(e)
              }}
              placeholder="Add an optional header for your email (e.g., greeting, introduction, etc.)"
              className="min-h-[100px] font-mono text-sm"
              onInput={autoResizeTextarea}
              ref={(el) => {
                if (el) {
                  el.style.height = "auto"
                  el.style.height = `${el.scrollHeight}px`
                }
              }}
            />
          </div>

          {/* Agenda content preview */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <Label htmlFor="agenda-content">Agenda</Label>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerateAgenda}
                  className="flex items-center gap-1"
                  title="Regenerate agenda"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  <span className="sr-only">Regenerate</span>
                </Button>
              </div>
            </div>
            <Textarea
              id="agenda-content"
              value={editedAgendaContent}
              onChange={(e) => {
                handleAgendaContentChange(e)
                autoResizeTextarea(e)
              }}
              className="min-h-[300px] font-mono text-sm"
              onInput={autoResizeTextarea}
              ref={(el) => {
                if (el) {
                  el.style.height = "auto"
                  el.style.height = `${el.scrollHeight}px`
                }
              }}
            />
          </div>

          {/* Tip content textarea */}
          <div className="space-y-2">
            <Label htmlFor="tip-content">Tip of the Day</Label>
            <Textarea
              id="tip-content"
              value={editedTipContent}
              onChange={(e) => {
                handleTipContentChange(e)
                autoResizeTextarea(e)
              }}
              placeholder="Select a tip below to include it here"
              className="min-h-[150px] font-mono text-sm"
              onInput={autoResizeTextarea}
              ref={(el) => {
                if (el) {
                  el.style.height = "auto"
                  el.style.height = `${el.scrollHeight}px`
                }
              }}
            />
          </div>

          {/* Tip selector */}
          <div className="space-y-4">
            <Label>Select a Tip</Label>

            {/* Tip search and filter */}
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative flex-1">
                <Input
                  type="search"
                  placeholder="Search tips..."
                  value={tipSearchTerm}
                  onChange={(e) => setTipSearchTerm(e.target.value)}
                  className="w-full"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  variant={tipFilterOption === "all" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTipFilterOption("all")}
                  className="whitespace-nowrap"
                >
                  All Tips
                </Button>
                <Button
                  variant={tipFilterOption === "used" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTipFilterOption("used")}
                  className="whitespace-nowrap"
                >
                  Used
                </Button>
                <Button
                  variant={tipFilterOption === "unused" ? "default" : "outline"}
                  size="sm"
                  onClick={() => setTipFilterOption("unused")}
                  className="whitespace-nowrap"
                >
                  Unused
                </Button>
              </div>
            </div>

            {sortedTips.length > 0 && (
              <div className="text-sm text-muted-foreground">
                Showing {sortedTips.length} of {tips.length} tips
              </div>
            )}

            {/* Tips list */}
            <div className="rounded-md border">
              <div className="p-4 space-y-2">
                {sortedTips.map((tip) => (
                  <Card
                    key={tip.id}
                    className={`cursor-pointer transition-colors ${
                      selectedTip === tip.id ? "border-primary bg-primary/5" : ""
                    }`}
                    onClick={() => handleSelectTip(tip.id)}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start gap-2 mb-2">
                        <div className="text-sm font-medium">
                          {selectedTip === tip.id && (
                            <Badge variant="outline" className="mb-2">
                              Selected
                            </Badge>
                          )}
                          {tip.title}
                        </div>
                        <div className="text-xs text-muted-foreground">{formatLastUsed(tip.lastUsed)}</div>
                      </div>
                      <div className="whitespace-pre-wrap break-words text-sm">{tip.content}</div>
                    </CardContent>
                  </Card>
                ))}
                {sortedTips.length === 0 && (
                  <div className="text-center py-4 text-muted-foreground">
                    {tips.length === 0 ? "No tips available." : `No tips found matching your criteria.`}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Regenerate Dialog */}
      <AlertDialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Regenerate Agenda?</AlertDialogTitle>
            <AlertDialogDescription>
              The date range has changed. Would you like to regenerate the agenda content?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-3 py-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="clear-tip"
                checked={clearTipOnRegenerate}
                onCheckedChange={(checked) => setClearTipOnRegenerate(!!checked)}
              />
              <Label htmlFor="clear-tip">Also clear the tip of the day</Label>
            </div>
            <div className="flex items-center space-x-2">
              <Checkbox
                id="remember-decision"
                checked={rememberDecision}
                onCheckedChange={(checked) => setRememberDecision(!!checked)}
              />
              <Label htmlFor="remember-decision">Remember this decision</Label>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleRegenerateCancel}>Keep Current Content</AlertDialogCancel>
            <AlertDialogAction onClick={handleRegenerateConfirm}>Regenerate</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export default EmailGenerator

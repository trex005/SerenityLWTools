"use client"

import type React from "react"

import { useConfigData } from "@/hooks/use-config-data"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search, X, Copy, Check, Link, Loader2, ZoomIn, ChevronDown } from "lucide-react"
import { useState, useEffect, useRef } from "react"
import { useDebounce } from "@/hooks/use-debounce"
import { useAdminState } from "@/hooks/use-admin-state"
import { Dialog, DialogContent } from "@/components/ui/dialog"

// Add these imports at the top
import { sanitizeHtml, extractTextFromHtml } from "@/lib/html-utils"
import { useInView } from "react-intersection-observer"

// Add a new prop to force the component to check for tip ID in URL
export function ReadOnlyTips({ forceRefresh }: { forceRefresh?: string }) {
  const { tips, isLoaded, reload } = useConfigData()
  const { isAdmin } = useAdminState() // Add this line to get admin state

  // State for search term
  const [searchTerm, setSearchTerm] = useState("")
  const debouncedSearchTerm = useDebounce(searchTerm, 300)

  // Add state for tracking copied tip
  const [copiedTipId, setCopiedTipId] = useState<string | null>(null)

  // Add state for tracking copied link
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)

  // Add state for highlighted tip (from URL)
  const [highlightedTipId, setHighlightedTipId] = useState<string | null>(null)

  // Add a new state to track the tip that should be at the top
  const [topTipId, setTopTipId] = useState<string | null>(null)

  // Add state to track if we're processing a hash
  const [processingHash, setProcessingHash] = useState(false)

  // State for full-screen image viewing
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null)

  // Add state for image dimensions
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 })

  // Add state to track whether to show all tips or just the linked one
  const [showAllTips, setShowAllTips] = useState(false)

  // Create refs for each tip card
  const tipRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Keep track of whether we've processed the hash
  const hashProcessedRef = useRef(false)

  const [filterOption, setFilterOption] = useState<"all" | "used" | "unused">("all")

  // Filter tips based on search term and filter option
  const filteredTips = tips.filter((tip) => {
    // First filter out admin-only tips if not admin
    if (tip.adminOnly && !isAdmin) {
      return false
    }

    // Filter out unlisted tips unless they match the topTipId or user is admin
    if (tip.unlisted && !isAdmin && tip.id !== topTipId) {
      return false
    }

    // Then filter by search term
    if (debouncedSearchTerm) {
      const searchLower = debouncedSearchTerm.toLowerCase()
      // Check title (with null/undefined protection)
      const titleMatch = tip.title ? tip.title.toLowerCase().includes(searchLower) : false
      // Check content (with null/undefined protection)
      const contentMatch = tip.content ? tip.content.toLowerCase().includes(searchLower) : false
      // Check customId (with null/undefined protection)
      const customIdMatch = tip.customId ? tip.customId.toLowerCase().includes(searchLower) : false

      // Return false if no matches found
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

  // Sort the displayed tips with the top tip first
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

  // Reset copied states after delay
  useEffect(() => {
    if (copiedTipId) {
      const timer = setTimeout(() => {
        setCopiedTipId(null)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [copiedTipId])

  useEffect(() => {
    if (copiedLinkId) {
      const timer = setTimeout(() => {
        setCopiedLinkId(null)
      }, 2000)
      return () => clearTimeout(timer)
    }
  }, [copiedLinkId])

  // Function to process the hash and highlight the tip
  const processHash = () => {
    if (typeof window === "undefined") return

    const hash = window.location.hash
    if (!hash || !hash.startsWith("#tip-")) {
      // If there's no hash, show all tips
      setShowAllTips(true)
      return
    }

    // If there is a hash, only show the linked tip initially
    setShowAllTips(false)
    setProcessingHash(true)

    // Force reload the data if needed
    if (!isLoaded || tips.length === 0) {
      console.log("Reloading data for hash processing...")
      reload(true).catch(console.error)
    }

    const tipId = hash.substring(5) // Remove '#tip-' prefix
    console.log(`Processing hash for tip: ${tipId}`)

    // Find the tip by customId first, then by id
    const tipWithCustomId = tips.find((tip) => tip.customId === tipId)
    const tipWithId = tips.find((tip) => tip.id === tipId)

    // Set the highlighted tip ID to the actual tip ID (not the custom ID)
    if (tipWithCustomId) {
      setHighlightedTipId(tipWithCustomId.id)
      setTopTipId(tipWithCustomId.id) // Set this tip to appear at the top
    } else if (tipWithId) {
      setHighlightedTipId(tipWithId.id)
      setTopTipId(tipWithId.id) // Set this tip to appear at the top
    } else {
      setHighlightedTipId(tipId)
      setTopTipId(tipId) // Set this tip to appear at the top
    }

    // Scroll to the tip after a short delay to ensure it's rendered
    setTimeout(() => {
      // Try to find the element by ID first
      let tipElement = document.getElementById(`tip-${tipId}`)

      // If not found and we have a tip with custom ID, try the actual ID
      if (!tipElement && tipWithCustomId) {
        tipElement = document.getElementById(`tip-${tipWithCustomId.id}`)
      }

      if (tipElement) {
        tipElement.scrollIntoView({ behavior: "smooth", block: "start" })
        tipElement.classList.add("border-primary", "bg-primary/5")

        // Remove highlight after a few seconds
        setTimeout(() => {
          tipElement.classList.remove("border-primary", "bg-primary/5")
        }, 3000)
      } else {
        console.warn(`Tip element not found for ID: ${tipId}`)
      }

      setProcessingHash(false)
    }, 500)
  }

  // Process hash when component mounts or when forceRefresh changes
  useEffect(() => {
    // Reset the hash processed flag when forceRefresh changes
    if (forceRefresh) {
      hashProcessedRef.current = false
    }

    // Process the hash if we have data
    if (isLoaded && tips.length > 0) {
      processHash()
    }
  }, [forceRefresh, isLoaded, tips])

  // Handle copying tip content to clipboard
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

  // Handle copying link to tip
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

  // Add a component for lazy-loaded HTML content
  const LazyHtmlContent = ({ content }: { content: string }) => {
    const { ref, inView } = useInView({
      triggerOnce: true,
      rootMargin: "200px 0px", // Load when within 200px of viewport
    })

    // Process the HTML to add lazy loading to images and defer video loading
    const processHtml = (html: string): string => {
      if (typeof window === "undefined") return html

      const tempDiv = document.createElement("div")
      tempDiv.innerHTML = html

      // Add lazy loading to all images
      const images = tempDiv.querySelectorAll("img")
      images.forEach((img) => {
        if (!img.hasAttribute("loading")) {
          img.setAttribute("loading", "lazy")
        }
        // Add class for styling and data attribute for click handling
        img.classList.add("expandable-image")
        img.setAttribute("data-expandable", "true")
      })

      // Add preload="none" to all videos
      const videos = tempDiv.querySelectorAll("video")
      videos.forEach((video) => {
        if (!video.hasAttribute("preload")) {
          video.setAttribute("preload", "none")
        }

        // Add poster if not present
        if (!video.hasAttribute("poster") && video.querySelector("source")) {
          const source = video.querySelector("source")
          if (source && source.src) {
            // Try to create a poster from the video URL by changing extension to jpg
            const posterUrl = source.src.replace(/\.(mp4|webm|ogg)$/, ".jpg")
            video.setAttribute("poster", posterUrl)
          }
        }

        // Add click-to-play functionality
        video.setAttribute("data-lazy", "true")
      })

      return tempDiv.innerHTML
    }

    // Only process the HTML when it comes into view
    const processedHtml = inView ? processHtml(sanitizeHtml(content)) : ""

    return (
      <div ref={ref} className="html-content">
        {inView ? (
          <div
            dangerouslySetInnerHTML={{ __html: processedHtml }}
            className="html-content-inner"
            onClick={(e) => {
              // Handle click-to-play for videos
              const target = e.target as HTMLElement
              const video = target.closest('video[data-lazy="true"]') as HTMLVideoElement
              if (video) {
                video.removeAttribute("data-lazy")
                video.load()
                video.play().catch((err) => console.log("Video playback error:", err))
              }

              // Handle expandable images
              if (target.tagName === "IMG" && target.getAttribute("data-expandable") === "true") {
                e.preventDefault()
                e.stopPropagation()
                openFullScreenImage(target.getAttribute("src") || "")
              }
            }}
          />
        ) : (
          <div className="h-20 flex items-center justify-center bg-muted/20 rounded-md">
            <span className="text-muted-foreground text-sm">Loading content...</span>
          </div>
        )}
      </div>
    )
  }

  // Add this after the LazyHtmlContent component
  useEffect(() => {
    // Add CSS for expandable images
    if (typeof window !== "undefined") {
      const style = document.createElement("style")
      style.innerHTML = `
      .html-content img.expandable-image {
        cursor: pointer;
        transition: transform 0.2s ease;
        max-width: 100%;
        max-height: 400px;
        border-radius: 0.375rem;
        border: 1px solid var(--border);
      }
      .html-content img.expandable-image:hover {
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
        {processingHash && (
          <div className="flex items-center text-muted-foreground">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            <span className="text-sm">Loading tip...</span>
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search tips..."
          className="pl-8 pr-8"
          value={searchTerm}
          onChange={(e) => {
            setSearchTerm(e.target.value)
            // Show all tips when searching
            if (e.target.value) {
              setShowAllTips(true)
            }
          }}
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

      {debouncedSearchTerm && (
        <div className="text-sm text-muted-foreground">
          Showing {filteredTips.length} of {tips.length} tips
        </div>
      )}

      {/* Tips list */}
      <div className="space-y-2">
        {!isLoaded ? (
          <div className="text-center py-8 flex flex-col items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-2" />
            <p className="text-muted-foreground">Loading tips...</p>
          </div>
        ) : sortedTips.length > 0 ? (
          <>
            {sortedTips.map((tip) => (
              <Card
                key={tip.id}
                ref={(el) => (tipRefs.current[tip.id] = el)}
                className={`transition-colors duration-300 ${highlightedTipId === tip.id ? "border-primary bg-primary/5" : ""}`}
                id={`tip-${tip.id}`}
              >
                <CardContent className="p-4">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      {tip.title && <div className="font-medium mb-2">{tip.title}</div>}
                      {tip.content && (
                        <div className={tip.isHtml ? "" : "whitespace-pre-wrap break-words text-sm"}>
                          {tip.isHtml ? (
                            <LazyHtmlContent content={tip.content} />
                          ) : (
                            <div className="whitespace-pre-wrap break-words text-sm">{tip.content}</div>
                          )}
                        </div>
                      )}
                      {!tip.isHtml && tip.imageUrl && (
                        <div className={`${tip.content ? "mt-2" : ""}`}>
                          <div
                            className="relative inline-block cursor-pointer group"
                            onClick={() => openFullScreenImage(tip.imageUrl!)}
                          >
                            <img
                              src={tip.imageUrl || "/placeholder.svg"}
                              alt={tip.title || "Tip illustration"}
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
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopyTip(tip.id, tip.content, tip.title, tip.isHtml, tip.altText)}
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
                    </div>
                  </div>
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
            {tips.length === 0 ? "No tips available." : `No tips found matching your criteria.`}
          </div>
        )}
      </div>

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
    </div>
  )
}

"use client"

import React, { useState, useEffect, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Loader2, AlertTriangle } from "lucide-react"

interface EmbeddedContentProps {
  url: string
  className?: string
}

/**
 * Validates that a URL is safe for embedding
 * Only allows relative URLs from the same origin
 */
function validateEmbedUrl(url: string): { isValid: boolean; error?: string } {
  // Check if URL is empty
  if (!url.trim()) {
    return { isValid: false, error: "URL cannot be empty" }
  }

  // Must start with / (relative URL)
  if (!url.startsWith("/")) {
    return { isValid: false, error: "URL must be relative (start with /)" }
  }

  // Prevent path traversal
  if (url.includes("..") || url.includes("./")) {
    return { isValid: false, error: "Path traversal not allowed" }
  }

  // Only allow reasonable lengths
  if (url.length > 200) {
    return { isValid: false, error: "URL too long" }
  }

  // Only allow safe file extensions
  const allowedExtensions = [".html", ".htm"]
  const hasValidExtension = allowedExtensions.some(ext => url.toLowerCase().endsWith(ext))
  if (!hasValidExtension) {
    return { isValid: false, error: "Only HTML files are allowed" }
  }

  // No query parameters or fragments for simplicity
  if (url.includes("?") || url.includes("#")) {
    return { isValid: false, error: "Query parameters and fragments not allowed" }
  }

  return { isValid: true }
}

/**
 * Processes HTML content for safe embedding with CSS isolation and script extraction
 */
function processEmbeddedHtmlWithScripts(html: string, scopeId: string): { processedHtml: string; extractedScripts: string[] } {
  // Create a temporary DOM to parse the HTML
  const parser = new DOMParser()
  const doc = parser.parseFromString(html, "text/html")

  // Extract content from body (or entire document if no body)
  const bodyContent = doc.body || doc.documentElement

  // Get all style elements and scope their CSS
  const styles = Array.from(doc.querySelectorAll("style"))
  let scopedCss = ""

  styles.forEach(style => {
    let css = style.textContent || ""
    
    // Simple CSS scoping - prepend each selector with our scope
    css = css.replace(/([^{}]+){([^{}]*)}/g, (match, selector, rules) => {
      // Clean up the selector
      const cleanSelector = selector.trim()
      
      // Skip @-rules, keyframes, etc.
      if (cleanSelector.startsWith("@")) {
        return match
      }
      
      // Split multiple selectors and scope each one
      const selectors = cleanSelector.split(",")
      const scopedSelectors = selectors.map(sel => {
        const trimmedSel = sel.trim()
        // Don't scope html, body, or universal selectors - replace with our scope
        if (trimmedSel === "html" || trimmedSel === "body" || trimmedSel === "*") {
          return `.${scopeId}`
        }
        // Scope other selectors
        return `.${scopeId} ${trimmedSel}`
      }).join(", ")
      
      return `${scopedSelectors} { ${rules} }`
    })
    
    scopedCss += css + "\n"
  })

  // Get the body content as HTML
  let contentHtml = bodyContent.innerHTML

  // Remove original style and script tags from head to avoid conflicts
  const scriptsInHead = Array.from(doc.head.querySelectorAll("script"))
  const stylesInHead = Array.from(doc.head.querySelectorAll("style"))

  // Extract inline scripts from body and return them separately
  const bodyScripts = Array.from(bodyContent.querySelectorAll("script"))
  const extractedScripts: string[] = []
  
  bodyScripts.forEach(script => {
    if (!script.src) {
      // Only extract inline scripts - external scripts would need different handling
      const scriptText = script.textContent || ""
      if (scriptText.trim()) {
        extractedScripts.push(scriptText)
      }
    }
    // Remove script from content to avoid duplicate execution
    script.remove()
  })

  // Update content HTML after script removal
  contentHtml = bodyContent.innerHTML

  // Combine everything
  const processedHtml = `
    <style>
      .${scopeId} {
        /* Reset some default styles to prevent inheritance */
        font-family: inherit;
        line-height: inherit;
        color: inherit;
        /* Contain the embedded content */
        contain: style layout;
      }
      ${scopedCss}
    </style>
    <div class="${scopeId}">
      ${contentHtml}
    </div>
  `

  return { processedHtml, extractedScripts }
}

export function EmbeddedContent({ url, className }: EmbeddedContentProps) {
  const [content, setContent] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const scopeId = useRef(`embedded-${Math.random().toString(36).substr(2, 9)}`).current
  const [scripts, setScripts] = useState<string[]>([])

  useEffect(() => {
    async function fetchAndProcessContent() {
      setLoading(true)
      setError(null)

      // Validate URL
      const validation = validateEmbedUrl(url)
      if (!validation.isValid) {
        setError(validation.error || "Invalid URL")
        setLoading(false)
        return
      }

      try {
        // Fetch the content
        const response = await fetch(url)
        
        if (!response.ok) {
          throw new Error(`Failed to load content: ${response.status} ${response.statusText}`)
        }

        const html = await response.text()
        
        // Process the HTML for safe embedding
        const { processedHtml, extractedScripts } = processEmbeddedHtmlWithScripts(html, scopeId)
        setContent(processedHtml)
        setScripts(extractedScripts)
        
      } catch (err) {
        console.error("Error fetching embedded content:", err)
        setError(err instanceof Error ? err.message : "Failed to load embedded content")
      } finally {
        setLoading(false)
      }
    }

    if (url) {
      fetchAndProcessContent()
    }
  }, [url, scopeId])

  // Execute scripts after content is rendered
  useEffect(() => {
    if (containerRef.current && scripts.length > 0) {
      // Add a small delay to ensure DOM is fully rendered
      const timer = setTimeout(() => {
        const container = containerRef.current!
        
        scripts.forEach((scriptContent, index) => {
          try {
            console.log(`Executing script ${index + 1}:`, scriptContent.substring(0, 100) + '...')
            
            // Create a scoped version of the script that looks within our container first
            const scopedScript = `
              (function() {
                // Store original methods
                const originalGetElementById = document.getElementById;
                const originalAddEventListener = window.addEventListener;
                
                // Create scoped versions that check our container first
                document.getElementById = function(id) {
                  const containerElement = arguments[0] ? document.querySelector('.${scopeId} #' + arguments[0]) : null;
                  return containerElement || originalGetElementById.call(document, id);
                };
                
                // Override window.addEventListener for 'load' events to execute immediately
                window.addEventListener = function(event, handler, options) {
                  if (event === 'load') {
                    // Execute load handlers immediately since we're already loaded
                    setTimeout(handler, 0);
                    return;
                  }
                  return originalAddEventListener.call(window, event, handler, options);
                };
                
                try {
                  ${scriptContent}
                } finally {
                  // Restore original methods
                  document.getElementById = originalGetElementById;
                  window.addEventListener = originalAddEventListener;
                }
              })();
            `
            
            // Execute the scoped script
            const func = new Function(scopedScript)
            func()
            
          } catch (err) {
            console.warn('Error executing embedded script:', err)
            console.error(err)
          }
        })
      }, 200) // Increased delay to ensure DOM is fully ready

      return () => clearTimeout(timer)
    }
  }, [content, scripts, scopeId])

  if (loading) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin mr-2" />
            <span className="text-muted-foreground">Loading embedded content...</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={className}>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <AlertTriangle className="h-6 w-6 text-destructive mr-2" />
            <span className="text-destructive">Error: {error}</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={className}>
      <CardContent className="p-0">
        <div 
          ref={containerRef}
          className="embedded-content-container"
          dangerouslySetInnerHTML={{ __html: content }}
        />
      </CardContent>
    </Card>
  )
}
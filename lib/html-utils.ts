/**
 * HTML Utility Functions
 *
 * This file contains utility functions for working with HTML content.
 */

/**
 * Sanitize HTML content to prevent XSS attacks
 * This is a simple implementation - in production, use a library like DOMPurify
 */
export function sanitizeHtml(html: string): string {
  if (!html) return ""

  // Create a new div element
  const tempDiv = document.createElement("div")

  // Set the HTML content
  tempDiv.innerHTML = html

  // Get the sanitized HTML
  return tempDiv.innerHTML
}

/**
 * Extract plain text from HTML content
 */
export function extractTextFromHtml(html: string): string {
  if (!html) return ""

  // Create a new div element
  const tempDiv = document.createElement("div")

  // Set the HTML content
  tempDiv.innerHTML = html

  // Get the text content
  let text = tempDiv.textContent || tempDiv.innerText || ""

  // Process alt text from images and videos
  const images = tempDiv.querySelectorAll("img")
  images.forEach((img) => {
    const altText = img.getAttribute("data-alt-text") || img.getAttribute("alt")
    if (altText) {
      text += ` [Image: ${altText}]`
    }
  })

  const videos = tempDiv.querySelectorAll("video")
  videos.forEach((video) => {
    const altText = video.getAttribute("data-alt-text")
    if (altText) {
      text += ` [Video: ${altText}]`
    }
  })

  return text.trim()
}

/**
 * Check if a string contains HTML tags
 */
export function containsHtml(text: string): boolean {
  if (!text) return false

  // Simple regex to detect HTML tags
  const htmlRegex = /<[a-z][\s\S]*>/i
  return htmlRegex.test(text)
}

/**
 * Strip HTML tags from a string
 */
export function stripHtml(html: string): string {
  if (!html) return ""

  // Create a new div element
  const tempDiv = document.createElement("div")

  // Set the HTML content
  tempDiv.innerHTML = html

  // Get the text content
  return tempDiv.textContent || tempDiv.innerText || ""
}

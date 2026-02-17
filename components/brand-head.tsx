"use client"

import { useEffect, useMemo } from "react"
import { useTagData } from "@/hooks/use-tag-data"
import {
  buildBrandTitle,
  DEFAULT_BRAND_BACKGROUND_POSITION,
  DEFAULT_BRAND_BACKGROUND_REPEAT,
  DEFAULT_BRAND_BACKGROUND_SIZE,
  DEFAULT_BRAND_BACKGROUND_OPACITY,
  DEFAULT_BRAND_FAVICON,
} from "@/lib/branding"

export function BrandHead() {
  const { brand } = useTagData()
  const brandTitle = useMemo(() => buildBrandTitle(brand?.name), [brand?.name])
  const favicon = brand?.favicon || DEFAULT_BRAND_FAVICON

  useEffect(() => {
    if (typeof document === "undefined") return

    document.title = brandTitle

    const ensureLink = (rel: string) => {
      let link = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
      if (!link) {
        link = document.createElement("link")
        link.rel = rel
        document.head.appendChild(link)
      }
      link.href = favicon
    }

    ensureLink("icon")
    ensureLink("shortcut icon")

    const setMeta = (selector: string) => {
      const el = document.querySelector(selector) as HTMLMetaElement | null
      if (el) {
        el.setAttribute("content", brandTitle)
      }
    }

    setMeta('meta[property="og:site_name"]')
    setMeta('meta[property="og:title"]')
    setMeta('meta[name="twitter:title"]')

    const bodyStyle = document.body.style
    const backgroundImage = brand?.backgroundImage ? `url("${brand.backgroundImage}")` : "none"
    bodyStyle.setProperty("--brand-bg-image", backgroundImage)
    bodyStyle.setProperty("--brand-bg-size", brand?.backgroundSize || DEFAULT_BRAND_BACKGROUND_SIZE)
    bodyStyle.setProperty("--brand-bg-repeat", brand?.backgroundRepeat || DEFAULT_BRAND_BACKGROUND_REPEAT)
    bodyStyle.setProperty("--brand-bg-position", brand?.backgroundPosition || DEFAULT_BRAND_BACKGROUND_POSITION)
    const opacity = brand?.backgroundOpacity ?? DEFAULT_BRAND_BACKGROUND_OPACITY
    bodyStyle.setProperty("--brand-bg-opacity", String(opacity))
  }, [
    brandTitle,
    favicon,
    brand?.backgroundImage,
    brand?.backgroundPosition,
    brand?.backgroundRepeat,
    brand?.backgroundSize,
    brand?.backgroundOpacity,
  ])

  return null
}

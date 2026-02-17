export type BrandSettings = {
  name: string
  favicon: string
  backgroundImage: string
  backgroundSize: string
  backgroundRepeat: string
  backgroundPosition: string
  backgroundOpacity: number
}

export const DEFAULT_BRAND_NAME = "Serenity"
export const DEFAULT_BRAND_FAVICON = "/favicon.ico"
export const DEFAULT_BRAND_BACKGROUND_SIZE = "cover"
export const DEFAULT_BRAND_BACKGROUND_REPEAT = "no-repeat"
export const DEFAULT_BRAND_BACKGROUND_POSITION = "center"
export const DEFAULT_BRAND_BACKGROUND_OPACITY = 1

const clampOpacity = (value: number): number => {
  if (Number.isNaN(value)) return DEFAULT_BRAND_BACKGROUND_OPACITY
  return Math.min(1, Math.max(0, value))
}

export const normalizeBrandConfig = (tagConfig?: Record<string, unknown> | null): BrandSettings => {
  const brand = tagConfig && typeof tagConfig === "object" ? (tagConfig as any).brand : null
  const name =
    brand && typeof brand.name === "string" && brand.name.trim()
      ? brand.name.trim()
      : DEFAULT_BRAND_NAME
  const favicon =
    brand && typeof brand.favicon === "string" && brand.favicon.trim()
      ? brand.favicon.trim()
      : DEFAULT_BRAND_FAVICON
  const backgroundImage =
    brand && typeof brand.backgroundImage === "string" && brand.backgroundImage.trim()
      ? brand.backgroundImage.trim()
      : ""
  const backgroundSize =
    brand && typeof brand.backgroundSize === "string" && brand.backgroundSize.trim()
      ? brand.backgroundSize.trim()
      : DEFAULT_BRAND_BACKGROUND_SIZE
  const backgroundRepeat =
    brand && typeof brand.backgroundRepeat === "string" && brand.backgroundRepeat.trim()
      ? brand.backgroundRepeat.trim()
      : DEFAULT_BRAND_BACKGROUND_REPEAT
  const backgroundPosition =
    brand && typeof brand.backgroundPosition === "string" && brand.backgroundPosition.trim()
      ? brand.backgroundPosition.trim()
      : DEFAULT_BRAND_BACKGROUND_POSITION
  const rawOpacity =
    brand && typeof brand.backgroundOpacity === "number"
      ? brand.backgroundOpacity
      : brand && typeof brand.backgroundOpacity === "string" && brand.backgroundOpacity.trim()
        ? Number(brand.backgroundOpacity)
        : DEFAULT_BRAND_BACKGROUND_OPACITY
  const backgroundOpacity = clampOpacity(rawOpacity)

  return {
    name,
    favicon,
    backgroundImage,
    backgroundSize,
    backgroundRepeat,
    backgroundPosition,
    backgroundOpacity,
  }
}

export const buildBrandTitle = (brandName?: string | null): string => {
  const baseName = (brandName && brandName.trim()) || DEFAULT_BRAND_NAME
  const lower = baseName.toLowerCase()

  if (lower.includes("last war tools") || lower.includes("tools")) {
    return baseName
  }

  return `${baseName} - Last War Tools`
}

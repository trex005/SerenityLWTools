export type BrandSettings = {
  name: string
  favicon: string
}

export const DEFAULT_BRAND_NAME = "Serenity"
export const DEFAULT_BRAND_FAVICON = "/favicon.ico"

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

  return { name, favicon }
}

export const buildBrandTitle = (brandName?: string | null): string => {
  const baseName = (brandName && brandName.trim()) || DEFAULT_BRAND_NAME
  const lower = baseName.toLowerCase()

  if (lower.includes("last war tools") || lower.includes("tools")) {
    return baseName
  }

  return `${baseName} - Last War Tools`
}

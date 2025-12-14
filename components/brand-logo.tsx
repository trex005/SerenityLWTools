"use client"

import { useMemo } from "react"
import { Shield } from "lucide-react"
import { useTagData } from "@/hooks/use-tag-data"
import { buildBrandTitle } from "@/lib/branding"

interface BrandLogoProps {
  className?: string
  size?: number
}

export function BrandLogo({ className = "", size = 24 }: BrandLogoProps) {
  const { brand } = useTagData()
  const label = useMemo(() => buildBrandTitle(brand?.name), [brand?.name])

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Shield size={size} className="text-primary" />
      <span className="font-bold text-lg">{label}</span>
    </div>
  )
}

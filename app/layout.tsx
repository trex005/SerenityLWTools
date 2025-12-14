import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { TagDataProvider } from "@/hooks/use-tag-data"
import { BrandHead } from "@/components/brand-head"
import { buildBrandTitle, DEFAULT_BRAND_FAVICON } from "@/lib/branding"

const inter = Inter({ subsets: ["latin"] })

const defaultTitle = buildBrandTitle()

export const metadata: Metadata = {
  title: defaultTitle,
  description:
    "Strategic planning tools for the Last War campaign. Manage operations, missions, and intelligence for your campaign.",
  keywords: "Last War, strategy, planning, military, operations, missions, intelligence, campaign",
  authors: [{ name: defaultTitle }],
  viewport: "width=device-width, initial-scale=1",
  robots: "index, follow",
  manifest: "/manifest.json",
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: defaultTitle,
    description: "Strategic planning tools for the Last War campaign",
    siteName: defaultTitle,
  },
    generator: 'v0.dev'
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="icon" href={DEFAULT_BRAND_FAVICON} sizes="any" />
      </head>
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <TagDataProvider>
            <BrandHead />
            {children}
          </TagDataProvider>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  )
}


import './globals.css'

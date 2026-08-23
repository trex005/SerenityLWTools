import React from "react"
import ReactDOM from "react-dom/client"
import { TagDataProvider } from "@/hooks/use-tag-data"
import { BrandHead } from "@/components/brand-head"
import { StorageInitializer } from "@/components/storage-initializer"
import { Toaster } from "@/components/ui/toaster"
import { App } from "@/src/App"
import "@/src/globals.css"

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TagDataProvider>
      <BrandHead />
      <StorageInitializer />
      <App />
    </TagDataProvider>
    <Toaster />
  </React.StrictMode>,
)

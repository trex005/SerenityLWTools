import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import path from "node:path"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
  define: {
    "process.env.CONFIG_URL": JSON.stringify(process.env.CONFIG_URL || ""),
    "process.env.NODE_ENV": JSON.stringify(process.env.NODE_ENV || "production"),
  },
  build: {
    outDir: "out",
    emptyOutDir: true,
    target: "es2020",
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"],
          aws: ["@aws-sdk/client-s3"],
        },
      },
    },
  },
  server: {
    port: 3000,
  },
})

import { Component, type ReactNode } from "react"

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

/**
 * Last-resort crash screen. Without this any uncaught render error blanks the
 * whole SPA, which makes field diagnosis impossible.
 */
export class RootErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("Root crash:", error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "#0b0e17",
          color: "#e5e9f2",
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          padding: "24px",
        }}
      >
        <h1 style={{ fontSize: "18px", color: "#ff7b7b", marginBottom: "12px" }}>
          Something went wrong while loading the app
        </h1>
        <pre
          style={{
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            background: "#151a28",
            border: "1px solid #2a3148",
            borderRadius: "10px",
            padding: "16px",
            fontSize: "12px",
            lineHeight: 1.6,
          }}
        >
          {error.message}
          {"\n\n"}
          {error.stack ?? ""}
        </pre>
        <button
          onClick={() => {
            try {
              window.localStorage.clear()
            } catch {
              // Ignore storage failures
            }
            window.location.reload()
          }}
          style={{
            marginTop: "16px",
            padding: "8px 14px",
            borderRadius: "999px",
            border: "1px solid #2a3148",
            background: "#1c2338",
            color: "#e5e9f2",
            cursor: "pointer",
          }}
        >
          Clear local data and reload
        </button>
      </div>
    )
  }
}

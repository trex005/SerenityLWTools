import { strict as assert } from "node:assert"
import { test } from "node:test"

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return Array.from(this.values.keys())[index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

test("ancestor local overrides remain visible after a remote bundle was cached", async () => {
  const localStorage = new MemoryStorage()
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      location: { hostname: "example.test", pathname: "/", search: "?tag=leaf" },
    },
  })

  const payloads: Record<string, unknown> = {
    "leaf/conf.json": { parent: "middle" },
    "leaf/events.json": { events: [] },
    "leaf/tips.json": { tips: [] },
    "middle/conf.json": { parent: "main" },
    "middle/events.json": { events: [] },
    "middle/tips.json": { tips: [] },
    "main/conf.json": {},
    "main/events.json": {
      events: [{ id: "event-1", title: "JSON title", description: "Keep this field" }],
    },
    "main/tips.json": { tips: [] },
  }

  Object.defineProperty(globalThis, "fetch", {
    configurable: true,
    value: async (input: string | URL | Request) => {
      const url = new URL(String(input), "https://example.test")
      const key = url.pathname.replace(/^\/conf\//, "")
      const payload = payloads[key]
      return new Response(payload === undefined ? null : JSON.stringify(payload), {
        status: payload === undefined ? 404 : 200,
        headers: payload === undefined ? {} : { "content-type": "application/json" },
      })
    },
  })

  localStorage.setItem("lw-tools:leaf:adminMode", "true")
  localStorage.setItem("lw-tools:main:hasAdminAccess", "true")
  localStorage.setItem(
    "lw-tools:main:events",
    JSON.stringify({
      state: { overridesById: { "event-1": { id: "event-1", title: "Local title" } } },
      version: 1,
    }),
  )

  const { fetchComposedForTag } = await import("./config-fetcher")
  const { computeDiffIndexForTag } = await import("./config-diff")
  const remote = await fetchComposedForTag("leaf")
  const local = await fetchComposedForTag("leaf", false, {
    includeAncestorLocalOverrides: true,
    currentTag: "leaf",
  })

  assert.equal(remote.events[0].title, "JSON title")
  assert.deepEqual(local.events[0], {
    id: "event-1",
    title: "Local title",
    description: "Keep this field",
    archived: false,
  })

  const diff = await computeDiffIndexForTag(local.events, local.tips, "leaf")
  assert.deepEqual(diff.events["event-1"].overrideKeys, [])

  // config-fetcher schedules a browser preload when the module is imported.
  await new Promise((resolve) => setTimeout(resolve, 150))
  Reflect.deleteProperty(globalThis, "window")
  Reflect.deleteProperty(globalThis, "fetch")
})

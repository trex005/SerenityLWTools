import { strict as assert } from "node:assert"
import { test } from "node:test"

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

test("scoped persist storage parses Zustand state during rehydration", async () => {
  const localStorage = new MemoryStorage()
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage,
      location: { hostname: "example.test", search: "?tag=main" },
    },
  })

  const { scopedPersistStorage } = await import("./scoped-storage")
  localStorage.setItem(
    "lw-tools:main:events",
    JSON.stringify({ state: { overridesById: { event1: { id: "event1" } } }, version: 1 }),
  )

  const persisted = await scopedPersistStorage?.getItem("events")

  assert.deepEqual(persisted, {
    state: { overridesById: { event1: { id: "event1" } } },
    version: 1,
  })

  Reflect.deleteProperty(globalThis, "window")
})

import { test } from "node:test"
import assert from "node:assert/strict"
import { canonicalJson } from "./canonical"

test("canonicalJson ignores updated timestamps anywhere in the tree", () => {
  const a = { updated: "2026-01-01T00:00:00Z", events: { operations: [{ kind: "owned", id: "1" }] } }
  const b = { updated: "2027-12-31T23:59:59Z", events: { operations: [{ kind: "owned", id: "1" }], updated: "x" } }
  assert.equal(canonicalJson(a), canonicalJson(b))
})

test("canonicalJson treats operations arrays as order-insensitive sets", () => {
  const a = {
    schemaVersion: 2,
    operations: [
      { kind: "owned", id: "e1", event: { title: "One" } },
      { kind: "override", id: "e2", set: { "/title": "Two" } },
      { kind: "delete", id: "e3" },
    ],
  }
  const b = {
    schemaVersion: 2,
    operations: [
      { kind: "delete", id: "e3" },
      { kind: "override", id: "e2", set: { "/title": "Two" } },
      { kind: "owned", id: "e1", event: { title: "One" } },
    ],
  }
  assert.equal(canonicalJson(a), canonicalJson(b))
})

test("canonicalJson still detects real operation content changes", () => {
  const a = { operations: [{ kind: "override", id: "e2", set: { "/title": "Two" } }] }
  const b = { operations: [{ kind: "override", id: "e2", set: { "/title": "Changed" } }] }
  assert.notEqual(canonicalJson(a), canonicalJson(b))
})

test("canonicalJson preserves meaningful array order outside operations", () => {
  const a = { tags: ["main", "996"] }
  const b = { tags: ["996", "main"] }
  assert.notEqual(canonicalJson(a), canonicalJson(b))
})

test("canonicalJson is key-order insensitive", () => {
  const a = { b: 1, a: { y: 2, x: 3 } }
  const b = { a: { x: 3, y: 2 }, b: 1 }
  assert.equal(canonicalJson(a), canonicalJson(b))
})

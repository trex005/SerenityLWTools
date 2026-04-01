import { strict as assert } from "node:assert"
import { test } from "node:test"
import { computeOffset, convertEventRecurrence, addTagsBlock } from "./migrate-dates"

test("computeOffset: returns 0 when event date equals tag startDate", () => {
  assert.equal(computeOffset("2026-01-01", "2026-01-01"), 0)
})

test("computeOffset: returns positive offset for later date", () => {
  assert.equal(computeOffset("2026-01-06", "2026-01-01"), 5)
})

test("computeOffset: returns negative offset for earlier date", () => {
  assert.equal(computeOffset("2025-12-27", "2026-01-01"), -5)
})

test("convertEventRecurrence: converts startDate to startTag + startOffset", () => {
  const event = {
    id: "abc",
    recurrence: { type: "days", startDate: "2026-01-06", onPeriods: 1, offPeriods: 0 },
  }
  const result = convertEventRecurrence(event, "s4", "2026-01-01")
  assert.equal(result.recurrence.startTag, "s4")
  assert.equal(result.recurrence.startOffset, 5)
  assert.equal(result.recurrence.startDate, undefined)
})

test("convertEventRecurrence: converts endDate to endOffset", () => {
  const event = {
    id: "abc",
    recurrence: { type: "days", startDate: "2026-01-06", endDate: "2026-02-05", onPeriods: 1, offPeriods: 0 },
  }
  const result = convertEventRecurrence(event, "s4", "2026-01-01")
  assert.equal(result.recurrence.endOffset, 35)
  assert.equal(result.recurrence.endDate, undefined)
})

test("convertEventRecurrence: skips events already in new format", () => {
  const event = {
    id: "abc",
    recurrence: { type: "days", startTag: "s4", startOffset: 5, onPeriods: 1, offPeriods: 0 },
  }
  const result = convertEventRecurrence(event, "s4", "2026-01-01")
  assert.deepEqual(result, event) // unchanged
})

test("convertEventRecurrence: returns event unchanged if no recurrence", () => {
  const event = { id: "abc", title: "No recurrence" }
  const result = convertEventRecurrence(event, "s4", "2026-01-01")
  assert.deepEqual(result, event)
})

test("addTagsBlock: adds tags block when missing", () => {
  const conf = { parent: "main", brand: { name: "Test" } }
  const result = addTagsBlock(conf, "s4", "2026-01-01")
  assert.deepEqual(result.tags, { s4: { startDate: "2026-01-01" } })
})

test("addTagsBlock: does not overwrite existing tags block", () => {
  const conf = { tags: { s4: { startDate: "2025-06-01" } } }
  const result = addTagsBlock(conf, "s4", "2026-01-01")
  assert.equal(result.tags.s4.startDate, "2025-06-01") // preserved
})

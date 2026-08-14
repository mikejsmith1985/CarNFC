// Large-batch collision sweep for tag identifiers. Real CSPRNG work, so it sits outside the unit layer's 10ms budget (Article V).

import { describe, expect, it } from 'vitest'
import { generateTagBatch, generateTagId } from '@/lib/tags/generate'
import { TAG_ID_LENGTH } from '@/lib/constants'

describe('tag identifier collision resistance', () => {
  it('produces 10,000 distinct identifiers with no collisions', () => {
    const batch = generateTagBatch(10_000)
    expect(new Set(batch).size).toBe(10_000)
  })

  it('holds the documented length across a large batch', () => {
    const batch = generateTagBatch(10_000)
    expect(batch.every((id) => id.length === TAG_ID_LENGTH)).toBe(true)
  })

  it('distributes leading characters across the whole alphabet', () => {
    // 32 possible leading characters; with 10,000 draws every one should appear.
    // Anything less indicates the generator is not delivering the entropy that
    // FR-001c depends on to keep unclaimed tags unfindable.
    const leadingCharacters = new Set(generateTagBatch(10_000).map((id) => id[0]))
    expect(leadingCharacters.size).toBe(32)
  })

  it('never emits an excluded ambiguous glyph', () => {
    // 0, 1, l and o are excluded so a human transcribing a tag cannot go wrong.
    const sample = Array.from({ length: 2_000 }, () => generateTagId()).join('')
    expect(sample).not.toMatch(/[01lo]/)
  })
})

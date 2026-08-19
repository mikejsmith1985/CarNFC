// Unit tests for how many tag addresses an owner may mint at once.

import { describe, expect, it } from 'vitest'
import { clampTagBatchSize, MAX_TAG_BATCH, MIN_TAG_BATCH } from '@/lib/tags/batch'

describe('clampTagBatchSize', () => {
  it('keeps a sensible request as asked', () => {
    expect(clampTagBatchSize(5)).toBe(5)
  })

  it('treats nothing as one, because the button means "give me a tag"', () => {
    expect(clampTagBatchSize(undefined)).toBe(MIN_TAG_BATCH)
  })

  // Tags are sold in packs; writing thirty in one sitting is ordinary.
  it('allows a whole pack', () => {
    expect(clampTagBatchSize(30)).toBe(30)
  })

  it('refuses to mint a warehouse in one press', () => {
    expect(clampTagBatchSize(10_000)).toBe(MAX_TAG_BATCH)
  })

  it('refuses zero and negatives', () => {
    expect(clampTagBatchSize(0)).toBe(MIN_TAG_BATCH)
    expect(clampTagBatchSize(-4)).toBe(MIN_TAG_BATCH)
  })

  it('rounds a fractional request rather than failing on it', () => {
    expect(clampTagBatchSize(3.7)).toBe(3)
  })

  it('survives nonsense', () => {
    expect(clampTagBatchSize(Number.NaN)).toBe(MIN_TAG_BATCH)
  })
})

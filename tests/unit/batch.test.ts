// Unit tests for how many tag addresses an owner may mint at once.

import { describe, expect, it } from 'vitest'
import {
  clampTagBatchSize,
  clampProductionBatchSize,
  MAX_TAG_BATCH,
  MAX_PRODUCTION_BATCH,
  MIN_TAG_BATCH,
} from '@/lib/tags/batch'

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

describe('clampProductionBatchSize', () => {
  it('allows a print run of hundreds', () => {
    expect(clampProductionBatchSize(500)).toBe(500)
  })

  it('stops short of minting a warehouse', () => {
    expect(clampProductionBatchSize(50_000)).toBe(MAX_PRODUCTION_BATCH)
  })

  it('still refuses nothing', () => {
    expect(clampProductionBatchSize(0)).toBe(MIN_TAG_BATCH)
  })
})

// Unit tests for readable address slug generation (FR-001b, FR-001d).

import { describe, expect, it } from 'vitest'
import { buildVehicleSlug, resolveSlugCollision, toSlug } from '@/lib/claim/slug'

describe('toSlug', () => {
  it('lowercases and hyphenates a display name', () => {
    expect(toSlug('Front Differential')).toBe('front-differential')
  })

  it('collapses runs of punctuation into a single hyphen', () => {
    expect(toSlug('Brakes -- Front / Left')).toBe('brakes-front-left')
  })

  it('strips leading and trailing hyphens', () => {
    expect(toSlug('  ...Oil Filter!  ')).toBe('oil-filter')
  })

  it('strips diacritics rather than dropping the character', () => {
    expect(toSlug('Citroën')).toBe('citroen')
  })

  it('keeps digits, which carry meaning in part and model names', () => {
    expect(toSlug('F-150 Raptor')).toBe('f-150-raptor')
  })

  it('returns an empty string when nothing survives normalization', () => {
    expect(toSlug('!!!')).toBe('')
  })

  it('truncates without leaving a trailing hyphen', () => {
    const long = 'a'.repeat(30) + ' ' + 'b'.repeat(30)
    const slug = toSlug(long)
    expect(slug.length).toBeLessThanOrEqual(40)
    expect(slug.endsWith('-')).toBe(false)
  })
})

describe('resolveSlugCollision', () => {
  it('returns the desired slug when nothing has taken it', () => {
    expect(resolveSlugCollision('front-diff', ['rear-diff'])).toBe('front-diff')
  })

  it('appends a discriminator rather than rejecting the claim', () => {
    expect(resolveSlugCollision('front-diff', ['front-diff'])).toBe('front-diff-2')
  })

  it('skips discriminators that are themselves taken', () => {
    expect(resolveSlugCollision('front-diff', ['front-diff', 'front-diff-2'])).toBe('front-diff-3')
  })

  it('handles a long run of collisions', () => {
    const taken = ['brakes', ...Array.from({ length: 8 }, (_, i) => `brakes-${i + 2}`)]
    expect(resolveSlugCollision('brakes', taken)).toBe('brakes-10')
  })
})

describe('buildVehicleSlug', () => {
  it('prefers the nickname, which is what the owner actually calls it', () => {
    expect(buildVehicleSlug({ nickname: 'Raptor', year: 2014, make: 'Ford', model: 'F-150' })).toBe(
      'raptor',
    )
  })

  it('falls back to year, make and model when there is no nickname', () => {
    expect(buildVehicleSlug({ nickname: null, year: 2014, make: 'Ford', model: 'F-150' })).toBe(
      '2014-ford-f-150',
    )
  })

  it('falls back again when the nickname normalizes to nothing', () => {
    expect(buildVehicleSlug({ nickname: '???', year: 2014, make: 'Ford', model: 'F-150' })).toBe(
      '2014-ford-f-150',
    )
  })

  it('never returns an empty slug, since it has to address a route', () => {
    expect(buildVehicleSlug({ nickname: null, year: null, make: null, model: null })).toBe(
      'vehicle',
    )
  })
})

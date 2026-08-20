// Unit tests for turning a spoken number back into digits.

import { describe, expect, it } from 'vitest'
import { spokenToNumber } from '@/lib/voice/number-words'

describe('spokenToNumber', () => {
  it('passes digits straight through, which is what most phones return', () => {
    expect(spokenToNumber('24')).toBe('24')
  })

  it('reads a single word', () => {
    expect(spokenToNumber('seven')).toBe('7')
  })

  it('reads the teens, which are their own words', () => {
    expect(spokenToNumber('seventeen')).toBe('17')
  })

  it('reads a compound below a hundred', () => {
    expect(spokenToNumber('twenty four')).toBe('24')
  })

  it('reads a hyphenated compound, which some engines emit', () => {
    expect(spokenToNumber('seventy-five')).toBe('75')
  })

  it('reads hundreds', () => {
    expect(spokenToNumber('two hundred fifty')).toBe('250')
  })

  it('reads an odometer-sized number', () => {
    expect(spokenToNumber('one hundred twenty three thousand four hundred')).toBe('123400')
  })

  it('tolerates "and" the way people actually speak', () => {
    expect(spokenToNumber('two hundred and fifty')).toBe('250')
  })

  it('reads a decimal spoken as "point"', () => {
    expect(spokenToNumber('five point five')).toBe('5.5')
  })

  it('keeps a decimal that arrived already as digits', () => {
    expect(spokenToNumber('5.5')).toBe('5.5')
  })

  it('ignores a trailing unit the person said out loud', () => {
    expect(spokenToNumber('five quarts')).toBe('5')
  })

  it('ignores a leading currency word', () => {
    expect(spokenToNumber('forty two dollars')).toBe('42')
  })

  it('strips the thousands separator a phone may insert', () => {
    expect(spokenToNumber('123,400')).toBe('123400')
  })

  it('returns null when there is no number in there at all', () => {
    expect(spokenToNumber('the blue lever')).toBeNull()
  })

  it('returns null for an empty utterance', () => {
    expect(spokenToNumber('')).toBeNull()
  })

  it('reads zero', () => {
    expect(spokenToNumber('zero')).toBe('0')
  })
})

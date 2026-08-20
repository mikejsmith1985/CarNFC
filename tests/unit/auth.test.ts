// Unit tests for sign-in validation (FR-047).

import { describe, expect, it } from 'vitest'
import { emailSchema, signInCodeSchema, SIGN_IN_CODE_LENGTH } from '@/lib/validation/auth'

describe('emailSchema', () => {
  it('accepts an ordinary address', () => {
    expect(emailSchema.safeParse('owner@example.com').success).toBe(true)
  })

  it('accepts a plus-addressed alias', () => {
    expect(emailSchema.safeParse('owner+raptor@example.com').success).toBe(true)
  })

  it('rejects an address with no domain', () => {
    expect(emailSchema.safeParse('owner@').success).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(emailSchema.safeParse('').success).toBe(false)
  })
})

describe('signInCodeSchema', () => {
  it('accepts a code of the documented length', () => {
    expect(signInCodeSchema.safeParse('0'.repeat(SIGN_IN_CODE_LENGTH)).success).toBe(true)
  })

  it('rejects a short code', () => {
    expect(signInCodeSchema.safeParse('12345').success).toBe(false)
  })

  it('rejects a long code', () => {
    expect(signInCodeSchema.safeParse('1234567').success).toBe(false)
  })

  it('rejects non-digits, so a pasted link cannot be mistaken for a code', () => {
    expect(signInCodeSchema.safeParse('12a456').success).toBe(false)
  })
})

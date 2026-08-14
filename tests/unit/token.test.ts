// Unit tests for passport share tokens (FR-049a, FR-051).

import { describe, expect, it } from 'vitest'
import {
  buildShareUrl,
  generateShareToken,
  hashShareToken,
  looksLikeShareToken,
} from '@/lib/passport/token'
import { SHARE_TOKEN_LENGTH } from '@/lib/constants'

describe('generateShareToken', () => {
  it('produces a token of the documented length', () => {
    expect(generateShareToken()).toHaveLength(SHARE_TOKEN_LENGTH)
  })

  it('uses URL-safe characters only, so the link survives being pasted anywhere', () => {
    expect(generateShareToken()).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('produces a different token on each call', () => {
    expect(generateShareToken()).not.toBe(generateShareToken())
  })

  it('shows no collisions across a batch', () => {
    const batch = Array.from({ length: 200 }, () => generateShareToken())
    expect(new Set(batch).size).toBe(200)
  })
})

describe('hashShareToken', () => {
  it('returns a Postgres bytea hex literal', () => {
    expect(hashShareToken('example')).toMatch(/^\\x[0-9a-f]{64}$/)
  })

  it('is deterministic, so the same link always resolves', () => {
    const token = generateShareToken()
    expect(hashShareToken(token)).toBe(hashShareToken(token))
  })

  it('produces different hashes for different tokens', () => {
    expect(hashShareToken('alpha')).not.toBe(hashShareToken('beta'))
  })

  it('matches the known SHA-256 of a fixed input', () => {
    // Guards against a silent algorithm change: the database compares against
    // sha256() computed in Postgres, and the two must agree exactly.
    expect(hashShareToken('abc')).toBe(
      '\\xba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    )
  })

  it('does not leak the raw token into its own output', () => {
    const token = generateShareToken()
    expect(hashShareToken(token)).not.toContain(token)
  })
})

describe('looksLikeShareToken', () => {
  it('accepts a freshly generated token', () => {
    expect(looksLikeShareToken(generateShareToken())).toBe(true)
  })

  it('rejects a token of the wrong length', () => {
    expect(looksLikeShareToken('too-short')).toBe(false)
  })

  it('rejects characters that cannot appear in base64url', () => {
    expect(looksLikeShareToken('a'.repeat(SHARE_TOKEN_LENGTH - 1) + '/')).toBe(false)
  })

  it('rejects an empty string', () => {
    expect(looksLikeShareToken('')).toBe(false)
  })
})

describe('buildShareUrl', () => {
  it('builds a /p/ link', () => {
    expect(buildShareUrl('tok', 'https://app.example')).toBe('https://app.example/p/tok')
  })

  it('does not double the slash when the base URL has a trailing one', () => {
    expect(buildShareUrl('tok', 'https://app.example/')).toBe('https://app.example/p/tok')
  })
})

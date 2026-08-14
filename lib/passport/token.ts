// Share-token generation and hashing. The raw token exists only in the URL handed to the owner; the database stores its hash.

import { createHash, randomBytes } from 'node:crypto'
import { BITS_PER_BYTE, SHARE_TOKEN_ENTROPY_BITS, SHARE_TOKEN_LENGTH } from '@/lib/constants'

/**
 * Generates a passport share token.
 *
 * 256 bits of CSPRNG entropy in base64url. This link is the only thing standing
 * between a vehicle's full service history and anyone on the internet, since the
 * readable owner address deliberately never serves a guest — so it has to be
 * unguessable in the strong sense, not merely long (FR-049a).
 */
export function generateShareToken(): string {
  return randomBytes(SHARE_TOKEN_ENTROPY_BITS / BITS_PER_BYTE).toString('base64url')
}

/**
 * Hashes a token for storage, as a Postgres bytea hex literal.
 *
 * The raw token is never written down anywhere. A database dump, a log line, or
 * a backup therefore cannot be replayed into access — the holder of the link is
 * the only party who can present it.
 */
export function hashShareToken(token: string): string {
  const digest = createHash('sha256').update(token, 'utf8').digest('hex')
  return `\\x${digest}`
}

/**
 * Cheap shape check before touching the database.
 *
 * A malformed token is refused identically to a revoked or unknown one, so this
 * only avoids a pointless query — it never produces a distinguishable response.
 */
export function looksLikeShareToken(candidate: string): boolean {
  return candidate.length === SHARE_TOKEN_LENGTH && /^[A-Za-z0-9_-]+$/.test(candidate)
}

/** Builds the full shareable URL for a token. */
export function buildShareUrl(token: string, appUrl: string): string {
  return `${appUrl.replace(/\/$/, '')}/p/${token}`
}

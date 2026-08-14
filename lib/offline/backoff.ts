// Retry pacing and failure classification for the outbox. Pure functions, so the drain loop's decisions are testable without a network.

import {
  SYNC_BACKOFF_INITIAL_MS,
  SYNC_BACKOFF_MAX_MS,
  SYNC_STUCK_AFTER_ATTEMPTS,
} from '@/lib/constants'

/**
 * How a failed submission should be treated.
 *
 * The distinction matters because the two need opposite handling: a transient
 * failure will succeed on its own if we wait, while a permanent one will fail
 * identically forever and needs a human to look at it.
 */
export type FailureKind = 'transient' | 'permanent'

/**
 * Delay before the next attempt, doubling each time up to a ceiling.
 *
 * Capped rather than unbounded: a phone that has been in a dead zone all day
 * should still retry within minutes of regaining signal, not hours later.
 */
export function computeBackoffDelayMs(attempts: number): number {
  if (attempts <= 0) return 0
  const exponential = SYNC_BACKOFF_INITIAL_MS * 2 ** (attempts - 1)
  return Math.min(exponential, SYNC_BACKOFF_MAX_MS)
}

/** Whether enough time has passed since the last attempt to try again. */
export function isReadyToRetry(
  attempts: number,
  lastAttemptAtMs: number | null,
  nowMs: number,
): boolean {
  if (attempts === 0 || lastAttemptAtMs === null) return true
  return nowMs - lastAttemptAtMs >= computeBackoffDelayMs(attempts)
}

/**
 * Whether a record has failed often enough to be surfaced as stuck.
 *
 * Being stuck changes only its visibility. The record is never deleted — FR-042
 * forbids discarding an unsynchronized entry, and the entry may be the only
 * record of work someone actually performed.
 */
export function isStuck(attempts: number): boolean {
  return attempts >= SYNC_STUCK_AFTER_ATTEMPTS
}

/**
 * Classifies a failed submission.
 *
 * A thrown error means the request never got an answer — no network, DNS
 * failure, the server dropping the connection — so retrying is exactly right.
 * A returned `{ ok: false }` means the server did answer and rejected the
 * content, which retrying unchanged will never fix.
 */
export function classifyFailure(outcome: { threw: boolean }): FailureKind {
  return outcome.threw ? 'transient' : 'permanent'
}

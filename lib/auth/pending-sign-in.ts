// Remembers that a sign-in code was sent, so checking your email doesn't lose your place.
//
// The sign-in form is two steps, and the second one requires leaving the page:
// the code lives in an email. Holding "which step am I on" only in component
// state means the walk to the inbox and back resets it — the person returns to
// an empty email field, having just been sent a perfectly good code.
//
// On a phone this is worse than it sounds. Switching to the mail app can have
// the browser tab discarded entirely, so this uses localStorage rather than
// sessionStorage: it survives the tab being torn down and restored.
//
// The record is exposed as a subscribable store rather than something the form
// copies into its own state. The form then has one source of truth, and a code
// sent — or expired — in another tab moves this tab's form too.

/** How long a code stays valid. Matches `otp_expiry` in supabase/config.toml. */
export const SIGN_IN_CODE_TTL_SECONDS = 3600

const STORAGE_KEY = 'servicecard.pending-sign-in'

export interface PendingSignIn {
  email: string
  /** Epoch milliseconds when the code was requested. */
  sentAtMs: number
}

/** Callers waiting to hear that the stored record changed. */
const storeListeners = new Set<() => void>()

function notifyStoreListeners(): void {
  for (const listener of storeListeners) listener()
}

/** Records that a code has been sent, so a return visit resumes at the code step. */
export function rememberPendingSignIn(email: string, nowMs: number = Date.now()): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ email, sentAtMs: nowMs }))
  } catch {
    // A full or blocked store is not worth failing sign-in over; the form simply
    // behaves as it did before, starting from the email step.
  }
  notifyStoreListeners()
}

/** Forgets any pending sign-in — on success, on expiry, or on changing email. */
export function clearPendingSignIn(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    // Nothing to do; an unreadable store cannot be cleared either.
  }
  notifyStoreListeners()
}

/**
 * The raw stored record, or null.
 *
 * Deliberately a string rather than a parsed object: React compares snapshots
 * by identity, and a freshly parsed object would look like a change on every
 * single render.
 */
export function getPendingSignInSnapshot(): string | null {
  if (typeof localStorage === 'undefined') return null
  try {
    return localStorage.getItem(STORAGE_KEY)
  } catch {
    return null
  }
}

/**
 * The snapshot as the server sees it: always empty.
 *
 * The server has no access to this device's storage, so it can only render the
 * email step. Saying so explicitly is what keeps the first client render
 * identical to the server's HTML — React then re-renders with the real value
 * immediately after hydrating, rather than treating the difference as damage.
 */
export function getServerPendingSignInSnapshot(): string | null {
  return null
}

/** Subscribes to changes, including ones made in another tab. */
export function subscribeToPendingSignIn(onStoreChange: () => void): () => void {
  storeListeners.add(onStoreChange)

  // `storage` fires only in *other* tabs, which is why same-tab writes notify
  // listeners directly above.
  const handleStorageEvent = (event: StorageEvent) => {
    if (event.key === null || event.key === STORAGE_KEY) onStoreChange()
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('storage', handleStorageEvent)
  }

  return () => {
    storeListeners.delete(onStoreChange)
    if (typeof window !== 'undefined') {
      window.removeEventListener('storage', handleStorageEvent)
    }
  }
}

/**
 * Turns a raw snapshot into a record, or null if it is absent, unusable or expired.
 *
 * Pure by design — it is called while rendering, so it must not clear storage
 * or otherwise change the world. `readPendingSignIn` is the version that tidies up.
 */
export function parsePendingSignIn(
  raw: string | null,
  nowMs: number = Date.now(),
): PendingSignIn | null {
  if (!raw) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!isPendingSignIn(parsed)) return null
  if (secondsRemaining(parsed, nowMs) <= 0) return null

  return parsed
}

/**
 * Reads a pending sign-in, discarding it if it has expired or is unusable.
 *
 * Expiry is enforced on read rather than by a timer, because a timer does not
 * run while the tab is backgrounded — which is exactly where this data spends
 * most of its life.
 */
export function readPendingSignIn(nowMs: number = Date.now()): PendingSignIn | null {
  const raw = getPendingSignInSnapshot()
  if (raw === null) return null

  const pending = parsePendingSignIn(raw, nowMs)
  if (!pending) {
    clearPendingSignIn()
    return null
  }

  return pending
}

/** Seconds of validity left on a pending code; zero once it has expired. */
export function secondsRemaining(pending: PendingSignIn, nowMs: number = Date.now()): number {
  const MILLISECONDS_PER_SECOND = 1000
  // Clamped at zero: a device whose clock has gone backwards would otherwise
  // report more time remaining than the code was ever valid for.
  const elapsedSeconds = Math.max(
    0,
    Math.floor((nowMs - pending.sentAtMs) / MILLISECONDS_PER_SECOND),
  )
  return Math.max(0, SIGN_IN_CODE_TTL_SECONDS - elapsedSeconds)
}

/** Formats the remaining time as `m:ss` for the countdown beside the field. */
export function formatRemaining(totalSeconds: number): string {
  const SECONDS_PER_MINUTE = 60
  const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE)
  const seconds = totalSeconds % SECONDS_PER_MINUTE
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

function isPendingSignIn(candidate: unknown): candidate is PendingSignIn {
  if (candidate === null || typeof candidate !== 'object') return false
  const record = candidate as Record<string, unknown>
  return typeof record.email === 'string' && typeof record.sentAtMs === 'number'
}

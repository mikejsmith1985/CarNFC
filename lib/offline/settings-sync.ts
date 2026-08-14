// Conflict resolution for the things that are not entries — nickname, sharing state, specs, intervals.
'use client'

/**
 * Settings are mutable, so they cannot use the append-only revision model.
 *
 * They get the simplest rule that is still honest: whichever change the server
 * received last wins. Device clocks are not consulted, for the same reason they
 * are not consulted anywhere else — the specification assumes a phone's clock
 * may be wrong, and a wrong clock must not decide whose edit survives (FR-043b).
 *
 * Unlike an entry, a lost settings edit is cheap: the owner can see the current
 * value and change it again. That asymmetry is why entries get a revision chain
 * and settings do not.
 */

export type SettingsScope = 'vehicle' | 'component'

export interface PendingSettingsChange {
  /** Stable key so a repeated edit to the same field replaces rather than queues. */
  key: string
  scope: SettingsScope
  targetId: string
  field: string
  value: unknown
  clientCreatedAt: string
}

/** Builds the deduplication key for one field on one record. */
export function settingsChangeKey(scope: SettingsScope, targetId: string, field: string): string {
  return `${scope}:${targetId}:${field}`
}

/**
 * Collapses a queue of settings changes so only the newest per field remains.
 *
 * Someone renaming a vehicle three times offline should send one change, not
 * three — and the server should never see the two it would immediately
 * overwrite. Ordering within a single device's own queue uses that device's
 * clock, which is self-consistent even when wrong in absolute terms.
 */
export function collapseSettingsChanges(changes: PendingSettingsChange[]): PendingSettingsChange[] {
  const newestByKey = new Map<string, PendingSettingsChange>()

  for (const change of changes) {
    const existing = newestByKey.get(change.key)
    if (!existing || change.clientCreatedAt >= existing.clientCreatedAt) {
      newestByKey.set(change.key, change)
    }
  }

  return [...newestByKey.values()].sort((left, right) =>
    left.clientCreatedAt.localeCompare(right.clientCreatedAt),
  )
}

/**
 * Decides whether a locally cached settings value should be replaced by one
 * that has come back from the server.
 *
 * The server value wins unless this device still holds an undelivered change
 * for the same field — otherwise a background refresh would visibly undo an
 * edit the owner just made.
 */
export function shouldAcceptServerValue(
  key: string,
  pendingChanges: PendingSettingsChange[],
): boolean {
  return !pendingChanges.some((change) => change.key === key)
}

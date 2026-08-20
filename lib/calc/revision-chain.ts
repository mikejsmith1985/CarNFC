// Client-side mirror of the revision-chain resolution the database performs.
//
// The database view is the source of truth for what a card renders. This mirror
// exists for the offline path, where a cached payload has to be merged with
// entries that have not yet been delivered — and the two must agree, or a card
// would change under someone's hands the moment their signal returned.

import type { SpecOrigin } from '@/types/servicecard'

export interface RevisionLike {
  id: string
  entryId: string
  isTombstone: boolean
  /** Authoritative ordering. Null until the server has accepted the revision. */
  serverReceivedAt: string | null
  /** Untrusted; used only to order a single device's own pending records. */
  clientCreatedAt: string
}

/**
 * Resolves each entry to its current revision.
 *
 * Latest by server receipt, tie-broken by id so the result is deterministic.
 * Revisions still pending delivery have no server time yet and are treated as
 * newest — they are what the person in front of the screen just wrote, and
 * showing them anything else would be a lie about their own action.
 */
export function resolveCurrentRevisions<RevisionType extends RevisionLike>(
  revisions: RevisionType[],
): RevisionType[] {
  const byEntry = new Map<string, RevisionType[]>()

  for (const revision of revisions) {
    const group = byEntry.get(revision.entryId) ?? []
    group.push(revision)
    byEntry.set(revision.entryId, group)
  }

  const current: RevisionType[] = []

  for (const group of byEntry.values()) {
    const latest = group.reduce((winner, candidate) =>
      compareRevisions(candidate, winner) > 0 ? candidate : winner,
    )
    if (!latest.isTombstone) current.push(latest)
  }

  return current
}

/** Positive when `left` is more recent than `right`. */
function compareRevisions(left: RevisionLike, right: RevisionLike): number {
  // A pending revision outranks a delivered one: it is strictly later work.
  if (left.serverReceivedAt === null && right.serverReceivedAt !== null) return 1
  if (left.serverReceivedAt !== null && right.serverReceivedAt === null) return -1

  if (left.serverReceivedAt !== null && right.serverReceivedAt !== null) {
    const comparison = left.serverReceivedAt.localeCompare(right.serverReceivedAt)
    if (comparison !== 0) return comparison
  } else {
    // Both pending, so both from this device — its own clock is consistent
    // with itself even when wrong in absolute terms.
    const comparison = left.clientCreatedAt.localeCompare(right.clientCreatedAt)
    if (comparison !== 0) return comparison
  }

  return left.id.localeCompare(right.id)
}

/** How many revisions an entry has, which is what marks it edited. */
export function countRevisions(revisions: RevisionLike[], entryId: string): number {
  return revisions.filter((revision) => revision.entryId === entryId).length
}

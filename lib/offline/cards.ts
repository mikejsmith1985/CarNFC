// Card cache: keeps previously visited cards readable with no connectivity, and stamps how stale they are.
'use client'

import { getDatabase } from '@/lib/offline/db'
import type { CachedCard, ComponentCard } from '@/types/servicecard'

/** Cache key for a card. Matches its readable address, which is already unique per owner. */
export function cardCacheKey(vehicleSlug: string, componentSlug: string): string {
  return `${vehicleSlug}/${componentSlug}`
}

/** Stores the payload a card was last rendered from. */
export async function cacheCard(
  vehicleSlug: string,
  componentSlug: string,
  payload: ComponentCard,
): Promise<void> {
  const database = await getDatabase()
  const key = cardCacheKey(vehicleSlug, componentSlug)
  await database.put('cards', { key, payload, fetchedAt: new Date().toISOString() }, key)
}

/**
 * Reads a cached card.
 *
 * Returns `null` for a card this device has never loaded online. Offline reading
 * is scoped to previously visited cards (FR-038) — there is genuinely nothing to
 * show for one that was never fetched, and the offline fallback says so plainly
 * rather than spinning.
 */
export async function readCachedCard(
  vehicleSlug: string,
  componentSlug: string,
): Promise<CachedCard | null> {
  const database = await getDatabase()
  const key = cardCacheKey(vehicleSlug, componentSlug)
  return (await database.get('cards', key)) ?? null
}

/**
 * How stale a cached payload is, in whole minutes.
 *
 * Drives the staleness banner. Someone about to torque a fastener needs to know
 * whether the figure in front of them was read a minute ago or last month.
 */
export function computeStalenessMinutes(fetchedAt: string, nowMs: number = Date.now()): number {
  const MILLISECONDS_PER_MINUTE = 60_000
  const fetchedMs = new Date(fetchedAt).getTime()
  if (Number.isNaN(fetchedMs)) return 0
  return Math.max(0, Math.floor((nowMs - fetchedMs) / MILLISECONDS_PER_MINUTE))
}

/** Phrases the staleness stamp for display. */
export function describeStaleness(fetchedAt: string, nowMs: number = Date.now()): string {
  const minutes = computeStalenessMinutes(fetchedAt, nowMs)
  const MINUTES_PER_HOUR = 60
  const HOURS_PER_DAY = 24

  if (minutes < 1) return 'just now'
  if (minutes < MINUTES_PER_HOUR) return `${minutes} min ago`

  const hours = Math.floor(minutes / MINUTES_PER_HOUR)
  if (hours < HOURS_PER_DAY) return `${hours} hr ago`

  const days = Math.floor(hours / HOURS_PER_DAY)
  return `${days} day${days === 1 ? '' : 's'} ago`
}

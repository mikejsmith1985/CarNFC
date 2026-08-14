// Storage-pressure detection, so the outbox is never silently evicted by the browser.
'use client'

import { STORAGE_PRESSURE_WARN_RATIO } from '@/lib/constants'

export interface StoragePressure {
  /** Whether the browser has promised not to evict this origin's data. */
  isPersisted: boolean
  usageBytes: number | null
  quotaBytes: number | null
  /** Fraction of quota consumed, or null when the browser will not say. */
  usedRatio: number | null
  isUnderPressure: boolean
}

/**
 * Asks the browser to make this origin's storage persistent.
 *
 * FR-042 promises an unsynchronized entry is never discarded, but eviction is
 * the browser's decision, not ours. Requesting persistence is the strongest
 * guarantee available; warning the owner covers the case where it is refused.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false

  if (await navigator.storage.persisted?.()) return true

  try {
    return await navigator.storage.persist()
  } catch {
    return false
  }
}

/** Reads current storage usage. Returns nulls where the browser declines to report. */
export async function readStoragePressure(): Promise<StoragePressure> {
  const unavailable: StoragePressure = {
    isPersisted: false,
    usageBytes: null,
    quotaBytes: null,
    usedRatio: null,
    isUnderPressure: false,
  }

  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return unavailable

  try {
    const estimate = await navigator.storage.estimate()
    const isPersisted = (await navigator.storage.persisted?.()) ?? false
    const usageBytes = estimate.usage ?? null
    const quotaBytes = estimate.quota ?? null

    const usedRatio =
      usageBytes !== null && quotaBytes !== null && quotaBytes > 0 ? usageBytes / quotaBytes : null

    return {
      isPersisted,
      usageBytes,
      quotaBytes,
      usedRatio,
      // Only a warning when persistence was refused: a persisted origin is not
      // at risk of eviction, however full it gets.
      isUnderPressure:
        !isPersisted && usedRatio !== null && usedRatio >= STORAGE_PRESSURE_WARN_RATIO,
    }
  } catch {
    return unavailable
  }
}

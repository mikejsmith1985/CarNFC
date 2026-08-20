// Mirrors a server-rendered card into IndexedDB so the same card is readable later with no connectivity.
'use client'

import { useEffect } from 'react'
import { cacheCard } from '@/lib/offline/cards'
import type { ComponentCard } from '@/types/servicecard'

interface CardCacheWriterProps {
  vehicleSlug: string
  componentSlug: string
  card: ComponentCard
}

/**
 * Writes the rendered card payload to the local cache.
 *
 * Renders nothing. It exists because the card is a Server Component and cannot
 * reach IndexedDB itself, and because FR-038 scopes offline reading to cards the
 * device has already loaded — which only holds if loading one stores it.
 */
export function CardCacheWriter({ vehicleSlug, componentSlug, card }: CardCacheWriterProps) {
  useEffect(() => {
    void cacheCard(vehicleSlug, componentSlug, card).catch(() => {
      // A full or evicted store must never break the page the mechanic is
      // reading. Storage pressure is surfaced separately by the sync indicator.
    })
  }, [vehicleSlug, componentSlug, card])

  return null
}

// Says when the data on screen was last refreshed, so nobody torques a fastener to a figure read last month.
'use client'

import { useEffect, useState } from 'react'
import { History } from 'lucide-react'
import { describeStaleness, readCachedCard } from '@/lib/offline/cards'

interface StalenessBannerProps {
  vehicleSlug: string
  componentSlug: string
}

/**
 * Shows how old the cached copy of this card is (FR-038).
 *
 * Only appears when the device is offline. Online, the page was just rendered
 * from the server and the age is zero — saying so would be noise on the one
 * screen that exists to be read at a glance.
 */
export function StalenessBanner({ vehicleSlug, componentSlug }: StalenessBannerProps) {
  const [staleness, setStaleness] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    const refresh = async () => {
      if (navigator.onLine) {
        if (isMounted) setStaleness(null)
        return
      }
      const cached = await readCachedCard(vehicleSlug, componentSlug)
      if (isMounted) setStaleness(cached ? describeStaleness(cached.fetchedAt) : null)
    }

    void refresh()
    window.addEventListener('online', () => void refresh())
    window.addEventListener('offline', () => void refresh())

    return () => {
      isMounted = false
    }
  }, [vehicleSlug, componentSlug])

  if (staleness === null) return null

  return (
    <p className="mx-4 mt-3 flex items-center gap-2 rounded-card border border-border-strong bg-surface-raised px-3 py-2 text-sm text-text-secondary">
      <History size={16} className="shrink-0" aria-hidden />
      Showing a saved copy from {staleness}. Specs may have changed since.
    </p>
  )
}

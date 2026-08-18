// Distinguishes "this part does not exist" from "this phone cannot reach it".
'use client'

import Link from 'next/link'
import { WifiOff, SearchX } from 'lucide-react'
import { useIsOffline } from '@/components/ui/useIsOffline'

/**
 * The card could not be produced. Which message to show depends on the radio.
 *
 * A card that was never opened on this device has no saved copy, so with no
 * signal there is nothing to render — but telling someone standing at their own
 * vehicle that the part does not exist is wrong and alarming. The truthful
 * distinction is whether the phone can reach anything at all (FR-038).
 */
export function CardNotFound() {
  const isOffline = useIsOffline()

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center px-6 text-center">
      {isOffline ? (
        <>
          <WifiOff size={40} className="text-text-muted" aria-hidden />
          <h1 className="mt-4 text-xl font-bold">No connection</h1>
          <p className="mt-2 text-sm text-text-secondary">
            This card hasn&apos;t been opened on this device yet, so there&apos;s no offline copy.
          </p>
          <p className="mt-4 text-sm text-text-muted">
            Anything you log while offline is saved on the device and uploads by itself once you
            have signal.
          </p>
        </>
      ) : (
        <>
          <SearchX size={40} className="text-text-muted" aria-hidden />
          <h1 className="mt-4 text-xl font-bold">Part not found</h1>
          <p className="mt-2 text-sm text-text-secondary">
            Nothing on this vehicle matches that address.
          </p>
          <Link
            href="/garage"
            className="mt-6 inline-flex min-h-touch items-center rounded-card border border-border-strong px-4 text-sm font-semibold text-text-primary"
          >
            Go to my garage
          </Link>
        </>
      )}
    </main>
  )
}

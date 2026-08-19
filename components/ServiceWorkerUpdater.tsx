// Replaces a stale app as soon as a new one is deployed, without anyone clearing anything.
'use client'

import { useEffect } from 'react'

/**
 * How often to ask whether a newer build exists while the app is open.
 *
 * Browsers check for a new worker on navigation, which is no help to a page
 * left open on a workbench for an afternoon.
 */
const UPDATE_CHECK_MS = 60_000

/**
 * Reloads the page when a new version takes over.
 *
 * A service worker serves the old app until it is replaced, so a deploy is
 * invisible to anyone already carrying the previous one — testing it meant
 * clearing website data by hand, which nobody will do and no customer could be
 * asked to. The worker already claims control the moment it activates; this
 * simply makes the page notice.
 *
 * The reload is skipped when there was no controller to begin with. That is the
 * very first visit, where nothing is stale and reloading would be a pointless
 * flash.
 */
export function ServiceWorkerUpdater() {
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

    const hadController = navigator.serviceWorker.controller !== null
    let hasReloaded = false

    const handleControllerChange = () => {
      if (!hadController || hasReloaded) return
      hasReloaded = true
      window.location.reload()
    }

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange)

    const checkForUpdate = () => {
      void navigator.serviceWorker.getRegistration().then((registration) => {
        // `update()` rejects when offline, which is ordinary rather than a fault.
        void registration?.update().catch(() => undefined)
      })
    }

    checkForUpdate()
    const timer = setInterval(checkForUpdate, UPDATE_CHECK_MS)

    // Coming back to a backgrounded tab is the likeliest moment for a deploy to
    // have happened since it was last looked at.
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkForUpdate()
    }
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange)
      document.removeEventListener('visibilitychange', handleVisibility)
      clearInterval(timer)
    }
  }, [])

  return null
}

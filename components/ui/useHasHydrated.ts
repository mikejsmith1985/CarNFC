// Reports whether the first client render is over, for UI that depends on something only the device knows.
'use client'

import { useEffect, useState } from 'react'

/**
 * False on the server and for the first client render, true immediately after.
 *
 * Anything read from the device — stored state, microphone availability — is
 * invisible to the server, so rendering it straight away produces markup React
 * did not expect and it throws the tree away and rebuilds it. Waiting one turn
 * keeps the first client render identical to the HTML that arrived.
 *
 * A timer rather than `requestAnimationFrame`: a browser paints no frames for a
 * hidden tab, and a tab restored from behind another app is exactly when this
 * matters most.
 */
export function useHasHydrated(): boolean {
  const [hasHydrated, setHasHydrated] = useState(false)

  useEffect(() => {
    const timer = setTimeout(() => setHasHydrated(true), 0)
    return () => clearTimeout(timer)
  }, [])

  return hasHydrated
}

// Reports whether the device currently has no connection.
'use client'

import { useEffect, useState } from 'react'

/**
 * True while the browser believes it has no connection.
 *
 * Starts false so the server-rendered markup and the first client render agree
 * — the server cannot know, and guessing produces markup React did not expect.
 * The real value arrives immediately afterwards.
 */
export function useIsOffline(): boolean {
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    const report = () => setIsOffline(!navigator.onLine)
    report()

    window.addEventListener('online', report)
    window.addEventListener('offline', report)
    return () => {
      window.removeEventListener('online', report)
      window.removeEventListener('offline', report)
    }
  }, [])

  return isOffline
}

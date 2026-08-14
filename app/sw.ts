// Service worker source. Precaches the app shell and keeps previously visited cards readable with no connectivity (FR-038, FR-044).

import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist, StaleWhileRevalidate, NetworkOnly } from 'serwist'

declare global {
  interface WorkerGlobalScope extends SerwistGlobalConfig {
    __SW_MANIFEST: (PrecacheEntry | string)[] | undefined
  }
}

declare const self: ServiceWorkerGlobalScope

const serwist = new Serwist({
  precacheEntries: self.__SW_MANIFEST,
  skipWaiting: true,
  clientsClaim: true,
  navigationPreload: true,

  runtimeCaching: [
    {
      /*
        Never cache a shared passport.

        It is the one route that serves vehicle data to someone who is not the
        owner, and its access can be revoked at any moment. A cached copy would
        keep answering after revocation, which would quietly break FR-051.
      */
      matcher: ({ url }) => url.pathname.startsWith('/p/'),
      handler: new NetworkOnly(),
    },
    {
      /*
        Component cards: serve the cached copy immediately, revalidate behind it.

        This is what makes a repeat tap paint inside the one-second budget even
        with no signal (SC-002). The staleness stamp shown in the UI comes from
        IndexedDB, not from here — the cache only makes the paint fast.
      */
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/v/'),
      handler: new StaleWhileRevalidate({ cacheName: 'component-cards' }),
    },
    ...defaultCache,
  ],

  fallbacks: {
    entries: [
      {
        // A card never visited while online is not in the cache. Show our own
        // offline page rather than the browser's error screen.
        url: '/offline',
        matcher: ({ request }) => request.destination === 'document',
      },
    ],
  },
})

serwist.addEventListeners()

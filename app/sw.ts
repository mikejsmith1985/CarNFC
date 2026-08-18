// Service worker source. Precaches the app shell and keeps previously visited cards readable with no connectivity (FR-038, FR-044).

import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist, NetworkFirst, NetworkOnly } from 'serwist'

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
        Everything under a vehicle — the page and the payloads that update it —
        comes from the network whenever there is one, and from the cache only
        when there is not.

        Serving any of it stale while online breaks the app in two different
        ways. A stale page document names build chunks that no longer exist, so
        the card paints and never wires up. A stale React payload is worse and
        quieter: it is the mechanism by which the app refreshes itself, so a
        saved edit writes to the database and then appears not to have happened.
        Both look like broken features rather than a cache.

        Falling back to the cache when the network fails is what keeps a tap
        working with no signal (FR-038). The instant repaint comes from the card
        cache in IndexedDB, not from here.
      */
      matcher: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/v/'),
      handler: new NetworkFirst({
        cacheName: 'component-cards',
        plugins: [
          {
            /*
              A card with no signal and no saved copy must say so.

              Without this the request falls through to the precached
              not-found page, and someone standing at their own vehicle is
              told the part does not exist — when the truth is only that the
              phone cannot reach it. Redirecting rather than returning the
              page keeps the address honest too: the URL becomes /offline
              instead of pretending the card rendered.
            */
            handlerDidError: async () => Response.redirect('/offline', 302),
          },
        ],
      }),
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

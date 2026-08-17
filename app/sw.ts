// Service worker source. Precaches the app shell and keeps previously visited cards readable with no connectivity (FR-038, FR-044).

import { defaultCache } from '@serwist/next/worker'
import type { PrecacheEntry, SerwistGlobalConfig } from 'serwist'
import { Serwist, StaleWhileRevalidate, NetworkFirst, NetworkOnly } from 'serwist'

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
        The card's HTML, kept for when there is no signal — but never served
        ahead of the network while there is one.

        A page document from this app names the exact build chunks it needs.
        Handing back a stale one against a newer bundle produces a card that
        paints and then does nothing at all: React finds markup belonging to a
        different build and never finishes wiring it up. Every button is dead,
        and it looks like a broken feature rather than a stale cache. Serving
        it only when the network has actually failed keeps a tap working with no
        signal (FR-038) without ever risking that on a tap that had one.
      */
      matcher: ({ url, sameOrigin, request }) =>
        sameOrigin && url.pathname.startsWith('/v/') && request.destination === 'document',
      handler: new NetworkFirst({ cacheName: 'component-cards' }),
    },
    {
      /*
        Everything else the card asks for — its data payloads — is safe to serve
        from cache first, because none of it carries a reference to a build.
        This is what makes a repeat tap paint inside the budget (SC-002). The
        staleness stamp comes from IndexedDB, not from here.
      */
      matcher: ({ url, sameOrigin, request }) =>
        sameOrigin && url.pathname.startsWith('/v/') && request.destination !== 'document',
      handler: new StaleWhileRevalidate({ cacheName: 'component-card-data' }),
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

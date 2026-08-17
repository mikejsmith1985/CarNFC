// Next.js build configuration, including the Serwist service-worker wrapper that makes the app installable and offline-capable.
import withSerwistInit from '@serwist/next'
import type { NextConfig } from 'next'

/**
 * Wraps the app with Serwist so a service worker is generated at build time.
 * Next.js ships no service-worker or PWA-manifest generation of its own, which is
 * the documented framework gap that justifies this dependency (research.md R5).
 */
const withSerwist = withSerwistInit({
  swSrc: 'app/sw.ts',
  swDest: 'public/sw.js',
  // Disabled in development so a stale worker never masks a code change.
  // Also disabled when OpenNext drives the build: it invokes `next build`
  // itself, and Serwist's webpack injection conflicts with the Workers bundle.
  disable: process.env.NODE_ENV === 'development' || process.env.OPEN_NEXT_BUILD === '1',
})

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /*
    The dev server refuses cross-origin requests for its own resources — HMR and
    the client chunks — so a page served through a tunnel renders on the server
    but never finishes wiring up in the browser. Buttons look right and do
    nothing.

    Needed only to test on a phone via a tunnel. Production serves from its own
    origin, where this never applies.
  */
  allowedDevOrigins: ['*.trycloudflare.com'],

  experimental: {
    /*
      Server Actions carry CSRF protection that compares the request's Origin to
      its Host. A tunnel breaks that by design — the browser sees the public
      tunnel hostname while the server sees localhost — so every action is
      rejected before it runs.

      Allowing the tunnel hosts makes phone testing over a tunnel work. These
      are development conveniences and cost nothing in production, where the app
      is served from its own origin and the Origin/Host pair matches naturally.
    */
    serverActions: {
      allowedOrigins: ['*.trycloudflare.com', 'localhost:3100', '127.0.0.1:3100'],
    },
  },

  // The shared passport is the only unauthenticated data path in the product.
  // These headers stop a pasted link from expanding into a chat preview that
  // discloses a vehicle's service history (FR-051b).
  async headers() {
    return [
      {
        source: '/p/:token*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive' },
          { key: 'Cache-Control', value: 'private, no-store' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
        ],
      },
    ]
  },
}

export default withSerwist(nextConfig)

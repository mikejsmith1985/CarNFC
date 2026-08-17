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
  // Disabled in development so a stale worker never masks a code change, unless
  // asked for explicitly: the UX layer has to exercise offline behaviour, and
  // without a worker there is nothing to serve the page when the radio is off —
  // the specs fail on a blank, unhydrated page rather than on the feature.
  // Also disabled when OpenNext drives the build: it invokes `next build`
  // itself, and Serwist's webpack injection conflicts with the Workers bundle.
  disable:
    (process.env.NODE_ENV === 'development' && process.env.SERVICECARD_ENABLE_SW !== '1') ||
    process.env.OPEN_NEXT_BUILD === '1',
})

/**
 * Hosts allowed to load dev-server resources.
 *
 * Testing on a real phone means reaching this machine through a tunnel, and the
 * tunnel's hostname is not the one the dev server is bound to. Next blocks that
 * by default, which silently withholds the client bundle — the page renders but
 * never becomes interactive, and every button looks broken. Ignored entirely by
 * a production build; it exists only so `next dev` can be reached from a device.
 */
const TUNNEL_DEV_HOSTS = ['*.trycloudflare.com']

const nextConfig: NextConfig = {
  reactStrictMode: true,

  allowedDevOrigins: TUNNEL_DEV_HOSTS,

  experimental: {
    /*
      Server Actions carry CSRF protection that compares the request's Origin to
      its Host. A tunnel breaks that by design — the browser sees the public
      tunnel hostname while the server sees localhost — so every action is
      rejected before it runs. Sign-in is a Server Action, so without this a
      phone can load the form and never manage to send itself a code.

      A development convenience only. Production serves from its own origin,
      where the Origin and Host match naturally and none of this applies.
    */
    serverActions: {
      allowedOrigins: [...TUNNEL_DEV_HOSTS, 'localhost:3100', '127.0.0.1:3100'],
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

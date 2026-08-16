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

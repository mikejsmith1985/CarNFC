// PWA manifest, which is what makes the app installable to a home screen (FR-044).
import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ServiceCard',
    short_name: 'ServiceCard',
    description: 'Tap a tag on your vehicle. See the exact part, its specs, and its history.',
    start_url: '/garage',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#12151a',
    theme_color: '#12151a',
    categories: ['productivity', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}

// Root layout: the dark-first app shell, viewport configuration, and PWA wiring.
import type { Metadata, Viewport } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'ServiceCard',
  description: 'Tap a tag on your vehicle. See the exact part, its specs, and its history.',
  applicationName: 'ServiceCard',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'ServiceCard',
  },
  formatDetection: {
    // A part number is not a phone number, and a torque spec is not a date.
    telephone: false,
    date: false,
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Deliberately zoomable. Locking zoom would make a part number unreadable to
  // anyone who needs to magnify it, which fails accessibility for no benefit.
  maximumScale: 5,
  themeColor: '#12151a',
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-surface text-text-primary antialiased">{children}</body>
    </html>
  )
}

// Shown when a scanned tag identifier matches nothing. Offers the claim flow as the recovery path.
import Link from 'next/link'
import { HelpCircle } from 'lucide-react'

export const metadata = { title: 'Tag not recognized · ServiceCard' }

/** The `unknown` branch of tag resolution. Kept deliberately similar to /tag-unavailable. */
export default function TagUnknownPage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center px-6 text-center">
      <HelpCircle size={40} className="text-text-muted" aria-hidden />
      <h1 className="mt-4 text-xl font-bold">This tag isn&apos;t available</h1>
      <p className="mt-2 text-sm text-text-secondary">
        It may belong to another account, or it may not be set up yet.
      </p>
      <Link
        href="/garage"
        className="mt-6 flex min-h-touch items-center justify-center rounded-card border border-border-strong px-5 text-sm font-semibold"
      >
        Go to my garage
      </Link>
    </main>
  )
}

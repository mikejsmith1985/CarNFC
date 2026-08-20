// Shown when a scanned tag belongs to someone else. Deliberately discloses nothing about the vehicle behind it.
import { Lock } from 'lucide-react'

export const metadata = { title: 'Tag unavailable · ServiceCard' }

/**
 * The `forbidden` branch of tag resolution.
 *
 * This page and /tag-unknown are intentionally near-identical. If they differed
 * meaningfully — in wording, in structure, or in how fast they arrived — the tag
 * space would become an oracle for working out which tags are claimed.
 */
export default function TagUnavailablePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center px-6 text-center">
      <Lock size={40} className="text-text-muted" aria-hidden />
      <h1 className="mt-4 text-xl font-bold">This tag isn&apos;t available</h1>
      <p className="mt-2 text-sm text-text-secondary">
        It may belong to another account, or it may not be set up yet.
      </p>
      <p className="mt-6 text-sm text-text-muted">
        If this is your tag, sign in with the account that claimed it.
      </p>
    </main>
  )
}

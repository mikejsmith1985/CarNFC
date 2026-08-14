// Email one-time-code sign-in. The only moment in the product that asks for a credential.
import { Suspense } from 'react'
import { SignInForm } from '@/components/auth/SignInForm'

export const metadata = { title: 'Sign in · ServiceCard' }

interface PageProps {
  // Next 16 delivers search params as a Promise, same as route params.
  searchParams: Promise<{ next?: string }>
}

/**
 * Signs the owner in, then returns them to wherever they were heading.
 *
 * The `next` parameter carries the scanned address through the round trip, so a
 * first-ever tap still lands on the right card rather than a home screen.
 */
export default async function VerifyPage({ searchParams }: PageProps) {
  const { next } = await searchParams

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-6 py-10">
      <header className="mb-8">
        <h1 className="text-2xl font-bold">ServiceCard</h1>
        <p className="mt-2 text-sm text-text-secondary">
          Sign in once on this device. After that, tapping a tag opens straight to the part.
        </p>
      </header>

      <Suspense fallback={null}>
        <SignInForm nextPath={sanitizeNextPath(next)} />
      </Suspense>
    </main>
  )
}

/**
 * Keeps the post-sign-in redirect inside this application.
 *
 * `next` arrives from the URL, so it is attacker-controllable. Anything that is
 * not a plain same-site path is discarded rather than followed — otherwise the
 * sign-in screen becomes an open redirect.
 */
function sanitizeNextPath(candidate: string | undefined): string {
  if (!candidate) return '/garage'
  if (!candidate.startsWith('/')) return '/garage'
  // `//evil.example` and `/\evil.example` are protocol-relative URLs, not paths.
  if (candidate.startsWith('//') || candidate.startsWith('/\\')) return '/garage'
  return candidate
}

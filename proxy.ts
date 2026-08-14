// Next.js proxy entry point (the Next 16 replacement for middleware): refreshes the Supabase session on every request.
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function proxy(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    // Everything except static assets, images, and the generated service worker.
    //
    // robots.txt is excluded deliberately: a crawler redirected to sign-in never
    // reads `Disallow: /p/`, which is one of the layers keeping shared passports
    // out of search results (FR-051b).
    '/((?!_next/static|_next/image|favicon.ico|sw.js|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}

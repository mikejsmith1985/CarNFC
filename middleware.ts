// Session refresh on every request, which is what makes "sign in once, then never again" true.
//
// Deliberately `middleware.ts` and not the Next 16 `proxy.ts` that supersedes
// it. Next 16's own upgrade guide states the edge runtime is NOT supported in
// `proxy` — it is always `nodejs` and cannot be configured — and OpenNext on
// Cloudflare Workers cannot run Node.js middleware. Keeping `middleware` is the
// documented route to the edge runtime, so the deployment target decides this,
// not preference. Revisit when Next ships edge support for `proxy`.
import type { NextRequest } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
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

// Session refresh for every request, which is what makes "sign in once, then never again" true (FR-047a).
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

/**
 * Paths reachable without a session: the two guest doors and the auth flow itself.
 *
 * `/api/test` is how a UX run obtains a session in the first place, so gating it
 * behind a session is circular. Those routes 404 in production regardless.
 *
 * `/t/` is deliberately absent. A tag tap needs a session to resolve against,
 * and the check belongs here rather than in the page: refreshing a token is
 * only durable where the rotated cookies can be written back, and a Server
 * Component cannot write cookies. A refresh landing there is thrown away, and
 * the next request presents a token the server has already rotated — which,
 * with reuse detection on, ends the session and asks for a new code.
 */
const PUBLIC_PATH_PREFIXES = [
  '/p/',
  '/auth',
  '/offline',
  '/tag-unavailable',
  '/tag-unknown',
  '/api/test',
]

/**
 * Refreshes the Supabase session and forwards the rotated cookies.
 *
 * Without this the refresh token is never exercised and a session eventually
 * lapses, which would put a sign-in screen between a greasy hand and a torque
 * specification — exactly what the product exists to avoid.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    },
  )

  // Reading the user is what triggers the refresh. Do not remove.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  const isPublicPath = PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  if (!user && !isPublicPath && pathname !== '/') {
    // Preserve where they were heading so the scan completes after the
    // one-time email code rather than dumping them on a home screen.
    const signInUrl = request.nextUrl.clone()
    signInUrl.pathname = '/auth/verify'
    signInUrl.searchParams.set('next', pathname + request.nextUrl.search)
    return NextResponse.redirect(signInUrl)
  }

  return response
}

// Server-side Supabase clients for Server Components, Server Actions, and Route Handlers.
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * Returns a Supabase client bound to the caller's session cookies.
 *
 * Everything this client does runs under Row Level Security as the signed-in
 * owner. It is the correct client for essentially all server work.
 */
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options)
            }
          } catch {
            // Server Components cannot set cookies. The middleware refreshes the
            // session on every request, so swallowing this is safe rather than
            // merely convenient.
          }
        },
      },
    },
  )
}

/**
 * Returns an unauthenticated client for the two guest paths.
 *
 * Used only to call `resolve_tag` and `get_public_passport`, both of which are
 * SECURITY DEFINER functions that validate their own input. This client holds
 * the anon key, never the service-role key.
 */
export function createAnonSupabaseClient() {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: { getAll: () => [], setAll: () => {} },
    },
  )
}

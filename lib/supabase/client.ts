// Browser-side Supabase client. Only ever sees the anon key, which grants nothing without a session.
'use client'

import { createBrowserClient } from '@supabase/ssr'

/**
 * Returns the browser Supabase client.
 *
 * The anon key here is public by design: every table has Row Level Security and
 * neither guest path (tag resolution, passport reading) is reachable through a
 * table policy, so a leaked anon key discloses nothing on its own.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}

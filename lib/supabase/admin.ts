// Server-only Supabase client holding the service-role key. Every use is a deliberate, narrow exception.
import 'server-only'

import { createClient } from '@supabase/supabase-js'

/**
 * A client that bypasses Row Level Security entirely.
 *
 * `import 'server-only'` makes a build fail if any client module reaches this
 * file, and scripts/check-secret-boundaries.ts catches the same mistake made
 * via an environment-variable rename. Both exist because one `"use client"` on
 * an importing file would otherwise ship the key to every visitor.
 *
 * There is exactly one legitimate caller in the request path: minting signed
 * URLs for attachments that `get_public_passport` has already authorized. The
 * bucket stays private and the guest never receives a durable credential —
 * only a link that expires.
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Service-role credentials are not configured for this environment.')
  }

  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
}

// Test-only sign-in endpoint, so UX specs get a genuine session without waiting on an email.
//
// Refuses to exist in production. UX tests need a real session cookie — mocking
// one would stop the specs from exercising the proxy, RLS, or the Server
// Actions, which is most of what they are for.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  const { email } = (await request.json()) as { email?: string }
  if (!email) return NextResponse.json({ error: 'email is required' }, { status: 400 })

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Local stack is not configured' }, { status: 500 })
  }

  // Generates a real magic link, then redeems it — the same verification path a
  // person would take, minus the inbox.
  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  })

  const { data, error } = await adminClient.auth.admin.generateLink({ type: 'magiclink', email })
  if (error || !data.properties) {
    return NextResponse.json(
      { error: error?.message ?? 'Could not create a link' },
      { status: 500 },
    )
  }

  const supabase = await createServerSupabaseClient()
  const { error: verifyError } = await supabase.auth.verifyOtp({
    type: 'magiclink',
    token_hash: data.properties.hashed_token,
  })

  if (verifyError) {
    return NextResponse.json({ error: verifyError.message }, { status: 401 })
  }

  return NextResponse.json({ ok: true })
}

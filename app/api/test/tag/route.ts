// Test-only lookup returning a seeded tag id, so UX specs can exercise a real scan without hard-coding identifiers.
//
// Tag ids are 128 bits of randomness minted per seed run, so they cannot be
// written into a spec file. Refuses to exist in production.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 })
  }

  const componentSlug = request.nextUrl.searchParams.get('component')
  if (!componentSlug) {
    return NextResponse.json({ error: 'component is required' }, { status: 400 })
  }

  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  if (!serviceRoleKey || !supabaseUrl) {
    return NextResponse.json({ error: 'Local stack is not configured' }, { status: 500 })
  }

  const adminClient = buildAdminClient(supabaseUrl, serviceRoleKey)

  // "unclaimed" asks for the unbound tag the seed leaves behind for the claim flow.
  if (componentSlug === 'unclaimed') return findUnclaimedTag(adminClient)

  const { data: component } = await adminClient
    .from('components')
    .select('id')
    .eq('slug', componentSlug)
    .limit(1)
    .maybeSingle()

  if (!component) return NextResponse.json({ error: 'Unknown component' }, { status: 404 })

  const { data: tag } = await adminClient
    .from('tags')
    .select('id')
    .eq('component_id', component.id)
    .limit(1)
    .maybeSingle()

  return tag
    ? NextResponse.json({ tagId: tag.id })
    : NextResponse.json({ error: 'No tag bound to that component' }, { status: 404 })
}

type AdminClient = ReturnType<typeof buildAdminClient>

/** Service-role client for the local stack only; this route 404s in production. */
function buildAdminClient(supabaseUrl: string, serviceRoleKey: string) {
  return createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })
}

/** Returns the unbound tag the seed leaves behind for the claim flow. */
async function findUnclaimedTag(adminClient: AdminClient) {
  const { data } = await adminClient
    .from('tags')
    .select('id')
    .is('vehicle_id', null)
    .limit(1)
    .maybeSingle()

  return data
    ? NextResponse.json({ tagId: (data as { id: string }).id })
    : NextResponse.json({ error: 'No unclaimed tag seeded' }, { status: 404 })
}

// Test-only lookup returning a seeded tag id, so UX specs can exercise a real scan without hard-coding identifiers.
//
// Tag ids are 128 bits of randomness minted per seed run, so they cannot be
// written into a spec file. Refuses to exist in production.

import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isTestAuthAllowed } from '@/lib/test-support/test-auth-gate'
import { generateTagBatch } from '@/lib/tags/generate'

export async function GET(request: NextRequest) {
  if (
    !isTestAuthAllowed({
      nodeEnv: process.env.NODE_ENV,
      enableTestAuth: process.env.SERVICECARD_ENABLE_TEST_AUTH,
      requestHost: request.headers.get('host'),
    })
  ) {
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

/**
 * Returns an unbound tag, minting one if the pool is empty.
 *
 * The claim spec consumes a tag every time it runs, so a fixed seed would make
 * the suite pass once and fail on every rerun. Minting on demand keeps it
 * idempotent — which is what lets it run repeatedly against a stack that is not
 * reset between runs.
 */
async function findUnclaimedTag(adminClient: AdminClient) {
  const { data } = await adminClient
    .from('tags')
    .select('id')
    .is('vehicle_id', null)
    .limit(1)
    .maybeSingle()

  if (data) return NextResponse.json({ tagId: (data as { id: string }).id })

  const [freshTag] = generateTagBatch(1)
  const { error } = await adminClient.from('tags').insert({ id: freshTag! })

  return error
    ? NextResponse.json({ error: error.message }, { status: 500 })
    : NextResponse.json({ tagId: freshTag })
}

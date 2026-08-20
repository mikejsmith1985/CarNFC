// Seeds the worked example from the specification: a 2014 F-150 Raptor at 112,450 miles with bound tags.
//
// UX tests assert against these exact fixtures, so the figures here are the
// ones in spec.md and quickstart.md rather than arbitrary demo data.

import { createClient } from '@supabase/supabase-js'
import { generateTagBatch } from '../lib/tags/generate'

const DEMO_EMAIL = 'demo@servicecard.local'
const RAPTOR_ODOMETER = 112_450

async function main(): Promise<void> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set.')
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  // --- owner ---------------------------------------------------------------
  const { data: created, error: userError } = await supabase.auth.admin.createUser({
    email: DEMO_EMAIL,
    email_confirm: true,
  })

  let ownerId = created?.user?.id
  if (userError || !ownerId) {
    const { data: existing } = await supabase.auth.admin.listUsers()
    ownerId = existing?.users.find((user) => user.email === DEMO_EMAIL)?.id
  }
  if (!ownerId) throw new Error('Could not create or find the demo owner.')

  await supabase.from('accounts').upsert({ id: ownerId, display_name: 'Demo Owner' })

  // --- vehicle -------------------------------------------------------------
  const { data: vehicle, error: vehicleError } = await supabase
    .from('vehicles')
    .upsert(
      {
        owner_id: ownerId,
        slug: 'raptor',
        year: 2014,
        make: 'Ford',
        model: 'F-150',
        trim: 'Raptor',
        nickname: 'Raptor',
        power_source: 'gasoline',
        current_odometer: RAPTOR_ODOMETER,
      },
      { onConflict: 'owner_id,slug' },
    )
    .select('id')
    .single()

  if (vehicleError || !vehicle) throw new Error(`Vehicle seed failed: ${vehicleError?.message}`)

  // --- components ----------------------------------------------------------
  const components = [
    { slug: 'front-diff', name: 'Front Differential', template: 'front-differential' },
    { slug: 'engine-oil', name: 'Engine Oil & Filter', template: 'engine-oil' },
    { slug: 'fuel-door', name: 'Fuel Filler', template: 'fuel-door' },
  ]

  const componentIds: Record<string, string> = {}

  for (const component of components) {
    const { data: template } = await supabase
      .from('component_templates')
      .select('default_specs, is_energy_port, energy_mode_hint, default_interval_miles')
      .eq('key', component.template)
      .single()

    const { data: row } = await supabase
      .from('components')
      .upsert(
        {
          vehicle_id: vehicle.id,
          slug: component.slug,
          display_name: component.name,
          template_key: component.template,
          is_energy_port: template?.is_energy_port ?? false,
          energy_mode_hint: template?.energy_mode_hint ?? null,
          service_interval_miles: template?.default_interval_miles ?? null,
        },
        { onConflict: 'vehicle_id,slug' },
      )
      .select('id')
      .single()

    if (!row) continue
    componentIds[component.slug] = row.id

    const specs = (template?.default_specs ?? []) as Array<Record<string, unknown>>
    if (specs.length > 0) {
      await supabase.from('component_specs').upsert(
        specs.map((spec, index) => ({
          component_id: row.id,
          spec_key: spec.spec_key,
          kind: spec.kind,
          label: spec.label,
          value: spec.value,
          unit: spec.unit,
          sort_order: index,
        })),
        { onConflict: 'component_id,spec_key' },
      )
    }
  }

  // --- tags ----------------------------------------------------------------
  const tagIds = generateTagBatch(components.length)
  for (const [index, component] of components.entries()) {
    await supabase.from('tags').upsert({
      id: tagIds[index]!,
      vehicle_id: vehicle.id,
      component_id: componentIds[component.slug]!,
      claimed_by: ownerId,
      claimed_at: new Date().toISOString(),
    })
  }

  // One unbound tag, so the claim flow has something to demonstrate on.
  const [unclaimedTag] = generateTagBatch(1)
  await supabase.from('tags').upsert({ id: unclaimedTag! })

  console.log('Demo data seeded.\n')
  console.log(`  Owner:    ${DEMO_EMAIL}`)
  console.log(`  Vehicle:  /v/raptor  (${RAPTOR_ODOMETER.toLocaleString()} mi)\n`)
  components.forEach((component, index) => {
    console.log(`  /t/${tagIds[index]}  ->  /v/raptor/c/${component.slug}`)
  })
  console.log(`  /t/${unclaimedTag}  ->  unclaimed, opens the claim flow`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

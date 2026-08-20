// Adding parts to a vehicle with no tag involved, against the real database.
//
// The defect these cover: a component only ever came into existence by claiming
// a tag stuck to it, so a vehicle carrying a single zone badge had no parts at
// all — and the badge opened to an empty screen that could not fix itself.

import { beforeEach, describe, expect, it } from 'vitest'
import { admin, asUser, asUserCommitted, createOwner, truncateAll } from './setup'

let ownerId = ''
let intruderId = ''
let vehicleId = ''

beforeEach(async () => {
  await truncateAll()
  ownerId = await createOwner('owner@example.com')
  intruderId = await createOwner('intruder@example.com')

  const vehicle = await admin().query<{ id: string }>(
    `insert into public.vehicles (owner_id, slug, power_source) values ($1, 'raptor', 'gasoline')
     returning id`,
    [ownerId],
  )
  vehicleId = vehicle.rows[0]!.id
})

/** The parts on a vehicle, as (template key, display name, slug). */
async function readParts(): Promise<
  Array<{
    template_key: string | null
    display_name: string
    slug: string
    zone_key: string | null
  }>
> {
  const { rows } = await admin().query(
    `select template_key, display_name, slug, zone_key from public.components
     where vehicle_id = $1 order by display_name`,
    [vehicleId],
  )
  return rows
}

describe('add_components_from_templates', () => {
  it('creates one component per template key', async () => {
    await asUserCommitted(ownerId, (client) =>
      client.query('select public.add_components_from_templates($1, $2)', [
        vehicleId,
        ['engine-oil', 'coolant'],
      ]),
    )

    const parts = await readParts()
    expect(parts.map((part) => part.template_key)).toEqual(['coolant', 'engine-oil'])
  })

  // Without this the card is empty until somebody types in a drain plug torque
  // they would have had to look up — which is the whole point of the library.
  it('copies the template specs onto the new part', async () => {
    await asUserCommitted(ownerId, (client) =>
      client.query('select public.add_components_from_templates($1, $2)', [
        vehicleId,
        ['engine-oil'],
      ]),
    )

    const { rows } = await admin().query<{ specs: string }>(
      `select count(*)::text as specs from public.component_specs
       where component_id = (select id from public.components where vehicle_id = $1)`,
      [vehicleId],
    )
    expect(Number(rows[0]!.specs)).toBeGreaterThan(0)
  })

  it('carries the template service interval', async () => {
    await asUserCommitted(ownerId, (client) =>
      client.query('select public.add_components_from_templates($1, $2)', [
        vehicleId,
        ['engine-oil'],
      ]),
    )

    const { rows } = await admin().query<{ service_interval_miles: number | null }>(
      'select service_interval_miles from public.components where vehicle_id = $1',
      [vehicleId],
    )
    expect(rows[0]!.service_interval_miles).toBeGreaterThan(0)
  })

  // Someone will press the button twice on a slow connection. Two engine oil
  // cards on one truck is a data problem that never resolves itself.
  it('skips a part the vehicle already has instead of duplicating it', async () => {
    await asUserCommitted(ownerId, (client) =>
      client.query('select public.add_components_from_templates($1, $2)', [
        vehicleId,
        ['engine-oil'],
      ]),
    )
    await asUserCommitted(ownerId, (client) =>
      client.query('select public.add_components_from_templates($1, $2)', [
        vehicleId,
        ['engine-oil', 'coolant'],
      ]),
    )

    const parts = await readParts()
    expect(parts.map((part) => part.template_key)).toEqual(['coolant', 'engine-oil'])
  })

  it('reports only what it actually created', async () => {
    await asUserCommitted(ownerId, (client) =>
      client.query('select public.add_components_from_templates($1, $2)', [
        vehicleId,
        ['engine-oil'],
      ]),
    )

    const created = await asUserCommitted(ownerId, async (client) => {
      const { rows } = await client.query<{ result: { created_slugs: string[] } }>(
        'select public.add_components_from_templates($1, $2) as result',
        [vehicleId, ['engine-oil', 'coolant']],
      )
      return rows[0]!.result.created_slugs
    })

    expect(created).toHaveLength(1)
  })

  it('refuses a vehicle the caller does not own', async () => {
    await expect(
      asUser(intruderId, (client) =>
        client.query('select public.add_components_from_templates($1, $2)', [
          vehicleId,
          ['engine-oil'],
        ]),
      ),
    ).rejects.toThrow(/vehicle_not_owned/)
  })

  it('refuses a template that is not in the library', async () => {
    await expect(
      asUser(ownerId, (client) =>
        client.query('select public.add_components_from_templates($1, $2)', [
          vehicleId,
          ['flux-capacitor'],
        ]),
      ),
    ).rejects.toThrow(/unknown_template/)
  })

  // A rejected batch must add nothing at all. Half a working area created, with
  // no indication which half, is worse than a clean failure.
  it('adds nothing when one key in the batch is unknown', async () => {
    await expect(
      asUserCommitted(ownerId, (client) =>
        client.query('select public.add_components_from_templates($1, $2)', [
          vehicleId,
          ['engine-oil', 'flux-capacitor'],
        ]),
      ),
    ).rejects.toThrow(/unknown_template/)

    expect(await readParts()).toHaveLength(0)
  })

  it('accepts an empty list without creating anything', async () => {
    await asUserCommitted(ownerId, (client) =>
      client.query('select public.add_components_from_templates($1, $2)', [vehicleId, []]),
    )
    expect(await readParts()).toHaveLength(0)
  })
})

describe('add_custom_component', () => {
  it('creates a part with no template behind it', async () => {
    await asUserCommitted(ownerId, (client) =>
      client.query('select public.add_custom_component($1, $2)', [vehicleId, 'Warn winch']),
    )

    const parts = await readParts()
    expect(parts).toHaveLength(1)
    expect(parts[0]!.template_key).toBeNull()
    expect(parts[0]!.display_name).toBe('Warn winch')
    expect(parts[0]!.slug).toBe('warn-winch')
  })

  // Named from a zone badge and left unplaced, the part would be invisible to
  // the very badge that just created it.
  it('places the part in the zone it was named from', async () => {
    await asUserCommitted(ownerId, (client) =>
      client.query('select public.add_custom_component($1, $2, $3)', [
        vehicleId,
        'Warn winch',
        'under-hood',
      ]),
    )

    const parts = await readParts()
    expect(parts[0]!.zone_key).toBe('under-hood')
  })

  it('leaves the part unplaced when no zone is given', async () => {
    await asUserCommitted(ownerId, (client) =>
      client.query('select public.add_custom_component($1, $2)', [vehicleId, 'Warn winch']),
    )

    const parts = await readParts()
    expect(parts[0]!.zone_key).toBeNull()
  })

  it('gives a second part of the same name its own address', async () => {
    await asUserCommitted(ownerId, (client) =>
      client.query('select public.add_custom_component($1, $2)', [vehicleId, 'Warn winch']),
    )
    await asUserCommitted(ownerId, (client) =>
      client.query('select public.add_custom_component($1, $2)', [vehicleId, 'Warn winch']),
    )

    const parts = await readParts()
    expect(parts.map((part) => part.slug).sort()).toEqual(['warn-winch', 'warn-winch-2'])
  })

  it('refuses a blank name', async () => {
    await expect(
      asUser(ownerId, (client) =>
        client.query('select public.add_custom_component($1, $2)', [vehicleId, '   ']),
      ),
    ).rejects.toThrow(/name_required/)
  })

  it('refuses a vehicle the caller does not own', async () => {
    await expect(
      asUser(intruderId, (client) =>
        client.query('select public.add_custom_component($1, $2)', [vehicleId, 'Warn winch']),
      ),
    ).rejects.toThrow(/vehicle_not_owned/)
  })
})

describe('create_component_for_vehicle', () => {
  // The builder skips the ownership check its callers already did. Because it
  // runs as the caller, the row-level policy is what actually stops a stranger
  // — so reaching it directly must still create nothing.
  it('cannot add a part to a vehicle the caller does not own', async () => {
    await expect(
      asUserCommitted(intruderId, (client) =>
        client.query('select public.create_component_for_vehicle($1, $2, $3, $4)', [
          vehicleId,
          'sneaky',
          null,
          'Sneaky',
        ]),
      ),
    ).rejects.toThrow(/row-level security/i)

    expect(await readParts()).toHaveLength(0)
  })
})

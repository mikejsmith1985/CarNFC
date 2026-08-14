// Proves the card RPC returns what the mechanics HUD depends on: effective specs, override precedence, and a tombstone-free timeline.

import { beforeEach, describe, expect, it } from 'vitest'
import { admin, asUser, asUserCommitted, createOwner, truncateAll } from './setup'

let ownerId = ''
let strangerId = ''
let vehicleId = ''
let componentId = ''
let nextId = 500

function newId(): string {
  nextId += 1
  return `018f0000-0000-7000-8000-${String(nextId).padStart(12, '0')}`
}

interface CardSpec {
  spec_key: string
  label: string
  effective_value: string
  unit: string | null
  origin: 'factory' | 'override'
  factory_value: string | null
  superseded_override_count: number
}

interface Card {
  vehicle: Record<string, unknown>
  component: Record<string, unknown>
  specs: CardSpec[]
  reminders: Array<Record<string, unknown>>
  timeline: Array<Record<string, unknown>>
  timeline_has_more: boolean
}

beforeEach(async () => {
  await truncateAll()
  ownerId = await createOwner('owner@example.com')
  strangerId = await createOwner('stranger@example.com')

  const vehicle = await admin().query<{ id: string }>(
    `insert into public.vehicles (owner_id, slug, year, make, model, power_source, current_odometer)
     values ($1, 'raptor', 2014, 'Ford', 'F-150', 'gasoline', 112450) returning id`,
    [ownerId],
  )
  vehicleId = vehicle.rows[0]!.id

  const component = await admin().query<{ id: string }>(
    `insert into public.components (vehicle_id, slug, display_name, service_interval_miles)
     values ($1, 'front-diff', 'Front Differential', 30000) returning id`,
    [vehicleId],
  )
  componentId = component.rows[0]!.id

  await admin().query(
    `insert into public.component_specs (component_id, spec_key, kind, label, value, unit, sort_order)
     values ($1, 'drain_torque', 'torque', 'Drain torque', '24', 'ft-lbs', 1),
            ($1, 'capacity', 'capacity', 'Capacity', '2.1', 'qt', 2)`,
    [componentId],
  )
})

async function readCard(userId: string | null): Promise<Card | null> {
  return asUser(userId, async (client) => {
    const result = await client.query<{ card: Card | null }>(
      'select public.get_component_card($1, $2, 20) as card',
      ['raptor', 'front-diff'],
    )
    return result.rows[0]!.card
  })
}

/** Adds a service entry with one revision, returning the revision id. */
async function addEntry(
  category: string,
  columns: Record<string, unknown>,
  performedOn = '2026-06-12',
  odometer = 110000,
): Promise<string> {
  const entryId = newId()
  const revisionId = newId()

  await admin().query(
    'insert into public.service_entries (id, component_id, created_by) values ($1, $2, $3)',
    [entryId, componentId, ownerId],
  )

  const base: Record<string, unknown> = {
    id: revisionId,
    entry_id: entryId,
    author_id: ownerId,
    client_created_at: new Date().toISOString(),
    category,
    performed_on: performedOn,
    odometer,
    ...columns,
  }
  const names = Object.keys(base)
  await admin().query(
    `insert into public.service_entry_revisions (${names.join(', ')})
     values (${names.map((_, index) => `$${index + 1}`).join(', ')})`,
    Object.values(base),
  )

  return revisionId
}

describe('ownership (FR-048)', () => {
  it('returns the card to its owner', async () => {
    const card = await readCard(ownerId)
    expect(card?.vehicle.slug).toBe('raptor')
    expect(card?.component.display_name).toBe('Front Differential')
  })

  it('returns nothing to a non-owner', async () => {
    // The route renders 404 on null — never 403, which would confirm existence.
    expect(await readCard(strangerId)).toBeNull()
  })

  it('cannot even be invoked by an anonymous caller', async () => {
    // Stronger than returning null: EXECUTE is revoked from PUBLIC, so the
    // owner-facing RPC is not reachable surface for an unauthenticated caller.
    await expect(readCard(null)).rejects.toThrow(/permission denied/i)
  })
})

describe('effective specifications (FR-009, FR-010)', () => {
  it('reports factory specs as factory when nothing has overridden them', async () => {
    const card = await readCard(ownerId)
    const torque = card!.specs.find((spec) => spec.spec_key === 'drain_torque')!

    expect(torque.origin).toBe('factory')
    expect(torque.effective_value).toBe('24')
    expect(torque.superseded_override_count).toBe(0)
  })

  it('lets an upgrade override a factory value and keeps the factory value visible', async () => {
    const revisionId = await addEntry('upgrade', { upgrade_brand: 'ARB', product_name: 'Cover' })
    await admin().query(
      `insert into public.spec_overrides
         (revision_id, component_id, spec_key, kind, label, new_value, unit, superseded_value)
       values ($1, $2, 'drain_torque', 'torque', 'Drain torque', '45', 'ft-lbs', '24')`,
      [revisionId, componentId],
    )

    const card = await readCard(ownerId)
    const torque = card!.specs.find((spec) => spec.spec_key === 'drain_torque')!

    // This is the value someone sets a torque wrench to. Getting it wrong is
    // the most consequential thing this product can do.
    expect(torque.effective_value).toBe('45')
    expect(torque.origin).toBe('override')
    expect(torque.factory_value).toBe('24')
  })

  it('makes the most recent of two overrides effective, and counts the superseded one', async () => {
    const firstRevision = await addEntry('upgrade', { upgrade_brand: 'ARB' }, '2025-01-15', 95000)
    await admin().query(
      `insert into public.spec_overrides
         (revision_id, component_id, spec_key, kind, label, new_value, unit, superseded_value)
       values ($1, $2, 'capacity', 'capacity', 'Capacity', '2.5', 'qt', '2.1')`,
      [firstRevision, componentId],
    )

    // A later install changes the same figure again.
    const secondRevision = await addEntry(
      'upgrade',
      { upgrade_brand: 'Yukon' },
      '2026-03-01',
      108000,
    )
    await admin().query(
      `insert into public.spec_overrides
         (revision_id, component_id, spec_key, kind, label, new_value, unit, superseded_value)
       values ($1, $2, 'capacity', 'capacity', 'Capacity', '2.8', 'qt', '2.5')`,
      [secondRevision, componentId],
    )

    const card = await readCard(ownerId)
    const capacity = card!.specs.find((spec) => spec.spec_key === 'capacity')!

    expect(capacity.effective_value).toBe('2.8')
    expect(capacity.superseded_override_count).toBe(1)
  })

  it('surfaces an override for a spec the factory never had', async () => {
    const revisionId = await addEntry('upgrade', { upgrade_brand: 'ARB' })
    await admin().query(
      `insert into public.spec_overrides
         (revision_id, component_id, spec_key, kind, label, new_value, unit)
       values ($1, $2, 'locker_psi', 'capacity', 'Locker air pressure', '105', 'psi')`,
      [revisionId, componentId],
    )

    const card = await readCard(ownerId)
    const locker = card!.specs.find((spec) => spec.spec_key === 'locker_psi')

    // An aftermarket part can introduce a figure the OEM equivalent had no
    // counterpart for. It still has to reach the HUD.
    expect(locker?.effective_value).toBe('105')
    expect(locker?.origin).toBe('override')
    expect(locker?.factory_value).toBeNull()
  })

  it('falls back to the factory value when the upgrade that overrode it is tombstoned', async () => {
    const entryId = newId()
    const revisionId = newId()

    await admin().query(
      'insert into public.service_entries (id, component_id, created_by) values ($1, $2, $3)',
      [entryId, componentId, ownerId],
    )
    await admin().query(
      `insert into public.service_entry_revisions
         (id, entry_id, author_id, client_created_at, category, performed_on, odometer, upgrade_brand)
       values ($1, $2, $3, now(), 'upgrade', '2026-01-01', 100000, 'ARB')`,
      [revisionId, entryId, ownerId],
    )
    await admin().query(
      `insert into public.spec_overrides
         (revision_id, component_id, spec_key, kind, label, new_value, unit, superseded_value)
       values ($1, $2, 'drain_torque', 'torque', 'Drain torque', '45', 'ft-lbs', '24')`,
      [revisionId, componentId],
    )

    // Deleting the entry means writing a tombstone, never removing the row.
    await admin().query(
      `insert into public.service_entry_revisions
         (id, entry_id, supersedes_revision_id, is_tombstone, author_id, client_created_at)
       values ($1, $2, $3, true, $4, now())`,
      [newId(), entryId, revisionId, ownerId],
    )

    const card = await readCard(ownerId)
    const torque = card!.specs.find((spec) => spec.spec_key === 'drain_torque')!

    expect(torque.effective_value).toBe('24')
    expect(torque.origin).toBe('factory')
  })
})

describe('timeline (FR-012, FR-027a)', () => {
  it('is empty for a component with no history, while specs still render', async () => {
    const card = await readCard(ownerId)
    expect(card!.timeline).toEqual([])
    expect(card!.specs.length).toBeGreaterThan(0)
  })

  it('returns entries newest first', async () => {
    await addEntry('maintenance', { fluid_type: 'Old' }, '2025-01-15', 95000)
    await addEntry('maintenance', { fluid_type: 'New' }, '2026-06-12', 110000)

    const card = await readCard(ownerId)
    expect(card!.timeline.map((entry) => entry.performed_on)).toEqual(['2026-06-12', '2025-01-15'])
  })

  it('omits a tombstoned entry entirely', async () => {
    const entryId = newId()
    const revisionId = newId()
    await admin().query(
      'insert into public.service_entries (id, component_id, created_by) values ($1, $2, $3)',
      [entryId, componentId, ownerId],
    )
    await admin().query(
      `insert into public.service_entry_revisions
         (id, entry_id, author_id, client_created_at, category, performed_on, odometer)
       values ($1, $2, $3, now(), 'maintenance', '2026-06-12', 110000)`,
      [revisionId, entryId, ownerId],
    )
    await admin().query(
      `insert into public.service_entry_revisions
         (id, entry_id, supersedes_revision_id, is_tombstone, author_id, client_created_at)
       values ($1, $2, $3, true, $4, now())`,
      [newId(), entryId, revisionId, ownerId],
    )

    expect((await readCard(ownerId))!.timeline).toEqual([])
  })

  it('shows the latest revision and flags the entry as edited', async () => {
    const entryId = newId()
    const firstRevision = newId()
    await admin().query(
      'insert into public.service_entries (id, component_id, created_by) values ($1, $2, $3)',
      [entryId, componentId, ownerId],
    )
    await admin().query(
      `insert into public.service_entry_revisions
         (id, entry_id, author_id, client_created_at, category, performed_on, odometer, notes)
       values ($1, $2, $3, now(), 'maintenance', '2026-06-12', 110000, 'First wording')`,
      [firstRevision, entryId, ownerId],
    )
    await admin().query(
      `insert into public.service_entry_revisions
         (id, entry_id, supersedes_revision_id, author_id, client_created_at,
          category, performed_on, odometer, notes)
       values ($1, $2, $3, $4, now(), 'maintenance', '2026-06-12', 110000, 'Corrected wording')`,
      [newId(), entryId, firstRevision, ownerId],
    )

    const card = await readCard(ownerId)
    expect(card!.timeline).toHaveLength(1)
    expect(card!.timeline[0]!.notes).toBe('Corrected wording')
    expect(card!.timeline[0]!.is_edited).toBe(true)
  })

  it('carries only the selected category fields for an entry', async () => {
    await addEntry('replace', { new_part_number: 'BP-1', brand: 'Akebono' })

    const card = await readCard(ownerId)
    const fields = card!.timeline[0]!.category_fields as Record<string, unknown>

    expect(fields.new_part_number).toBe('BP-1')
    // jsonb_strip_nulls removes the categories that do not apply.
    expect(fields.symptom).toBeUndefined()
    expect(fields.fluid_type).toBeUndefined()
  })
})

describe('recompute_component_derived (FR-023, FR-027c)', () => {
  it('creates a re-check reminder from a repair offset', async () => {
    await addEntry('repair', { symptom: 'Weeping seal', recheck_miles: 50 }, '2026-06-12', 110000)

    await asUserCommitted(ownerId, (client) =>
      client.query('select public.recompute_component_derived($1)', [componentId]),
    )

    const { rows } = await admin().query<{ kind: string; due_odometer: number }>(
      'select kind, due_odometer from public.reminders where component_id = $1',
      [componentId],
    )
    expect(rows).toHaveLength(1)
    expect(rows[0]!.kind).toBe('recheck')
    expect(rows[0]!.due_odometer).toBe(110050)
  })

  it('creates a next-due reminder from the component interval', async () => {
    await addEntry('maintenance', { fluid_type: '75W-90' }, '2026-06-12', 110000)

    await asUserCommitted(ownerId, (client) =>
      client.query('select public.recompute_component_derived($1)', [componentId]),
    )

    const { rows } = await admin().query<{ kind: string; due_odometer: number }>(
      `select kind, due_odometer from public.reminders
       where component_id = $1 and kind = 'next_due'`,
      [componentId],
    )
    expect(rows[0]!.due_odometer).toBe(140000)
  })

  it('is idempotent, so a retried sync cannot double the reminders', async () => {
    await addEntry('repair', { symptom: 'Leak', recheck_miles: 50 })

    for (let i = 0; i < 3; i += 1) {
      await asUserCommitted(ownerId, (client) =>
        client.query('select public.recompute_component_derived($1)', [componentId]),
      )
    }

    const { rows } = await admin().query<{ count: string }>(
      'select count(*)::text as count from public.reminders where component_id = $1',
      [componentId],
    )
    expect(rows[0]!.count).toBe('1')
  })
})

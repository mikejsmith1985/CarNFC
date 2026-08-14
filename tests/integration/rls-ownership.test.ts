// Proves Row Level Security actually isolates owners, and that append-only is enforced by privilege rather than convention.

import { beforeEach, describe, expect, it } from 'vitest'
import { admin, asUser, createOwner, truncateAll } from './setup'

let ownerId = ''
let strangerId = ''
let vehicleId = ''
let componentId = ''

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
    `insert into public.components (vehicle_id, slug, display_name)
     values ($1, 'front-diff', 'Front Differential') returning id`,
    [vehicleId],
  )
  componentId = component.rows[0]!.id
})

describe('vehicle isolation (FR-048)', () => {
  it('lets the owner read their own vehicle', async () => {
    const rows = await asUser(ownerId, async (client) => {
      const result = await client.query('select id from public.vehicles')
      return result.rows
    })
    expect(rows).toHaveLength(1)
  })

  it('shows a non-owner nothing', async () => {
    const rows = await asUser(strangerId, async (client) => {
      const result = await client.query('select id from public.vehicles')
      return result.rows
    })
    expect(rows).toHaveLength(0)
  })

  it('does not let an anonymous caller reach the table at all', async () => {
    // Stronger than an empty result: anon holds no table privilege, so the
    // statement is refused before RLS is even consulted. Both guest paths are
    // SECURITY DEFINER functions, so a leaked anon key reaches no table.
    await expect(
      asUser(null, (client) => client.query('select id from public.vehicles')),
    ).rejects.toThrow(/permission denied/i)
  })

  it('refuses to let a non-owner insert a vehicle under someone else', async () => {
    await expect(
      asUser(strangerId, (client) =>
        client.query(
          `insert into public.vehicles (owner_id, slug, power_source)
           values ($1, 'stolen', 'gasoline')`,
          [ownerId],
        ),
      ),
    ).rejects.toThrow(/row-level security/i)
  })

  it('hides components belonging to another owner', async () => {
    const rows = await asUser(strangerId, async (client) => {
      const result = await client.query('select id from public.components')
      return result.rows
    })
    expect(rows).toHaveLength(0)
  })

  it('hides component specs belonging to another owner', async () => {
    await admin().query(
      `insert into public.component_specs (component_id, spec_key, kind, label, value, unit)
       values ($1, 'drain_torque', 'torque', 'Drain torque', '24', 'ft-lbs')`,
      [componentId],
    )

    const rows = await asUser(strangerId, async (client) => {
      const result = await client.query('select id from public.component_specs')
      return result.rows
    })
    expect(rows).toHaveLength(0)
  })
})

describe('append-only enforcement (FR-027)', () => {
  it('grants no UPDATE or DELETE on either revision table to any application role', async () => {
    // Immutability is a privilege boundary, not a convention application code
    // has to remember. This is the assertion that keeps it that way.
    const { rows } = await admin().query<{ grantee: string; privilege_type: string }>(
      `select grantee, privilege_type from information_schema.role_table_grants
       where table_schema = 'public'
         and table_name in ('service_entry_revisions', 'energy_entry_revisions')
         and grantee in ('anon', 'authenticated', 'service_role')
         and privilege_type in ('UPDATE', 'DELETE')`,
    )
    expect(rows).toEqual([])
  })

  it('has no UPDATE or DELETE policy on either revision table', async () => {
    const { rows } = await admin().query<{ policyname: string; cmd: string }>(
      `select policyname, cmd from pg_policies
       where schemaname = 'public'
         and tablename in ('service_entry_revisions', 'energy_entry_revisions')
         and cmd in ('UPDATE', 'DELETE')`,
    )
    expect(rows).toEqual([])
  })

  it('refuses an owner attempting to rewrite their own revision', async () => {
    const entryId = '018f0000-0000-7000-8000-000000000001'
    const revisionId = '018f0000-0000-7000-8000-000000000002'

    await admin().query(
      `insert into public.service_entries (id, component_id, created_by) values ($1, $2, $3)`,
      [entryId, componentId, ownerId],
    )
    await admin().query(
      `insert into public.service_entry_revisions
         (id, entry_id, author_id, client_created_at, category, performed_on, odometer, notes)
       values ($1, $2, $3, now(), 'maintenance', '2026-06-12', 110000, 'Changed fluid')`,
      [revisionId, entryId, ownerId],
    )

    // Refused outright by the missing privilege, not silently filtered to zero
    // rows by RLS. A loud failure is the right outcome: code that tries to
    // rewrite history should break, not quietly appear to succeed.
    await expect(
      asUser(ownerId, (client) =>
        client.query(
          `update public.service_entry_revisions set notes = 'rewritten' where id = $1`,
          [revisionId],
        ),
      ),
    ).rejects.toThrow(/permission denied/i)

    const { rows } = await admin().query<{ notes: string }>(
      'select notes from public.service_entry_revisions where id = $1',
      [revisionId],
    )
    expect(rows[0]!.notes).toBe('Changed fluid')
  })

  it('refuses a delete of a revision, even by its author', async () => {
    const entryId = '018f0000-0000-7000-8000-000000000003'
    const revisionId = '018f0000-0000-7000-8000-000000000004'

    await admin().query(
      'insert into public.service_entries (id, component_id, created_by) values ($1, $2, $3)',
      [entryId, componentId, ownerId],
    )
    await admin().query(
      `insert into public.service_entry_revisions
         (id, entry_id, author_id, client_created_at, category, performed_on, odometer)
       values ($1, $2, $3, now(), 'repair', '2026-06-12', 110000)`,
      [revisionId, entryId, ownerId],
    )

    // Deleting is expressed as a tombstone revision, never as an actual delete.
    await expect(
      asUser(ownerId, (client) =>
        client.query('delete from public.service_entry_revisions where id = $1', [revisionId]),
      ),
    ).rejects.toThrow(/permission denied/i)
  })
})

describe('exactly-once insertion (FR-041)', () => {
  it('yields one row when the same revision id is submitted twice', async () => {
    const entryId = '018f0000-0000-7000-8000-000000000010'
    const revisionId = '018f0000-0000-7000-8000-000000000011'

    await admin().query(
      'insert into public.service_entries (id, component_id, created_by) values ($1, $2, $3)',
      [entryId, componentId, ownerId],
    )

    const insertRevision = () =>
      admin().query(
        `insert into public.service_entry_revisions
           (id, entry_id, author_id, client_created_at, category, performed_on, odometer)
         values ($1, $2, $3, now(), 'maintenance', '2026-06-12', 110000)
         on conflict (id) do nothing`,
        [revisionId, entryId, ownerId],
      )

    await insertRevision()
    await insertRevision() // the retry after an ambiguous network failure

    const { rows } = await admin().query<{ count: string }>(
      'select count(*)::text as count from public.service_entry_revisions where id = $1',
      [revisionId],
    )
    expect(rows[0]!.count).toBe('1')
  })
})

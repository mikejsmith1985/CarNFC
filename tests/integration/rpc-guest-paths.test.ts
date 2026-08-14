// Proves the two SECURITY DEFINER guest paths disclose exactly what they should and nothing more.

import { beforeEach, describe, expect, it } from 'vitest'
import { createHash } from 'node:crypto'
import { admin, asUser, createOwner, truncateAll } from './setup'

let ownerId = ''
let strangerId = ''
let vehicleId = ''
let componentId = ''

const CLAIMED_TAG = 'abcdefghijkmnpqrstuvwxyz'
const UNCLAIMED_TAG = 'nnnnnnnnnnnnnnnnnnnnnnnn'

function hashToken(token: string): string {
  return `\\x${createHash('sha256').update(token, 'utf8').digest('hex')}`
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
    `insert into public.components (vehicle_id, slug, display_name)
     values ($1, 'front-diff', 'Front Differential') returning id`,
    [vehicleId],
  )
  componentId = component.rows[0]!.id

  await admin().query(
    `insert into public.tags (id, vehicle_id, component_id, claimed_by, claimed_at)
     values ($1, $2, $3, $4, now())`,
    [CLAIMED_TAG, vehicleId, componentId, ownerId],
  )
  await admin().query('insert into public.tags (id) values ($1)', [UNCLAIMED_TAG])
})

async function resolveTagAs(userId: string | null, tagId: string) {
  return asUser(userId, async (client) => {
    const result = await client.query<{ resolve_tag: Record<string, string> }>(
      'select public.resolve_tag($1) as resolve_tag',
      [tagId],
    )
    return result.rows[0]!.resolve_tag
  })
}

describe('resolve_tag (FR-001a, FR-003)', () => {
  it('gives the owner the readable address', async () => {
    expect(await resolveTagAs(ownerId, CLAIMED_TAG)).toEqual({
      status: 'owned',
      vehicle_slug: 'raptor',
      component_slug: 'front-diff',
    })
  })

  it('tells an anonymous caller an unclaimed tag is unclaimed', async () => {
    // The claim flow depends on this: a stock tag has to be routable by someone
    // who has not signed in yet.
    expect(await resolveTagAs(null, UNCLAIMED_TAG)).toEqual({ status: 'unclaimed' })
  })

  it('tells a non-owner nothing about a claimed tag', async () => {
    expect(await resolveTagAs(strangerId, CLAIMED_TAG)).toEqual({ status: 'forbidden' })
  })

  it('tells an anonymous caller nothing about a claimed tag', async () => {
    expect(await resolveTagAs(null, CLAIMED_TAG)).toEqual({ status: 'forbidden' })
  })

  it('leaks no vehicle field in the forbidden branch', async () => {
    const resolution = await resolveTagAs(strangerId, CLAIMED_TAG)
    const serialized = JSON.stringify(resolution)

    for (const secret of ['raptor', 'front-diff', 'Ford', 'F-150', vehicleId, componentId]) {
      expect(serialized).not.toContain(secret)
    }
  })

  it('returns unknown for a tag that does not exist', async () => {
    expect(await resolveTagAs(null, 'zzzzzzzzzzzzzzzzzzzzzzzz')).toEqual({ status: 'unknown' })
  })

  it('gives forbidden and unknown the same shape, so neither can be told apart', async () => {
    const forbidden = await resolveTagAs(strangerId, CLAIMED_TAG)
    const unknown = await resolveTagAs(strangerId, 'zzzzzzzzzzzzzzzzzzzzzzzz')

    // Same single key, same payload size — nothing to distinguish a claimed tag
    // from one that was never manufactured.
    expect(Object.keys(forbidden)).toEqual(Object.keys(unknown))
  })
})

describe('get_public_passport (FR-049a, FR-050, FR-051)', () => {
  const LIVE_TOKEN = 'live-token-value'
  const REVOKED_TOKEN = 'revoked-token-value'

  async function seedHistory() {
    const entryId = '018f0000-0000-7000-8000-0000000000a1'
    await admin().query(
      'insert into public.service_entries (id, component_id, created_by) values ($1, $2, $3)',
      [entryId, componentId, ownerId],
    )
    await admin().query(
      `insert into public.service_entry_revisions
         (id, entry_id, author_id, client_created_at, category, performed_on, odometer, notes,
          new_part_number, cost)
       values ($1, $2, $3, now(), 'replace', '2026-06-12', 110000, 'New pads', 'BP-1', 249.99)`,
      ['018f0000-0000-7000-8000-0000000000a2', entryId, ownerId],
    )
  }

  async function readPassport(token: string) {
    return asUser(null, async (client) => {
      const result = await client.query<{ passport: Record<string, unknown> | null }>(
        'select public.get_public_passport($1) as passport',
        [token],
      )
      return result.rows[0]!.passport
    })
  }

  it('returns nothing when the vehicle has never been shared', async () => {
    await seedHistory()
    expect(await readPassport(LIVE_TOKEN)).toBeNull()
  })

  it('returns the history to whoever holds a live link', async () => {
    await seedHistory()
    await admin().query(
      'insert into public.passport_shares (vehicle_id, token_hash) values ($1, $2)',
      [vehicleId, hashToken(LIVE_TOKEN)],
    )

    const passport = await readPassport(LIVE_TOKEN)
    expect(passport).not.toBeNull()
    expect((passport!.history as unknown[]).length).toBe(1)
  })

  it('nulls costs unless the owner opted in', async () => {
    await seedHistory()
    await admin().query(
      `insert into public.passport_shares (vehicle_id, token_hash, include_costs)
       values ($1, $2, false)`,
      [vehicleId, hashToken(LIVE_TOKEN)],
    )

    const passport = await readPassport(LIVE_TOKEN)
    const history = passport!.history as Array<Record<string, unknown>>
    expect(history[0]!.cost).toBeNull()
    // And the figure appears nowhere else in the payload either.
    expect(JSON.stringify(passport)).not.toContain('249.99')
  })

  it('includes costs when the owner did opt in', async () => {
    await seedHistory()
    await admin().query(
      `insert into public.passport_shares (vehicle_id, token_hash, include_costs)
       values ($1, $2, true)`,
      [vehicleId, hashToken(LIVE_TOKEN)],
    )

    const passport = await readPassport(LIVE_TOKEN)
    const history = passport!.history as Array<Record<string, unknown>>
    expect(Number(history[0]!.cost)).toBeCloseTo(249.99, 2)
  })

  it('never discloses owner identity', async () => {
    await seedHistory()
    await admin().query(
      `insert into public.passport_shares (vehicle_id, token_hash, include_costs)
       values ($1, $2, true)`,
      [vehicleId, hashToken(LIVE_TOKEN)],
    )

    const serialized = JSON.stringify(await readPassport(LIVE_TOKEN))
    expect(serialized).not.toContain(ownerId)
    expect(serialized).not.toContain('owner@example.com')
  })

  it('refuses a revoked token', async () => {
    await seedHistory()
    await admin().query(
      `insert into public.passport_shares (vehicle_id, token_hash, revoked_at)
       values ($1, $2, now())`,
      [vehicleId, hashToken(REVOKED_TOKEN)],
    )

    expect(await readPassport(REVOKED_TOKEN)).toBeNull()
  })

  it('does not revive a revoked token when a new link is minted', async () => {
    await seedHistory()
    await admin().query(
      `insert into public.passport_shares (vehicle_id, token_hash, revoked_at)
       values ($1, $2, now())`,
      [vehicleId, hashToken(REVOKED_TOKEN)],
    )
    await admin().query(
      'insert into public.passport_shares (vehicle_id, token_hash) values ($1, $2)',
      [vehicleId, hashToken(LIVE_TOKEN)],
    )

    // This is what makes "never reissued" a guarantee rather than a probability.
    expect(await readPassport(REVOKED_TOKEN)).toBeNull()
    expect(await readPassport(LIVE_TOKEN)).not.toBeNull()
  })

  it('allows only one live share per vehicle', async () => {
    await admin().query(
      'insert into public.passport_shares (vehicle_id, token_hash) values ($1, $2)',
      [vehicleId, hashToken(LIVE_TOKEN)],
    )
    await expect(
      admin().query('insert into public.passport_shares (vehicle_id, token_hash) values ($1, $2)', [
        vehicleId,
        hashToken('another-token'),
      ]),
    ).rejects.toThrow(/one_live_per_vehicle/)
  })

  it('refuses an unknown token', async () => {
    expect(await readPassport('never-existed')).toBeNull()
  })
})

// Drives the real outbox against real PostgreSQL, proving exactly-once delivery, never-discard, and convergence across devices.
//
// The database is the real infrastructure here and is exercised as such. The
// outbox store is in-memory rather than IndexedDB because IndexedDB is a browser
// primitive with no Node implementation — its behaviour belongs to the UX layer.
// What is under test is the drain loop's contract with an actual database, and
// that is genuine.

import { beforeEach, describe, expect, it } from 'vitest'
import { createOutbox, type OutboxRecord, type OutboxStore } from '@/lib/offline/outbox'
import { admin, createOwner, truncateAll } from './setup'

let ownerId = ''
let vehicleId = ''
let componentId = ''
let currentTimeMs = 1_000_000
const now = () => currentTimeMs

function createMemoryStore(): OutboxStore & { records: Map<string, OutboxRecord> } {
  const records = new Map<string, OutboxRecord>()
  return {
    records,
    async put(record) {
      records.set(record.id, record)
    },
    async getAll() {
      return [...records.values()]
    },
    async remove(id) {
      records.delete(id)
    },
  }
}

interface RevisionPayload {
  revisionId: string
  entryId: string
  supersedesRevisionId?: string | null
  notes: string
  odometer: number
  /** What the device believed the time was. Deliberately untrusted. */
  clientCreatedAt: string
}

/**
 * Delivers a revision the way the Server Action does: create the entry if
 * absent, then insert the revision with `ON CONFLICT DO NOTHING`.
 *
 * This is where exactly-once actually lives — not in the queue, but in the
 * database refusing a duplicate primary key.
 */
async function deliverRevision(record: OutboxRecord): Promise<{ ok: boolean; error?: string }> {
  const payload = record.payload as RevisionPayload

  await admin().query(
    `insert into public.service_entries (id, component_id, created_by)
     values ($1, $2, $3) on conflict (id) do nothing`,
    [payload.entryId, componentId, ownerId],
  )

  await admin().query(
    `insert into public.service_entry_revisions
       (id, entry_id, supersedes_revision_id, author_id, client_created_at,
        category, performed_on, odometer, notes)
     values ($1, $2, $3, $4, $5, 'maintenance', '2026-06-12', $6, $7)
     on conflict (id) do nothing`,
    [
      payload.revisionId,
      payload.entryId,
      payload.supersedesRevisionId ?? null,
      ownerId,
      payload.clientCreatedAt,
      payload.odometer,
      payload.notes,
    ],
  )

  return { ok: true }
}

/** Counts revisions for one entry, whatever their state. */
async function countRevisions(entryId: string): Promise<number> {
  const { rows } = await admin().query<{ count: string }>(
    'select count(*)::text as count from public.service_entry_revisions where entry_id = $1',
    [entryId],
  )
  return Number(rows[0]!.count)
}

/** The revision the card would display for an entry. */
async function readCurrentNotes(entryId: string): Promise<string | null> {
  const { rows } = await admin().query<{ notes: string }>(
    'select notes from public.v_current_service_revisions where entry_id = $1',
    [entryId],
  )
  return rows[0]?.notes ?? null
}

beforeEach(async () => {
  await truncateAll()
  currentTimeMs = 1_000_000
  ownerId = await createOwner('owner@example.com')

  const vehicle = await admin().query<{ id: string }>(
    `insert into public.vehicles (owner_id, slug, power_source, current_odometer)
     values ($1, 'raptor', 'gasoline', 100000) returning id`,
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

describe('exactly-once delivery (FR-041, SC-005)', () => {
  it('produces one row when an ambiguous failure is retried', async () => {
    const store = createMemoryStore()
    let hasFailedOnce = false

    // The nastiest real case: the insert lands, then the connection drops
    // before the acknowledgement gets back. The client cannot tell.
    const flakySubmit = async (record: OutboxRecord) => {
      await deliverRevision(record)
      if (!hasFailedOnce) {
        hasFailedOnce = true
        throw new Error('Connection reset after write')
      }
      return { ok: true }
    }

    const outbox = createOutbox({
      store,
      submitters: { service_revision: flakySubmit, energy_revision: flakySubmit },
      now,
    })

    const entryId = '018f0000-0000-7000-8000-000000000101'
    await outbox.enqueue({
      id: '018f0000-0000-7000-8000-000000000102',
      kind: 'service_revision',
      payload: {
        revisionId: '018f0000-0000-7000-8000-000000000102',
        entryId,
        notes: 'Changed fluid',
        odometer: 110000,
        clientCreatedAt: new Date().toISOString(),
      },
    })

    await outbox.drain()
    expect(await outbox.pendingCount()).toBe(1) // retained after the ambiguous failure

    currentTimeMs += 5_000
    await outbox.drain()

    expect(await outbox.pendingCount()).toBe(0)
    expect(await countRevisions(entryId)).toBe(1)
  })

  it('delivers 100 offline entries with no duplicates and no losses', async () => {
    const store = createMemoryStore()
    const outbox = createOutbox({
      store,
      submitters: { service_revision: deliverRevision, energy_revision: deliverRevision },
      now,
    })

    for (let index = 0; index < 100; index += 1) {
      // The final UUID group is exactly 12 hex characters.
      const suffix = String(index).padStart(11, '0')
      const revisionId = `018f0000-0000-7000-8000-1${suffix}`
      const entryId = `018f0000-0000-7000-8000-2${suffix}`
      currentTimeMs += 1_000
      await outbox.enqueue({
        id: revisionId,
        kind: 'service_revision',
        payload: {
          revisionId,
          entryId,
          notes: `Entry ${index}`,
          odometer: 100000 + index,
          clientCreatedAt: new Date().toISOString(),
        },
      })
    }

    const summary = await outbox.drain()

    expect(summary.delivered).toBe(100)
    expect(await outbox.pendingCount()).toBe(0)

    const { rows } = await admin().query<{ count: string }>(
      'select count(*)::text as count from public.service_entry_revisions',
    )
    expect(rows[0]!.count).toBe('100')
  })
})

describe('never discard (FR-042)', () => {
  it('retains and eventually delivers a record across five transient failures', async () => {
    const store = createMemoryStore()
    let attempts = 0

    const submit = async (record: OutboxRecord) => {
      attempts += 1
      if (attempts <= 5) throw new Error('Service unavailable')
      return deliverRevision(record)
    }

    const outbox = createOutbox({
      store,
      submitters: { service_revision: submit, energy_revision: submit },
      now,
    })

    const entryId = '018f0000-0000-7000-8000-000000000201'
    await outbox.enqueue({
      id: '018f0000-0000-7000-8000-000000000202',
      kind: 'service_revision',
      payload: {
        revisionId: '018f0000-0000-7000-8000-000000000202',
        entryId,
        notes: 'Survived the outage',
        odometer: 110000,
        clientCreatedAt: new Date().toISOString(),
      },
    })

    for (let round = 0; round < 6; round += 1) {
      currentTimeMs += 10 * 60 * 1_000 // clear any backoff window
      await outbox.drain()
    }

    expect(await outbox.pendingCount()).toBe(0)
    expect(await countRevisions(entryId)).toBe(1)
  })

  it('keeps a rejected record on the device, marked stuck', async () => {
    const store = createMemoryStore()
    const reject = async () => ({ ok: false, error: 'Odometer is required' })

    const outbox = createOutbox({
      store,
      submitters: { service_revision: reject, energy_revision: reject },
      now,
    })

    await outbox.enqueue({
      id: '018f0000-0000-7000-8000-000000000301',
      kind: 'service_revision',
      payload: { notes: 'Rejected work' },
    })

    await outbox.drain()

    // The entry may be the only record that this work was ever done.
    const [record] = await outbox.list()
    expect(record!.state).toBe('stuck')
    expect(record!.lastError).toBe('Odometer is required')
  })
})

describe('convergence across devices (FR-043, FR-043a, SC-013)', () => {
  it('retains both revisions when two devices supersede the same entry offline', async () => {
    const entryId = '018f0000-0000-7000-8000-000000000401'
    const originalId = '018f0000-0000-7000-8000-000000000402'

    await admin().query(
      'insert into public.service_entries (id, component_id, created_by) values ($1, $2, $3)',
      [entryId, componentId, ownerId],
    )
    await admin().query(
      `insert into public.service_entry_revisions
         (id, entry_id, author_id, client_created_at, category, performed_on, odometer, notes)
       values ($1, $2, $3, now(), 'maintenance', '2026-06-12', 110000, 'Original')`,
      [originalId, entryId, ownerId],
    )

    const makeDevice = (label: string) => {
      const store = createMemoryStore()
      return {
        store,
        outbox: createOutbox({
          store,
          submitters: { service_revision: deliverRevision, energy_revision: deliverRevision },
          now,
        }),
        label,
      }
    }

    const deviceA = makeDevice('A')
    const deviceB = makeDevice('B')

    await deviceA.outbox.enqueue({
      id: '018f0000-0000-7000-8000-000000000403',
      kind: 'service_revision',
      payload: {
        revisionId: '018f0000-0000-7000-8000-000000000403',
        entryId,
        supersedesRevisionId: originalId,
        notes: 'Edited on device A',
        odometer: 110000,
        clientCreatedAt: new Date().toISOString(),
      },
    })

    await deviceB.outbox.enqueue({
      id: '018f0000-0000-7000-8000-000000000404',
      kind: 'service_revision',
      payload: {
        revisionId: '018f0000-0000-7000-8000-000000000404',
        entryId,
        supersedesRevisionId: originalId,
        notes: 'Edited on device B',
        odometer: 110000,
        clientCreatedAt: new Date().toISOString(),
      },
    })

    await deviceA.outbox.drain()
    await deviceB.outbox.drain()

    // Nothing is adjudicated and nothing is lost — both edits survive.
    expect(await countRevisions(entryId)).toBe(3)

    // And both devices converge on the same displayed state: the one the
    // server received last.
    expect(await readCurrentNotes(entryId)).toBe('Edited on device B')
  })

  it('follows server receipt, not a device clock running three days fast', async () => {
    const entryId = '018f0000-0000-7000-8000-000000000501'
    const originalId = '018f0000-0000-7000-8000-000000000502'

    await admin().query(
      'insert into public.service_entries (id, component_id, created_by) values ($1, $2, $3)',
      [entryId, componentId, ownerId],
    )
    await admin().query(
      `insert into public.service_entry_revisions
         (id, entry_id, author_id, client_created_at, category, performed_on, odometer, notes)
       values ($1, $2, $3, now(), 'maintenance', '2026-06-12', 110000, 'Original')`,
      [originalId, entryId, ownerId],
    )

    const store = createMemoryStore()
    const outbox = createOutbox({
      store,
      submitters: { service_revision: deliverRevision, energy_revision: deliverRevision },
      now,
    })

    const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1_000
    const skewedClock = new Date(Date.now() + THREE_DAYS_MS).toISOString()

    // The device with the wrong clock syncs FIRST.
    await outbox.enqueue({
      id: '018f0000-0000-7000-8000-000000000503',
      kind: 'service_revision',
      payload: {
        revisionId: '018f0000-0000-7000-8000-000000000503',
        entryId,
        supersedesRevisionId: originalId,
        notes: 'From the phone with the wrong clock',
        odometer: 110000,
        clientCreatedAt: skewedClock,
      },
    })
    await outbox.drain()

    // A correctly-clocked device syncs afterwards.
    await outbox.enqueue({
      id: '018f0000-0000-7000-8000-000000000504',
      kind: 'service_revision',
      payload: {
        revisionId: '018f0000-0000-7000-8000-000000000504',
        entryId,
        supersedesRevisionId: originalId,
        notes: 'From the phone with the right clock',
        odometer: 110000,
        clientCreatedAt: new Date().toISOString(),
      },
    })
    await outbox.drain()

    // Had precedence read client_created_at, the skewed device would win for
    // three days. It reads server_received_at, so the later arrival wins.
    expect(await readCurrentNotes(entryId)).toBe('From the phone with the right clock')
  })

  it('hides an entry once a tombstone arrives, without deleting anything', async () => {
    const entryId = '018f0000-0000-7000-8000-000000000601'
    const originalId = '018f0000-0000-7000-8000-000000000602'

    await admin().query(
      'insert into public.service_entries (id, component_id, created_by) values ($1, $2, $3)',
      [entryId, componentId, ownerId],
    )
    await admin().query(
      `insert into public.service_entry_revisions
         (id, entry_id, author_id, client_created_at, category, performed_on, odometer, notes)
       values ($1, $2, $3, now(), 'maintenance', '2026-06-12', 110000, 'Original')`,
      [originalId, entryId, ownerId],
    )

    await admin().query(
      `insert into public.service_entry_revisions
         (id, entry_id, supersedes_revision_id, is_tombstone, author_id, client_created_at)
       values ($1, $2, $3, true, $4, now())`,
      ['018f0000-0000-7000-8000-000000000603', entryId, originalId, ownerId],
    )

    expect(await readCurrentNotes(entryId)).toBeNull()
    // The original is still on record; only its visibility changed.
    expect(await countRevisions(entryId)).toBe(2)
  })
})

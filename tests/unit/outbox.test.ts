// Unit tests for the offline outbox. 100% mocked — an in-memory store and fake timers, no IndexedDB and no network (Article V).

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOutbox, type OutboxRecord, type OutboxStore } from '@/lib/offline/outbox'
import { SYNC_STUCK_AFTER_ATTEMPTS } from '@/lib/constants'

/** In-memory stand-in for the IndexedDB store. */
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

let currentTimeMs = 1_000_000
const now = () => currentTimeMs

beforeEach(() => {
  currentTimeMs = 1_000_000
})

describe('enqueue', () => {
  it('stores the record without touching the network', async () => {
    const store = createMemoryStore()
    const submit = vi.fn()
    const outbox = createOutbox({
      store,
      submitters: { service_revision: submit, energy_revision: submit },
      now,
    })

    await outbox.enqueue({ id: 'rev-1', kind: 'service_revision', payload: { odometer: 112_450 } })

    expect(store.records.size).toBe(1)
    // The owner has already walked away by now; durability comes first.
    expect(submit).not.toHaveBeenCalled()
  })

  it('starts a record with no attempts and no error', async () => {
    const store = createMemoryStore()
    const outbox = createOutbox({
      store,
      submitters: { service_revision: vi.fn(), energy_revision: vi.fn() },
      now,
    })

    await outbox.enqueue({ id: 'rev-1', kind: 'service_revision', payload: {} })

    const record = store.records.get('rev-1')!
    expect(record.attempts).toBe(0)
    expect(record.state).toBe('pending')
    expect(record.lastError).toBeNull()
  })
})

describe('drain', () => {
  it('removes a record only after a confirmed acknowledgement', async () => {
    const store = createMemoryStore()
    const outbox = createOutbox({
      store,
      submitters: {
        service_revision: async () => ({ ok: true }),
        energy_revision: async () => ({ ok: true }),
      },
      now,
    })

    await outbox.enqueue({ id: 'rev-1', kind: 'service_revision', payload: {} })
    const summary = await outbox.drain()

    expect(summary.delivered).toBe(1)
    expect(store.records.size).toBe(0)
  })

  it('keeps the record when the network fails, and retries later', async () => {
    const store = createMemoryStore()
    const submit = vi
      .fn()
      .mockRejectedValueOnce(new Error('Network unavailable'))
      .mockResolvedValueOnce({ ok: true })

    const outbox = createOutbox({
      store,
      submitters: { service_revision: submit, energy_revision: submit },
      now,
    })

    await outbox.enqueue({ id: 'rev-1', kind: 'service_revision', payload: {} })

    await outbox.drain()
    expect(store.records.get('rev-1')?.attempts).toBe(1)
    expect(store.records.get('rev-1')?.state).toBe('pending')

    // Past the 1s backoff window.
    currentTimeMs += 2_000
    await outbox.drain()
    expect(store.records.size).toBe(0)
  })

  it('respects the backoff window instead of hammering', async () => {
    const store = createMemoryStore()
    const submit = vi.fn().mockRejectedValue(new Error('offline'))
    const outbox = createOutbox({
      store,
      submitters: { service_revision: submit, energy_revision: submit },
      now,
    })

    await outbox.enqueue({ id: 'rev-1', kind: 'service_revision', payload: {} })

    await outbox.drain()
    const summary = await outbox.drain() // immediately again — should be skipped

    expect(summary.skipped).toBe(1)
    expect(submit).toHaveBeenCalledTimes(1)
  })

  it('marks a server rejection stuck at once, since retrying cannot fix it', async () => {
    const store = createMemoryStore()
    const outbox = createOutbox({
      store,
      submitters: {
        service_revision: async () => ({ ok: false, error: 'Odometer is required' }),
        energy_revision: async () => ({ ok: true }),
      },
      now,
    })

    await outbox.enqueue({ id: 'rev-1', kind: 'service_revision', payload: {} })
    const summary = await outbox.drain()

    expect(summary.stuck).toBe(1)
    expect(store.records.get('rev-1')?.state).toBe('stuck')
    expect(store.records.get('rev-1')?.lastError).toBe('Odometer is required')
  })

  it('never discards a stuck record', async () => {
    const store = createMemoryStore()
    const outbox = createOutbox({
      store,
      submitters: {
        service_revision: async () => ({ ok: false, error: 'rejected' }),
        energy_revision: async () => ({ ok: true }),
      },
      now,
    })

    await outbox.enqueue({ id: 'rev-1', kind: 'service_revision', payload: {} })
    await outbox.drain()

    // The entry may be the only record of work someone actually performed.
    expect(store.records.size).toBe(1)
  })

  it('becomes stuck after the configured run of transient failures', async () => {
    const store = createMemoryStore()
    const submit = vi.fn().mockRejectedValue(new Error('offline'))
    const outbox = createOutbox({
      store,
      submitters: { service_revision: submit, energy_revision: submit },
      now,
    })

    await outbox.enqueue({ id: 'rev-1', kind: 'service_revision', payload: {} })

    for (let i = 0; i < SYNC_STUCK_AFTER_ATTEMPTS; i += 1) {
      currentTimeMs += 10 * 60 * 1_000 // past any backoff window
      await outbox.drain()
    }

    expect(store.records.get('rev-1')?.state).toBe('stuck')
    expect(store.records.size).toBe(1)
  })

  it('drains oldest first', async () => {
    const store = createMemoryStore()
    const delivered: string[] = []
    const submit = async (record: OutboxRecord) => {
      delivered.push(record.id)
      return { ok: true }
    }
    const outbox = createOutbox({
      store,
      submitters: { service_revision: submit, energy_revision: submit },
      now,
    })

    await outbox.enqueue({ id: 'older', kind: 'service_revision', payload: {} })
    currentTimeMs += 5_000
    await outbox.enqueue({ id: 'newer', kind: 'service_revision', payload: {} })

    await outbox.drain()

    expect(delivered).toEqual(['older', 'newer'])
  })

  it('routes each record to the submitter for its kind', async () => {
    const store = createMemoryStore()
    const serviceSubmit = vi.fn().mockResolvedValue({ ok: true })
    const energySubmit = vi.fn().mockResolvedValue({ ok: true })
    const outbox = createOutbox({
      store,
      submitters: { service_revision: serviceSubmit, energy_revision: energySubmit },
      now,
    })

    await outbox.enqueue({ id: 'rev-1', kind: 'service_revision', payload: {} })
    await outbox.enqueue({ id: 'rev-2', kind: 'energy_revision', payload: {} })
    await outbox.drain()

    expect(serviceSubmit).toHaveBeenCalledTimes(1)
    expect(energySubmit).toHaveBeenCalledTimes(1)
  })

  it('reports nothing to do on an empty queue', async () => {
    const store = createMemoryStore()
    const outbox = createOutbox({
      store,
      submitters: { service_revision: vi.fn(), energy_revision: vi.fn() },
      now,
    })

    expect(await outbox.drain()).toEqual({ delivered: 0, retrying: 0, stuck: 0, skipped: 0 })
  })
})

describe('pendingCount', () => {
  it('counts everything outstanding, stuck records included', async () => {
    const store = createMemoryStore()
    const outbox = createOutbox({
      store,
      submitters: {
        service_revision: async () => ({ ok: false, error: 'rejected' }),
        energy_revision: async () => ({ ok: true }),
      },
      now,
    })

    await outbox.enqueue({ id: 'rev-1', kind: 'service_revision', payload: {} })
    await outbox.enqueue({ id: 'rev-2', kind: 'service_revision', payload: {} })
    await outbox.drain()

    expect(await outbox.pendingCount()).toBe(2)
  })
})

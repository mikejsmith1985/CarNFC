// Wires the outbox to the Server Actions that deliver its records, and to the events that trigger a drain.
'use client'

import { createOutbox, type Outbox, type OutboxRecord } from '@/lib/offline/outbox'
import { createIndexedDbOutboxStore } from '@/lib/offline/db'
import { requestPersistentStorage } from '@/lib/offline/quota'
import { submitServiceRevision } from '@/app/actions/service-log'
import { submitEnergyRevision } from '@/app/actions/energy-log'

let outboxInstance: Outbox | null = null

/**
 * The application's outbox.
 *
 * Submitters are wired here rather than inside `outbox.ts` so the queue logic
 * stays free of server imports and can be unit-tested against an in-memory
 * store with no network at all.
 */
export function getOutbox(): Outbox {
  outboxInstance ??= createOutbox({
    store: createIndexedDbOutboxStore(),
    submitters: {
      service_revision: (record: OutboxRecord) =>
        submitServiceRevision(record.payload as Parameters<typeof submitServiceRevision>[0]),
      energy_revision: (record: OutboxRecord) =>
        submitEnergyRevision(record.payload as Parameters<typeof submitEnergyRevision>[0]),
    },
  })
  return outboxInstance
}

export type SyncListener = (summary: { pending: number; stuck: number }) => void

const listeners = new Set<SyncListener>()

/** Subscribes to queue-state changes, for the sync indicator. */
export function subscribeToSync(listener: SyncListener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

async function notifyListeners(): Promise<void> {
  const records = await getOutbox().list()
  const summary = {
    pending: records.length,
    stuck: records.filter((record) => record.state === 'stuck').length,
  }
  for (const listener of listeners) listener(summary)
}

/**
 * Records an entry and tries to deliver it straight away.
 *
 * Always enqueues first, even with a perfectly good connection. Uniform
 * behaviour means the online and offline paths share one code path, so the
 * offline one cannot rot for want of exercise — and the entry is durable before
 * anything can go wrong with the network.
 */
export async function submitOrQueue(
  kind: 'service_revision' | 'energy_revision',
  id: string,
  payload: unknown,
): Promise<{ queued: boolean; error: string | null }> {
  const outbox = getOutbox()
  await outbox.enqueue({ id, kind, payload })

  const summary = await outbox.drain()
  await notifyListeners()

  if (summary.delivered > 0) return { queued: false, error: null }

  const stuckRecord = (await outbox.list()).find(
    (record) => record.id === id && record.state === 'stuck',
  )
  if (stuckRecord) return { queued: false, error: stuckRecord.lastError }

  // Held for later. The entry is on the device and will upload by itself.
  return { queued: true, error: null }
}

let isSyncWired = false

/**
 * Starts automatic synchronization.
 *
 * Draining is triggered by regaining connectivity and by the app coming back to
 * the foreground — no screen to open and no button to press, because someone
 * who logged an oil change in a garage should never have to remember to send it
 * (FR-040).
 */
export function startSyncEngine(): () => void {
  if (typeof window === 'undefined' || isSyncWired) return () => {}
  isSyncWired = true

  const drainNow = () => {
    void getOutbox()
      .drain()
      .then(notifyListeners)
      .catch(() => {
        // A failed drain leaves every record in place by design; the next
        // trigger will try again.
      })
  }

  const handleVisibility = () => {
    if (document.visibilityState === 'visible') drainNow()
  }

  window.addEventListener('online', drainNow)
  window.addEventListener('focus', drainNow)
  document.addEventListener('visibilitychange', handleVisibility)

  void requestPersistentStorage()
  drainNow()

  return () => {
    window.removeEventListener('online', drainNow)
    window.removeEventListener('focus', drainNow)
    document.removeEventListener('visibilitychange', handleVisibility)
    isSyncWired = false
  }
}

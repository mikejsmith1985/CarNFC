// The offline write queue: accepts entries with no connectivity and delivers them exactly once.
//
// Custom component (Article VII): no framework provides an offline write queue
// with exactly-once delivery — documented gap, see plan.md § Complexity Tracking.
// Supabase Realtime addresses live collaboration, not durable queueing, and
// Workbox Background Sync replays raw requests with no idempotency and no
// user-visible failure state, so neither satisfies FR-041 or FR-042.
//
// Two design choices keep this small. Revision ids are UUIDv7 generated on the
// device, so exactly-once is a database constraint (`ON CONFLICT DO NOTHING`)
// rather than queue bookkeeping. And the append-only revision model means there
// is no merge to perform. What is left is enqueue, drain, and backoff.

import { classifyFailure, isReadyToRetry, isStuck } from '@/lib/offline/backoff'

export type OutboxKind = 'service_revision' | 'energy_revision'

export interface OutboxRecord {
  /** The same UUIDv7 the server will use as its primary key. */
  id: string
  kind: OutboxKind
  payload: unknown
  attachmentIds: string[]
  clientCreatedAt: string
  attempts: number
  lastAttemptAtMs: number | null
  lastError: string | null
  state: 'pending' | 'in_flight' | 'stuck'
}

/** Storage the outbox reads and writes. Injected so the drain loop is testable without IndexedDB. */
export interface OutboxStore {
  put(record: OutboxRecord): Promise<void>
  getAll(): Promise<OutboxRecord[]>
  remove(id: string): Promise<void>
}

/** Submits one record. Resolves `{ ok: false }` on rejection; throws when the network failed. */
export type Submitter = (record: OutboxRecord) => Promise<{ ok: boolean; error?: string }>

export interface DrainSummary {
  delivered: number
  retrying: number
  stuck: number
  skipped: number
}

interface OutboxOptions {
  store: OutboxStore
  submitters: Record<OutboxKind, Submitter>
  /** Injected so tests can drive backoff with fake timers. */
  now?: () => number
}

/** Everything the drain loop needs, passed explicitly so each step stays a short top-level function. */
interface OutboxContext {
  store: OutboxStore
  submitters: Record<OutboxKind, Submitter>
  now: () => number
}

/**
 * Accepts a record for eventual delivery.
 *
 * Never touches the network. The owner has already walked away from the phone
 * by the time this returns, so the entry has to be durable first and
 * transmitted second (FR-039).
 */
async function enqueueRecord(
  context: OutboxContext,
  input: Pick<OutboxRecord, 'id' | 'kind' | 'payload'> & { attachmentIds?: string[] },
): Promise<void> {
  await context.store.put({
    id: input.id,
    kind: input.kind,
    payload: input.payload,
    attachmentIds: input.attachmentIds ?? [],
    clientCreatedAt: new Date(context.now()).toISOString(),
    attempts: 0,
    lastAttemptAtMs: null,
    lastError: null,
    state: 'pending',
  })
}

/**
 * Attempts delivery of everything due, oldest first.
 *
 * A record leaves the outbox only on a confirmed acknowledgement. Removing it
 * on send would trade away the one guarantee that matters here (FR-042).
 */
async function drainRecords(context: OutboxContext): Promise<DrainSummary> {
  const summary: DrainSummary = { delivered: 0, retrying: 0, stuck: 0, skipped: 0 }
  const records = (await context.store.getAll()).sort((left, right) =>
    left.clientCreatedAt.localeCompare(right.clientCreatedAt),
  )

  for (const record of records) {
    if (!isReadyToRetry(record.attempts, record.lastAttemptAtMs, context.now())) {
      summary.skipped += 1
      continue
    }
    await attemptOne(context, record, summary)
  }

  return summary
}

/** Submits one record and records the outcome. */
async function attemptOne(
  context: OutboxContext,
  record: OutboxRecord,
  summary: DrainSummary,
): Promise<void> {
  const submit = context.submitters[record.kind]
  const attempts = record.attempts + 1

  try {
    const result = await submit(record)

    if (result.ok) {
      await context.store.remove(record.id)
      summary.delivered += 1
      return
    }

    // The server answered and refused. Retrying unchanged will never help.
    await markFailed(context, record, attempts, result.error ?? 'Rejected', 'permanent', summary)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Network unavailable'
    await markFailed(context, record, attempts, message, classifyFailure({ threw: true }), summary)
  }
}

/** Writes a failure back to the store, keeping the record either way. */
async function markFailed(
  context: OutboxContext,
  record: OutboxRecord,
  attempts: number,
  message: string,
  kind: 'transient' | 'permanent',
  summary: DrainSummary,
): Promise<void> {
  const becameStuck = kind === 'permanent' || isStuck(attempts)

  await context.store.put({
    ...record,
    attempts,
    lastAttemptAtMs: context.now(),
    lastError: message,
    state: becameStuck ? 'stuck' : 'pending',
  })

  if (becameStuck) summary.stuck += 1
  else summary.retrying += 1
}

/** Creates an outbox bound to a store and a set of submitters. */
export function createOutbox({ store, submitters, now = () => Date.now() }: OutboxOptions) {
  const context: OutboxContext = { store, submitters, now }

  return {
    enqueue: (input: Parameters<typeof enqueueRecord>[1]) => enqueueRecord(context, input),
    drain: () => drainRecords(context),
    /** Everything still waiting, for the sync indicator. */
    list: () => store.getAll(),
    /** How many records are outstanding, stuck ones included. */
    pendingCount: async () => (await store.getAll()).length,
  }
}

export type Outbox = ReturnType<typeof createOutbox>

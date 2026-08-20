// IndexedDB schema and store adapters. `idb` is a thin promise wrapper over a browser primitive, not an abstraction over it.
'use client'

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { OutboxRecord, OutboxStore } from '@/lib/offline/outbox'
import type { CachedCard } from '@/types/servicecard'

const DATABASE_NAME = 'servicecard'
const DATABASE_VERSION = 1

interface ServiceCardDB extends DBSchema {
  /** Last payload for each visited card, so a repeat tap paints with no signal. */
  cards: { key: string; value: CachedCard }
  /** Entries awaiting delivery. */
  outbox: { key: string; value: OutboxRecord }
  /** Compressed attachment bytes queued alongside their entry. */
  blobs: { key: string; value: { id: string; revisionId: string; blob: Blob; mimeType: string } }
  /** Current account, last sync attempt, and other single values. */
  meta: { key: string; value: unknown }
}

let databasePromise: Promise<IDBPDatabase<ServiceCardDB>> | null = null

/** Opens the database, creating stores on first use. */
export function getDatabase(): Promise<IDBPDatabase<ServiceCardDB>> {
  databasePromise ??= openDB<ServiceCardDB>(DATABASE_NAME, DATABASE_VERSION, {
    upgrade(database) {
      if (!database.objectStoreNames.contains('cards')) database.createObjectStore('cards')
      if (!database.objectStoreNames.contains('outbox')) database.createObjectStore('outbox')
      if (!database.objectStoreNames.contains('blobs')) database.createObjectStore('blobs')
      if (!database.objectStoreNames.contains('meta')) database.createObjectStore('meta')
    },
  })
  return databasePromise
}

/** The IndexedDB-backed outbox store. */
export function createIndexedDbOutboxStore(): OutboxStore {
  return {
    async put(record) {
      const database = await getDatabase()
      await database.put('outbox', record, record.id)
    },
    async getAll() {
      const database = await getDatabase()
      return database.getAll('outbox')
    },
    async remove(id) {
      const database = await getDatabase()
      await database.delete('outbox', id)
    },
  }
}

/** Stores compressed attachment bytes until their entry is acknowledged. */
export async function putBlob(
  id: string,
  revisionId: string,
  blob: Blob,
  mimeType: string,
): Promise<void> {
  const database = await getDatabase()
  await database.put('blobs', { id, revisionId, blob, mimeType }, id)
}

export async function takeBlob(id: string): Promise<Blob | null> {
  const database = await getDatabase()
  const stored = await database.get('blobs', id)
  return stored?.blob ?? null
}

export async function removeBlob(id: string): Promise<void> {
  const database = await getDatabase()
  await database.delete('blobs', id)
}

/**
 * Clears every device-local trace of the signed-out owner.
 *
 * The outbox is deliberately included: sign-out is guarded elsewhere so this is
 * only reached once the owner has confirmed that pending entries are being
 * discarded (FR-047c, FR-047d).
 */
export async function clearLocalData(): Promise<void> {
  const database = await getDatabase()
  await Promise.all([
    database.clear('cards'),
    database.clear('outbox'),
    database.clear('blobs'),
    database.clear('meta'),
  ])
}

/** Reads a single stored value. */
export async function readMeta<ValueType>(key: string): Promise<ValueType | null> {
  const database = await getDatabase()
  return ((await database.get('meta', key)) as ValueType | undefined) ?? null
}

/** Writes a single stored value. */
export async function writeMeta(key: string, value: unknown): Promise<void> {
  const database = await getDatabase()
  await database.put('meta', value, key)
}

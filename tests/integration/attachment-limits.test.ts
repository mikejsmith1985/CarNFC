// Attachment behaviour against the real database: the five-file trigger, the size cap, and the timing budget for an offline batch.

import { beforeEach, describe, expect, it } from 'vitest'
import { admin, createOwner, truncateAll } from './setup'
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_PER_ENTRY } from '@/lib/constants'

let ownerId = ''
let vehicleId = ''
let componentId = ''
let revisionId = ''
let nextId = 900

function newId(): string {
  nextId += 1
  return `018f0000-0000-7000-8000-${String(nextId).padStart(12, '0')}`
}

beforeEach(async () => {
  await truncateAll()
  ownerId = await createOwner('owner@example.com')

  const vehicle = await admin().query<{ id: string }>(
    `insert into public.vehicles (owner_id, slug, power_source) values ($1, 'raptor', 'gasoline')
     returning id`,
    [ownerId],
  )
  vehicleId = vehicle.rows[0]!.id

  const component = await admin().query<{ id: string }>(
    `insert into public.components (vehicle_id, slug, display_name)
     values ($1, 'front-diff', 'Front Differential') returning id`,
    [vehicleId],
  )
  componentId = component.rows[0]!.id

  const entryId = newId()
  revisionId = newId()
  await admin().query(
    'insert into public.service_entries (id, component_id, created_by) values ($1, $2, $3)',
    [entryId, componentId, ownerId],
  )
  await admin().query(
    `insert into public.service_entry_revisions
       (id, entry_id, author_id, client_created_at, category, performed_on, odometer, new_part_number)
     values ($1, $2, $3, now(), 'replace', '2026-06-12', 110000, 'BP-1')`,
    [revisionId, entryId, ownerId],
  )
})

function addAttachment(index: number, byteSize = 400_000) {
  return admin().query(
    `insert into public.attachments
       (id, revision_id, storage_path, original_filename, mime_type, byte_size, state)
     values ($1, $2, $3, $4, 'image/webp', $5, 'uploaded')`,
    [newId(), revisionId, `${ownerId}/${vehicleId}/file-${index}`, `receipt-${index}.webp`, byteSize],
  )
}

describe('attachment limits (FR-026)', () => {
  it('accepts the documented number of files', async () => {
    for (let index = 0; index < ATTACHMENT_MAX_PER_ENTRY; index += 1) {
      await addAttachment(index)
    }

    const { rows } = await admin().query<{ count: string }>(
      'select count(*)::text as count from public.attachments where revision_id = $1',
      [revisionId],
    )
    expect(rows[0]!.count).toBe(String(ATTACHMENT_MAX_PER_ENTRY))
  })

  it('refuses one more than the limit', async () => {
    for (let index = 0; index < ATTACHMENT_MAX_PER_ENTRY; index += 1) {
      await addAttachment(index)
    }
    await expect(addAttachment(ATTACHMENT_MAX_PER_ENTRY)).rejects.toThrow(
      /attachment_limit_exceeded/,
    )
  })

  it('accepts a file exactly at the size cap', async () => {
    await expect(addAttachment(0, ATTACHMENT_MAX_BYTES)).resolves.toBeDefined()
  })

  it('refuses a file one byte over the cap', async () => {
    await expect(addAttachment(0, ATTACHMENT_MAX_BYTES + 1)).rejects.toThrow(/size_within_cap/)
  })

  it('refuses a zero-byte file, which is a failed capture rather than a document', async () => {
    await expect(addAttachment(0, 0)).rejects.toThrow(/size_within_cap/)
  })

  it('removes attachments with their revision, never orphaning storage rows', async () => {
    await addAttachment(0)
    await admin().query('delete from public.service_entries where component_id = $1', [componentId])

    const { rows } = await admin().query<{ count: string }>(
      'select count(*)::text as count from public.attachments',
    )
    expect(rows[0]!.count).toBe('0')
  })
})

describe('offline batch timing (SC-015)', () => {
  it('records an entry with five attachments well inside the 60-second budget', async () => {
    // SC-015 budgets 60 seconds end to end for the reconnect. This measures the
    // database half; the network half is exercised by the UX suite.
    const startedAt = Date.now()

    for (let index = 0; index < ATTACHMENT_MAX_PER_ENTRY; index += 1) {
      await addAttachment(index)
    }

    const elapsedMs = Date.now() - startedAt
    expect(elapsedMs).toBeLessThan(60_000)

    const { rows } = await admin().query<{ count: string }>(
      'select count(*)::text as count from public.attachments where revision_id = $1',
      [revisionId],
    )
    expect(rows[0]!.count).toBe(String(ATTACHMENT_MAX_PER_ENTRY))
  })

  it('is idempotent on retry, so a replayed upload does not duplicate the row', async () => {
    const attachmentId = newId()
    const insert = () =>
      admin().query(
        `insert into public.attachments
           (id, revision_id, storage_path, original_filename, mime_type, byte_size, state)
         values ($1, $2, 'p/v/a', 'receipt.webp', 'image/webp', 400000, 'uploaded')
         on conflict (id) do update set state = excluded.state`,
        [attachmentId, revisionId],
      )

    await insert()
    await insert()

    const { rows } = await admin().query<{ count: string }>(
      'select count(*)::text as count from public.attachments where id = $1',
      [attachmentId],
    )
    expect(rows[0]!.count).toBe('1')
  })
})

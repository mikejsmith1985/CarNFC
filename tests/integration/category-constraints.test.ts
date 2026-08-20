// Proves the database refuses a log entry carrying fields from a category it does not belong to (FR-017, FR-036).

import { beforeEach, describe, expect, it } from 'vitest'
import { admin, createOwner, truncateAll } from './setup'

let ownerId = ''
let vehicleId = ''
let componentId = ''
let entryId = ''
let energyEntryId = ''
let nextId = 100

function newId(): string {
  nextId += 1
  return `018f0000-0000-7000-8000-${String(nextId).padStart(12, '0')}`
}

beforeEach(async () => {
  await truncateAll()
  ownerId = await createOwner('owner@example.com')

  const vehicle = await admin().query<{ id: string }>(
    `insert into public.vehicles (owner_id, slug, power_source, current_odometer)
     values ($1, 'raptor', 'both', 112450) returning id`,
    [ownerId],
  )
  vehicleId = vehicle.rows[0]!.id

  const component = await admin().query<{ id: string }>(
    `insert into public.components (vehicle_id, slug, display_name)
     values ($1, 'front-diff', 'Front Differential') returning id`,
    [vehicleId],
  )
  componentId = component.rows[0]!.id

  entryId = newId()
  await admin().query(
    'insert into public.service_entries (id, component_id, created_by) values ($1, $2, $3)',
    [entryId, componentId, ownerId],
  )

  energyEntryId = newId()
  await admin().query(
    'insert into public.energy_entries (id, vehicle_id, created_by) values ($1, $2, $3)',
    [energyEntryId, vehicleId, ownerId],
  )
})

/** Inserts a service revision with arbitrary extra columns. */
function insertServiceRevision(columns: Record<string, unknown>) {
  const base: Record<string, unknown> = {
    id: newId(),
    entry_id: entryId,
    author_id: ownerId,
    client_created_at: new Date().toISOString(),
    performed_on: '2026-06-12',
    odometer: 110000,
    ...columns,
  }
  const names = Object.keys(base)
  const placeholders = names.map((_, index) => `$${index + 1}`)
  return admin().query(
    `insert into public.service_entry_revisions (${names.join(', ')}) values (${placeholders.join(', ')})`,
    Object.values(base),
  )
}

function insertEnergyRevision(columns: Record<string, unknown>) {
  const base: Record<string, unknown> = {
    id: newId(),
    entry_id: energyEntryId,
    author_id: ownerId,
    client_created_at: new Date().toISOString(),
    occurred_at: new Date().toISOString(),
    odometer: 112500,
    ...columns,
  }
  const names = Object.keys(base)
  const placeholders = names.map((_, index) => `$${index + 1}`)
  return admin().query(
    `insert into public.energy_entry_revisions (${names.join(', ')}) values (${placeholders.join(', ')})`,
    Object.values(base),
  )
}

describe('service category exclusivity (FR-017)', () => {
  it('accepts a well-formed maintenance entry', async () => {
    await expect(
      insertServiceRevision({ category: 'maintenance', fluid_type: '75W-90', quantity: 2.1 }),
    ).resolves.toBeDefined()
  })

  it('rejects a repair carrying a warranty date', async () => {
    // The canonical example: warranty belongs to Replace, never to Repair.
    await expect(
      insertServiceRevision({
        category: 'repair',
        symptom: 'Leak',
        warranty_expires_on: '2027-01-01',
      }),
    ).rejects.toThrow(/category_fields_exclusive/)
  })

  it('rejects maintenance carrying repair fields', async () => {
    await expect(
      insertServiceRevision({ category: 'maintenance', symptom: 'Leaking' }),
    ).rejects.toThrow(/category_fields_exclusive/)
  })

  it('rejects replace carrying upgrade fields', async () => {
    await expect(
      insertServiceRevision({ category: 'replace', new_part_number: 'X1', upgrade_brand: 'ARB' }),
    ).rejects.toThrow(/category_fields_exclusive/)
  })

  it('rejects an upgrade carrying a filter part number', async () => {
    await expect(
      insertServiceRevision({
        category: 'upgrade',
        upgrade_brand: 'ARB',
        filter_part_number: 'FL-500S',
      }),
    ).rejects.toThrow(/category_fields_exclusive/)
  })

  it('rejects a non-tombstone revision with no category', async () => {
    await expect(insertServiceRevision({ category: null })).rejects.toThrow(/required_fields/)
  })

  it('accepts a tombstone carrying no content', async () => {
    await expect(
      insertServiceRevision({
        is_tombstone: true,
        category: null,
        performed_on: null,
        odometer: null,
      }),
    ).resolves.toBeDefined()
  })

  it('rejects a tombstone that still carries content', async () => {
    await expect(
      insertServiceRevision({ is_tombstone: true, category: 'maintenance' }),
    ).rejects.toThrow(/tombstone_is_empty/)
  })

  it('rejects a negative odometer', async () => {
    await expect(insertServiceRevision({ category: 'maintenance', odometer: -5 })).rejects.toThrow(
      /odometer/,
    )
  })
})

describe('energy mode exclusivity and bounds (FR-036)', () => {
  it('accepts a well-formed fuel entry', async () => {
    await expect(
      insertEnergyRevision({ mode: 'fuel', volume_gallons: 20, is_full_fill: true }),
    ).resolves.toBeDefined()
  })

  it('accepts a well-formed charge entry', async () => {
    await expect(
      insertEnergyRevision({ mode: 'charge', soc_start_pct: 20, soc_end_pct: 80, energy_kwh: 50 }),
    ).resolves.toBeDefined()
  })

  it('rejects a charge session that ends with less charge than it started', async () => {
    await expect(
      insertEnergyRevision({ mode: 'charge', soc_start_pct: 80, soc_end_pct: 20, energy_kwh: 50 }),
    ).rejects.toThrow(/soc_not_reversed/)
  })

  it('rejects a state of charge above 100 percent', async () => {
    await expect(
      insertEnergyRevision({ mode: 'charge', soc_start_pct: 20, soc_end_pct: 120, energy_kwh: 50 }),
    ).rejects.toThrow(/soc_end_pct/)
  })

  it('rejects a negative state of charge', async () => {
    await expect(
      insertEnergyRevision({ mode: 'charge', soc_start_pct: -5, soc_end_pct: 80, energy_kwh: 50 }),
    ).rejects.toThrow(/soc_start_pct/)
  })

  it('rejects zero energy delivered', async () => {
    await expect(
      insertEnergyRevision({ mode: 'charge', soc_start_pct: 20, soc_end_pct: 80, energy_kwh: 0 }),
    ).rejects.toThrow(/energy_kwh/)
  })

  it('rejects zero volume dispensed', async () => {
    await expect(
      insertEnergyRevision({ mode: 'fuel', volume_gallons: 0, is_full_fill: true }),
    ).rejects.toThrow(/volume_gallons/)
  })

  it('rejects a fuel entry carrying charge fields', async () => {
    await expect(
      insertEnergyRevision({ mode: 'fuel', volume_gallons: 20, energy_kwh: 50 }),
    ).rejects.toThrow(/mode_fields_exclusive/)
  })

  it('rejects a charge entry carrying fuel fields', async () => {
    await expect(
      insertEnergyRevision({
        mode: 'charge',
        soc_start_pct: 20,
        soc_end_pct: 80,
        energy_kwh: 50,
        volume_gallons: 20,
      }),
    ).rejects.toThrow(/mode_fields_exclusive/)
  })
})

describe('attachment limits (FR-026)', () => {
  it('rejects a sixth attachment on one revision', async () => {
    const revisionId = newId()
    await insertServiceRevision({ id: revisionId, category: 'replace', new_part_number: 'X1' })

    const addAttachment = (index: number) =>
      admin().query(
        `insert into public.attachments
           (id, revision_id, storage_path, original_filename, mime_type, byte_size)
         values ($1, $2, $3, $4, 'image/webp', 1024)`,
        [newId(), revisionId, `${ownerId}/${vehicleId}/file-${index}`, `receipt-${index}.webp`],
      )

    for (let i = 0; i < 5; i += 1) await addAttachment(i)
    await expect(addAttachment(5)).rejects.toThrow(/attachment_limit_exceeded/)
  })

  it('rejects a file above the size cap', async () => {
    const revisionId = newId()
    await insertServiceRevision({ id: revisionId, category: 'replace', new_part_number: 'X1' })

    await expect(
      admin().query(
        `insert into public.attachments
           (id, revision_id, storage_path, original_filename, mime_type, byte_size)
         values ($1, $2, 'p/v/a', 'huge.webp', 'image/webp', 10485761)`,
        [newId(), revisionId],
      ),
    ).rejects.toThrow(/size_within_cap/)
  })

  it('rejects an unsupported file type', async () => {
    const revisionId = newId()
    await insertServiceRevision({ id: revisionId, category: 'replace', new_part_number: 'X1' })

    await expect(
      admin().query(
        `insert into public.attachments
           (id, revision_id, storage_path, original_filename, mime_type, byte_size)
         values ($1, $2, 'p/v/a', 'invoice.exe', 'application/x-msdownload', 1024)`,
        [newId(), revisionId],
      ),
    ).rejects.toThrow(/mime_type_allowed/)
  })
})

describe('odometer trigger (FR-025)', () => {
  it('raises the vehicle odometer to a higher reading', async () => {
    await insertServiceRevision({ category: 'maintenance', odometer: 120000 })

    const { rows } = await admin().query<{ current_odometer: number }>(
      'select current_odometer from public.vehicles where id = $1',
      [vehicleId],
    )
    expect(rows[0]!.current_odometer).toBe(120000)
  })

  it('never lowers the vehicle odometer', async () => {
    await insertServiceRevision({ category: 'maintenance', odometer: 100 })

    const { rows } = await admin().query<{ current_odometer: number }>(
      'select current_odometer from public.vehicles where id = $1',
      [vehicleId],
    )
    // An owner correcting a typo downward must not drag the vehicle's mileage back.
    expect(rows[0]!.current_odometer).toBe(112450)
  })

  it('raises the odometer from an energy entry too', async () => {
    await insertEnergyRevision({ mode: 'fuel', volume_gallons: 20, odometer: 130000 })

    const { rows } = await admin().query<{ current_odometer: number }>(
      'select current_odometer from public.vehicles where id = $1',
      [vehicleId],
    )
    expect(rows[0]!.current_odometer).toBe(130000)
  })
})

// Unit tests for the four-category service log schemas (FR-016, FR-017).

import { describe, expect, it } from 'vitest'
import { serviceLogSchema, serviceTombstoneSchema } from '@/lib/validation/service-log'

const BASE = {
  id: '018f0000-0000-7000-8000-000000000001',
  entryId: '018f0000-0000-7000-8000-000000000002',
  componentId: '018f0000-0000-7000-8000-000000000003',
  clientCreatedAt: '2026-06-12T10:00:00Z',
  performedOn: '2026-06-12',
  odometer: 110_000,
}

describe('serviceLogSchema', () => {
  it('accepts a maintenance entry', () => {
    expect(
      serviceLogSchema.safeParse({ ...BASE, category: 'maintenance', quantity: 2.1 }).success,
    ).toBe(true)
  })

  it('accepts a repair entry with a re-check offset', () => {
    const result = serviceLogSchema.safeParse({
      ...BASE,
      category: 'repair',
      symptom: 'Weeping seal',
      recheckMiles: 50,
    })
    expect(result.success).toBe(true)
  })

  it('accepts an upgrade carrying spec overrides', () => {
    const result = serviceLogSchema.safeParse({
      ...BASE,
      category: 'upgrade',
      upgradeBrand: 'ARB',
      specOverrides: [
        { specKey: 'drain_torque', kind: 'torque', label: 'Drain torque', newValue: '45' },
      ],
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unknown category', () => {
    expect(serviceLogSchema.safeParse({ ...BASE, category: 'invented' }).success).toBe(false)
  })

  it('rejects a missing odometer, which anchors every derived figure', () => {
    const { odometer: _omitted, ...withoutOdometer } = BASE
    expect(
      serviceLogSchema.safeParse({ ...withoutOdometer, category: 'maintenance' }).success,
    ).toBe(false)
  })

  it('rejects a negative odometer', () => {
    expect(
      serviceLogSchema.safeParse({ ...BASE, category: 'maintenance', odometer: -1 }).success,
    ).toBe(false)
  })

  it('rejects a malformed date', () => {
    const result = serviceLogSchema.safeParse({
      ...BASE,
      category: 'maintenance',
      performedOn: '12/06/2026',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a reference link that is not a URL', () => {
    const result = serviceLogSchema.safeParse({
      ...BASE,
      category: 'upgrade',
      referenceUrl: 'not a url',
    })
    expect(result.success).toBe(false)
  })

  it('rejects a spec-override key that is not a stable identifier', () => {
    // The key is what an override joins against, so it cannot carry spaces.
    const result = serviceLogSchema.safeParse({
      ...BASE,
      category: 'upgrade',
      specOverrides: [
        { specKey: 'Drain Torque', kind: 'torque', label: 'Drain torque', newValue: '45' },
      ],
    })
    expect(result.success).toBe(false)
  })

  it('rejects a negative maintenance quantity', () => {
    expect(
      serviceLogSchema.safeParse({ ...BASE, category: 'maintenance', quantity: -2 }).success,
    ).toBe(false)
  })
})

describe('serviceTombstoneSchema', () => {
  it('accepts a tombstone that supersedes a revision', () => {
    const result = serviceTombstoneSchema.safeParse({
      id: BASE.id,
      entryId: BASE.entryId,
      componentId: BASE.componentId,
      supersedesRevisionId: '018f0000-0000-7000-8000-000000000009',
      clientCreatedAt: BASE.clientCreatedAt,
      isTombstone: true,
    })
    expect(result.success).toBe(true)
  })

  it('rejects a tombstone that supersedes nothing', () => {
    // Deleting means superseding something specific; there is nothing else it
    // could mean.
    const result = serviceTombstoneSchema.safeParse({
      id: BASE.id,
      entryId: BASE.entryId,
      componentId: BASE.componentId,
      clientCreatedAt: BASE.clientCreatedAt,
      isTombstone: true,
    })
    expect(result.success).toBe(false)
  })
})

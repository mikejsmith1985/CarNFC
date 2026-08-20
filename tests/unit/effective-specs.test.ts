// Unit tests for effective-spec resolution (FR-009, FR-010). Mirrors what the database view must produce.

import { describe, expect, it } from 'vitest'
import {
  resolveEffectiveSpecs,
  type FactorySpec,
  type OverrideSpec,
} from '@/lib/calc/effective-specs'

const FACTORY: FactorySpec[] = [
  { specKey: 'drain_torque', label: 'Drain torque', value: '24', unit: 'ft-lbs' },
  { specKey: 'capacity', label: 'Capacity', value: '2.1', unit: 'qt' },
]

function override(overrides: Partial<OverrideSpec> & { specKey: string }): OverrideSpec {
  return {
    label: 'Drain torque',
    newValue: '45',
    unit: 'ft-lbs',
    supersededValue: '24',
    revisionId: 'rev-1',
    serverReceivedAt: '2026-06-12T10:00:00Z',
    ...overrides,
  }
}

describe('resolveEffectiveSpecs', () => {
  it('reports untouched factory specs as factory', () => {
    const result = resolveEffectiveSpecs(FACTORY, [])
    const torque = result.find((spec) => spec.specKey === 'drain_torque')!

    expect(torque.origin).toBe('factory')
    expect(torque.effectiveValue).toBe('24')
    expect(torque.supersededOverrideCount).toBe(0)
  })

  it('lets an override take over, keeping the factory value for reference', () => {
    const result = resolveEffectiveSpecs(FACTORY, [override({ specKey: 'drain_torque' })])
    const torque = result.find((spec) => spec.specKey === 'drain_torque')!

    // This is the number a torque wrench gets set to.
    expect(torque.effectiveValue).toBe('45')
    expect(torque.origin).toBe('override')
    expect(torque.factoryValue).toBe('24')
  })

  it('leaves other specs alone when one is overridden', () => {
    const result = resolveEffectiveSpecs(FACTORY, [override({ specKey: 'drain_torque' })])
    const capacity = result.find((spec) => spec.specKey === 'capacity')!

    expect(capacity.origin).toBe('factory')
    expect(capacity.effectiveValue).toBe('2.1')
  })

  it('makes the newest of two overrides effective and counts the superseded one', () => {
    const result = resolveEffectiveSpecs(FACTORY, [
      override({
        specKey: 'capacity',
        newValue: '2.5',
        revisionId: 'older',
        serverReceivedAt: '2025-01-15T10:00:00Z',
      }),
      override({
        specKey: 'capacity',
        newValue: '2.8',
        revisionId: 'newer',
        serverReceivedAt: '2026-03-01T10:00:00Z',
      }),
    ])
    const capacity = result.find((spec) => spec.specKey === 'capacity')!

    expect(capacity.effectiveValue).toBe('2.8')
    expect(capacity.supersededOverrideCount).toBe(1)
    expect(capacity.overrideRevisionId).toBe('newer')
  })

  it('counts three overrides as two superseded', () => {
    const result = resolveEffectiveSpecs(FACTORY, [
      override({ specKey: 'capacity', revisionId: 'a', serverReceivedAt: '2024-01-01T00:00:00Z' }),
      override({ specKey: 'capacity', revisionId: 'b', serverReceivedAt: '2025-01-01T00:00:00Z' }),
      override({ specKey: 'capacity', revisionId: 'c', serverReceivedAt: '2026-01-01T00:00:00Z' }),
    ])
    expect(result.find((spec) => spec.specKey === 'capacity')!.supersededOverrideCount).toBe(2)
  })

  it('surfaces an override for a spec the factory never had', () => {
    const result = resolveEffectiveSpecs(FACTORY, [
      override({
        specKey: 'locker_psi',
        label: 'Locker air pressure',
        newValue: '105',
        unit: 'psi',
        supersededValue: null,
      }),
    ])
    const locker = result.find((spec) => spec.specKey === 'locker_psi')!

    // An aftermarket part can introduce a figure the OEM equivalent had none of.
    expect(locker.effectiveValue).toBe('105')
    expect(locker.origin).toBe('override')
    expect(locker.factoryValue).toBeNull()
  })

  it('ranks a pending override above a delivered one', () => {
    const result = resolveEffectiveSpecs(FACTORY, [
      override({
        specKey: 'drain_torque',
        newValue: '45',
        revisionId: 'delivered',
        serverReceivedAt: '2026-06-12T10:00:00Z',
      }),
      override({
        specKey: 'drain_torque',
        newValue: '50',
        revisionId: 'pending',
        serverReceivedAt: null,
      }),
    ])
    expect(result.find((spec) => spec.specKey === 'drain_torque')!.effectiveValue).toBe('50')
  })

  it('breaks a receipt tie deterministically by revision id', () => {
    const result = resolveEffectiveSpecs(FACTORY, [
      override({ specKey: 'capacity', newValue: '2.5', revisionId: 'aaa' }),
      override({ specKey: 'capacity', newValue: '2.8', revisionId: 'zzz' }),
    ])
    expect(result.find((spec) => spec.specKey === 'capacity')!.effectiveValue).toBe('2.8')
  })

  it('falls back to the factory unit when an override omits one', () => {
    const result = resolveEffectiveSpecs(FACTORY, [
      override({ specKey: 'drain_torque', unit: null }),
    ])
    expect(result.find((spec) => spec.specKey === 'drain_torque')!.unit).toBe('ft-lbs')
  })

  it('returns nothing when there is nothing to resolve', () => {
    expect(resolveEffectiveSpecs([], [])).toEqual([])
  })
})

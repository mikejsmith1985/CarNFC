// Unit tests for the setup checklist a new owner works through.

import { describe, expect, it } from 'vitest'
import {
  buildOnboardingSteps,
  currentOnboardingStep,
  isOnboardingComplete,
  type OnboardingProgress,
} from '@/lib/onboarding/steps'

const nothing: OnboardingProgress = {
  vehicleCount: 0,
  reservedTagCount: 0,
  boundTagCount: 0,
  entryCount: 0,
}

describe('buildOnboardingSteps', () => {
  it('walks from a vehicle to a first logged job', () => {
    const keys = buildOnboardingSteps(nothing).map((step) => step.key)
    expect(keys).toEqual(['vehicle', 'tag', 'claim', 'log'])
  })

  it('marks nothing done for someone who has just signed in', () => {
    expect(buildOnboardingSteps(nothing).every((step) => !step.isDone)).toBe(true)
  })

  it('marks the vehicle step done once one exists', () => {
    const steps = buildOnboardingSteps({ ...nothing, vehicleCount: 1 })
    expect(steps.find((step) => step.key === 'vehicle')?.isDone).toBe(true)
  })

  // A ready-made tag is never "set up" by the owner, so arriving with one bound
  // has to satisfy the earlier step too — otherwise the list nags about work
  // that was done in the factory.
  it('counts a bound tag as having set one up', () => {
    const steps = buildOnboardingSteps({ ...nothing, vehicleCount: 1, boundTagCount: 1 })
    expect(steps.find((step) => step.key === 'tag')?.isDone).toBe(true)
    expect(steps.find((step) => step.key === 'claim')?.isDone).toBe(true)
  })

  it('counts a reserved tag as set up but not yet claimed', () => {
    const steps = buildOnboardingSteps({ ...nothing, vehicleCount: 1, reservedTagCount: 1 })
    expect(steps.find((step) => step.key === 'tag')?.isDone).toBe(true)
    expect(steps.find((step) => step.key === 'claim')?.isDone).toBe(false)
  })

  it('marks the log step done once anything has been recorded', () => {
    const steps = buildOnboardingSteps({ ...nothing, entryCount: 1 })
    expect(steps.find((step) => step.key === 'log')?.isDone).toBe(true)
  })

  it('gives every step something to read', () => {
    for (const step of buildOnboardingSteps(nothing)) {
      expect(step.title.trim().length).toBeGreaterThan(0)
      expect(step.detail.trim().length).toBeGreaterThan(0)
    }
  })
})

describe('currentOnboardingStep', () => {
  it('starts at the vehicle', () => {
    expect(currentOnboardingStep(nothing)?.key).toBe('vehicle')
  })

  it('moves on as each is finished', () => {
    expect(currentOnboardingStep({ ...nothing, vehicleCount: 1 })?.key).toBe('tag')
    expect(currentOnboardingStep({ ...nothing, vehicleCount: 1, reservedTagCount: 1 })?.key).toBe(
      'claim',
    )
    expect(currentOnboardingStep({ ...nothing, vehicleCount: 1, boundTagCount: 1 })?.key).toBe(
      'log',
    )
  })

  // Someone can log a job before tagging anything; the list should point at what
  // is actually outstanding rather than insisting on its own order.
  it('points at the first unfinished step, not the first step', () => {
    expect(currentOnboardingStep({ ...nothing, entryCount: 1 })?.key).toBe('vehicle')
    expect(currentOnboardingStep({ ...nothing, vehicleCount: 1, entryCount: 1 })?.key).toBe('tag')
  })

  it('has nothing to point at once everything is done', () => {
    const done = { vehicleCount: 1, reservedTagCount: 1, boundTagCount: 1, entryCount: 1 }
    expect(currentOnboardingStep(done)).toBeNull()
  })
})

describe('isOnboardingComplete', () => {
  it('is false while anything remains', () => {
    expect(isOnboardingComplete({ ...nothing, vehicleCount: 1, boundTagCount: 1 })).toBe(false)
  })

  it('is true once a job has been logged against a claimed tag', () => {
    expect(
      isOnboardingComplete({
        vehicleCount: 1,
        reservedTagCount: 0,
        boundTagCount: 1,
        entryCount: 1,
      }),
    ).toBe(true)
  })
})

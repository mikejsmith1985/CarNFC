// Unit tests for settings conflict resolution (FR-043b).

import { describe, expect, it } from 'vitest'
import {
  collapseSettingsChanges,
  settingsChangeKey,
  shouldAcceptServerValue,
  type PendingSettingsChange,
} from '@/lib/offline/settings-sync'

function change(overrides: Partial<PendingSettingsChange> = {}): PendingSettingsChange {
  return {
    key: settingsChangeKey('vehicle', 'v1', 'nickname'),
    scope: 'vehicle',
    targetId: 'v1',
    field: 'nickname',
    value: 'Raptor',
    clientCreatedAt: '2026-06-12T10:00:00Z',
    ...overrides,
  }
}

describe('settingsChangeKey', () => {
  it('is stable for the same field on the same record', () => {
    expect(settingsChangeKey('vehicle', 'v1', 'nickname')).toBe(
      settingsChangeKey('vehicle', 'v1', 'nickname'),
    )
  })

  it('separates different fields', () => {
    expect(settingsChangeKey('vehicle', 'v1', 'nickname')).not.toBe(
      settingsChangeKey('vehicle', 'v1', 'slug'),
    )
  })

  it('separates the same field on different records', () => {
    expect(settingsChangeKey('vehicle', 'v1', 'nickname')).not.toBe(
      settingsChangeKey('vehicle', 'v2', 'nickname'),
    )
  })
})

describe('collapseSettingsChanges', () => {
  it('keeps a single change unchanged', () => {
    expect(collapseSettingsChanges([change()])).toHaveLength(1)
  })

  it('keeps only the newest edit to one field', () => {
    // Renaming three times offline should send one change, not three.
    const result = collapseSettingsChanges([
      change({ value: 'First', clientCreatedAt: '2026-06-12T10:00:00Z' }),
      change({ value: 'Second', clientCreatedAt: '2026-06-12T11:00:00Z' }),
      change({ value: 'Third', clientCreatedAt: '2026-06-12T12:00:00Z' }),
    ])

    expect(result).toHaveLength(1)
    expect(result[0]!.value).toBe('Third')
  })

  it('keeps changes to different fields separate', () => {
    const result = collapseSettingsChanges([
      change({ key: settingsChangeKey('vehicle', 'v1', 'nickname') }),
      change({ key: settingsChangeKey('vehicle', 'v1', 'slug'), field: 'slug' }),
    ])
    expect(result).toHaveLength(2)
  })

  it('returns them oldest first, so they apply in the order they were made', () => {
    const result = collapseSettingsChanges([
      change({ key: 'b', clientCreatedAt: '2026-06-12T12:00:00Z' }),
      change({ key: 'a', clientCreatedAt: '2026-06-12T10:00:00Z' }),
    ])
    expect(result.map((entry) => entry.key)).toEqual(['a', 'b'])
  })

  it('handles an empty queue', () => {
    expect(collapseSettingsChanges([])).toEqual([])
  })
})

describe('shouldAcceptServerValue', () => {
  it('accepts the server value when nothing local is pending', () => {
    expect(shouldAcceptServerValue('vehicle:v1:nickname', [])).toBe(true)
  })

  it('keeps the local value while an edit is still undelivered', () => {
    // A background refresh must not visibly undo what the owner just typed.
    const pending = [change({ key: 'vehicle:v1:nickname' })]
    expect(shouldAcceptServerValue('vehicle:v1:nickname', pending)).toBe(false)
  })

  it('accepts the server value for a field with no pending edit', () => {
    const pending = [change({ key: 'vehicle:v1:nickname' })]
    expect(shouldAcceptServerValue('vehicle:v1:slug', pending)).toBe(true)
  })
})

// Unit tests for UUIDv7 generation, which is what makes offline sync exactly-once (FR-041).

import { describe, expect, it } from 'vitest'
import { createRevisionId, readUuidV7Timestamp } from '@/lib/offline/uuid'

const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe('createRevisionId', () => {
  it('produces a well-formed UUID', () => {
    expect(createRevisionId()).toMatch(UUID_SHAPE)
  })

  it('sets the version nibble to 7', () => {
    expect(createRevisionId()[14]).toBe('7')
  })

  it('sets the RFC 4122 variant bits', () => {
    expect(['8', '9', 'a', 'b']).toContain(createRevisionId()[19])
  })

  it('never repeats', () => {
    const batch = Array.from({ length: 500 }, () => createRevisionId())
    expect(new Set(batch).size).toBe(500)
  })

  it('sorts by creation time, which keeps index locality good', () => {
    // The revision tables are append-only and grow forever; v4 would scatter
    // inserts across the index.
    const first = createRevisionId()
    const later = Array.from({ length: 50 }, () => createRevisionId())
    expect([first, ...later].every((id, index, all) => index === 0 || all[index - 1]! <= id)).toBe(
      true,
    )
  })
})

describe('readUuidV7Timestamp', () => {
  it('recovers roughly the creation time', () => {
    const before = Date.now()
    const recovered = readUuidV7Timestamp(createRevisionId())
    expect(recovered).not.toBeNull()
    expect(recovered!.getTime()).toBeGreaterThanOrEqual(before - 1000)
    expect(recovered!.getTime()).toBeLessThanOrEqual(Date.now() + 1000)
  })

  it('returns null for a malformed identifier', () => {
    expect(readUuidV7Timestamp('not-a-uuid')).toBeNull()
  })
})

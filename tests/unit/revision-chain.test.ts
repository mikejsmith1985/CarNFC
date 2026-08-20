// Unit tests for revision-chain resolution (FR-027a, FR-043a).

import { describe, expect, it } from 'vitest'
import {
  countRevisions,
  resolveCurrentRevisions,
  type RevisionLike,
} from '@/lib/calc/revision-chain'

function revision(
  overrides: Partial<RevisionLike> & { id: string; entryId: string },
): RevisionLike {
  return {
    isTombstone: false,
    serverReceivedAt: '2026-06-12T10:00:00Z',
    clientCreatedAt: '2026-06-12T10:00:00Z',
    ...overrides,
  }
}

describe('resolveCurrentRevisions', () => {
  it('returns a single revision unchanged', () => {
    const result = resolveCurrentRevisions([revision({ id: 'r1', entryId: 'e1' })])
    expect(result.map((entry) => entry.id)).toEqual(['r1'])
  })

  it('picks the latest by server receipt', () => {
    const result = resolveCurrentRevisions([
      revision({ id: 'r1', entryId: 'e1', serverReceivedAt: '2026-06-12T10:00:00Z' }),
      revision({ id: 'r2', entryId: 'e1', serverReceivedAt: '2026-06-12T11:00:00Z' }),
    ])
    expect(result.map((entry) => entry.id)).toEqual(['r2'])
  })

  it('ignores a device clock that disagrees with server receipt', () => {
    // The skewed device claims to be newer; server receipt says otherwise.
    const result = resolveCurrentRevisions([
      revision({
        id: 'skewed',
        entryId: 'e1',
        serverReceivedAt: '2026-06-12T10:00:00Z',
        clientCreatedAt: '2026-06-15T10:00:00Z',
      }),
      revision({
        id: 'correct',
        entryId: 'e1',
        serverReceivedAt: '2026-06-12T11:00:00Z',
        clientCreatedAt: '2026-06-12T11:00:00Z',
      }),
    ])
    expect(result.map((entry) => entry.id)).toEqual(['correct'])
  })

  it('breaks a receipt tie deterministically by id', () => {
    const result = resolveCurrentRevisions([
      revision({ id: 'aaa', entryId: 'e1' }),
      revision({ id: 'zzz', entryId: 'e1' }),
    ])
    expect(result.map((entry) => entry.id)).toEqual(['zzz'])
  })

  it('excludes an entry whose latest revision is a tombstone', () => {
    const result = resolveCurrentRevisions([
      revision({ id: 'r1', entryId: 'e1', serverReceivedAt: '2026-06-12T10:00:00Z' }),
      revision({
        id: 'r2',
        entryId: 'e1',
        isTombstone: true,
        serverReceivedAt: '2026-06-12T11:00:00Z',
      }),
    ])
    expect(result).toEqual([])
  })

  it('keeps an entry whose tombstone was itself superseded by a later revision', () => {
    const result = resolveCurrentRevisions([
      revision({ id: 'r1', entryId: 'e1', serverReceivedAt: '2026-06-12T10:00:00Z' }),
      revision({
        id: 'r2',
        entryId: 'e1',
        isTombstone: true,
        serverReceivedAt: '2026-06-12T11:00:00Z',
      }),
      revision({ id: 'r3', entryId: 'e1', serverReceivedAt: '2026-06-12T12:00:00Z' }),
    ])
    expect(result.map((entry) => entry.id)).toEqual(['r3'])
  })

  it('treats a pending revision as newer than any delivered one', () => {
    // It is what the person just wrote; showing them something else would be a
    // lie about their own action.
    const result = resolveCurrentRevisions([
      revision({ id: 'delivered', entryId: 'e1', serverReceivedAt: '2026-06-12T23:00:00Z' }),
      revision({ id: 'pending', entryId: 'e1', serverReceivedAt: null }),
    ])
    expect(result.map((entry) => entry.id)).toEqual(['pending'])
  })

  it('orders two pending revisions from one device by its own clock', () => {
    const result = resolveCurrentRevisions([
      revision({
        id: 'first',
        entryId: 'e1',
        serverReceivedAt: null,
        clientCreatedAt: '2026-06-12T10:00:00Z',
      }),
      revision({
        id: 'second',
        entryId: 'e1',
        serverReceivedAt: null,
        clientCreatedAt: '2026-06-12T11:00:00Z',
      }),
    ])
    expect(result.map((entry) => entry.id)).toEqual(['second'])
  })

  it('resolves each entry independently', () => {
    const result = resolveCurrentRevisions([
      revision({ id: 'a1', entryId: 'e1', serverReceivedAt: '2026-06-12T10:00:00Z' }),
      revision({ id: 'a2', entryId: 'e1', serverReceivedAt: '2026-06-12T11:00:00Z' }),
      revision({ id: 'b1', entryId: 'e2', serverReceivedAt: '2026-06-12T10:00:00Z' }),
    ])
    expect(result.map((entry) => entry.id).sort()).toEqual(['a2', 'b1'])
  })

  it('returns nothing for an empty chain', () => {
    expect(resolveCurrentRevisions([])).toEqual([])
  })
})

describe('countRevisions', () => {
  it('counts every revision of an entry, tombstones included', () => {
    const chain = [
      revision({ id: 'r1', entryId: 'e1' }),
      revision({ id: 'r2', entryId: 'e1', isTombstone: true }),
      revision({ id: 'r3', entryId: 'e2' }),
    ]
    expect(countRevisions(chain, 'e1')).toBe(2)
  })

  it('reports one for an entry never edited', () => {
    expect(countRevisions([revision({ id: 'r1', entryId: 'e1' })], 'e1')).toBe(1)
  })
})

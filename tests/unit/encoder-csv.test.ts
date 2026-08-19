// Unit tests for the file handed to whoever writes the physical tags.

import { describe, expect, it } from 'vitest'
import { buildEncoderCsv } from '@/lib/tags/encoder-csv'

const APP_URL = 'https://app.rootlevellabs.tech'

describe('buildEncoderCsv', () => {
  it('names its columns, because a person opens this in a spreadsheet', () => {
    const csv = buildEncoderCsv(['abc'], APP_URL)
    expect(csv.split('\n')[0]).toBe('tag_id,url')
  })

  it('writes the full address for each tag', () => {
    const csv = buildEncoderCsv(['abc', 'def'], APP_URL)
    expect(csv).toContain(`abc,${APP_URL}/t/abc`)
    expect(csv).toContain(`def,${APP_URL}/t/def`)
  })

  it('produces one line per tag plus the header', () => {
    expect(buildEncoderCsv(['a', 'b', 'c'], APP_URL).split('\n')).toHaveLength(4)
  })

  it('still produces a usable file for an empty batch', () => {
    expect(buildEncoderCsv([], APP_URL)).toBe('tag_id,url')
  })

  // An encoder reads this literally; a stray slash would write a broken link to
  // several hundred pieces of hardware.
  it('does not double the slash when the address ends in one', () => {
    expect(buildEncoderCsv(['abc'], `${APP_URL}/`)).toContain(`abc,${APP_URL}/t/abc`)
  })
})

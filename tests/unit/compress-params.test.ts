// Unit tests for compression decisions. No image decoding here — that is real work and lives in the integration layer (Article V).

import { describe, expect, it } from 'vitest'
import {
  acceptFile,
  computeTargetDimensions,
  isAcceptedType,
  renameToWebp,
  shouldPassThrough,
} from '@/lib/media/compress-params'
import { ATTACHMENT_MAX_PER_ENTRY, IMAGE_MAX_LONGEST_EDGE_PX } from '@/lib/constants'

describe('computeTargetDimensions', () => {
  it('scales a landscape photo to the longest-edge budget', () => {
    expect(computeTargetDimensions({ width: 4032, height: 3024 })).toEqual({
      width: IMAGE_MAX_LONGEST_EDGE_PX,
      height: 1536,
    })
  })

  it('scales a portrait photo by its height', () => {
    expect(computeTargetDimensions({ width: 3024, height: 4032 })).toEqual({
      width: 1536,
      height: IMAGE_MAX_LONGEST_EDGE_PX,
    })
  })

  it('leaves an image already inside the budget untouched', () => {
    // Upscaling would inflate the file without adding legibility.
    expect(computeTargetDimensions({ width: 800, height: 600 })).toEqual({
      width: 800,
      height: 600,
    })
  })

  it('preserves aspect ratio on an extreme panorama', () => {
    const result = computeTargetDimensions({ width: 10_000, height: 500 })
    expect(result.width).toBe(IMAGE_MAX_LONGEST_EDGE_PX)
    expect(result.height).toBe(102)
  })

  it('never collapses a dimension to zero', () => {
    const result = computeTargetDimensions({ width: 20_000, height: 3 })
    expect(result.height).toBeGreaterThanOrEqual(1)
  })
})

describe('type handling', () => {
  it('passes a PDF through so a manual stays searchable', () => {
    expect(shouldPassThrough('application/pdf')).toBe(true)
  })

  it('compresses photographs', () => {
    expect(shouldPassThrough('image/jpeg')).toBe(false)
    expect(shouldPassThrough('image/heic')).toBe(false)
  })

  it('accepts the documented photo and document types', () => {
    for (const type of ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf']) {
      expect(isAcceptedType(type)).toBe(true)
    }
  })

  it('rejects anything else', () => {
    expect(isAcceptedType('application/x-msdownload')).toBe(false)
    expect(isAcceptedType('video/mp4')).toBe(false)
  })
})

describe('acceptFile', () => {
  const photo = { name: 'receipt.jpg', type: 'image/jpeg', size: 4_000_000 }

  it('accepts a photograph under the per-entry count', () => {
    expect(acceptFile(photo, 0).isAccepted).toBe(true)
  })

  it('accepts a large photograph, because compression happens before the cap', () => {
    expect(acceptFile({ ...photo, size: 40_000_000 }, 0).isAccepted).toBe(true)
  })

  it('rejects a sixth file and names the limit', () => {
    const result = acceptFile(photo, ATTACHMENT_MAX_PER_ENTRY)
    expect(result.reason).toBe('too_many')
    expect(result.message).toContain(String(ATTACHMENT_MAX_PER_ENTRY))
  })

  it('rejects an unsupported type and names the file', () => {
    const result = acceptFile({ name: 'tune.exe', type: 'application/x-msdownload', size: 10 }, 0)
    expect(result.reason).toBe('unsupported_type')
    expect(result.message).toContain('tune.exe')
  })

  it('rejects an oversized PDF, which is never compressed', () => {
    const result = acceptFile({ name: 'manual.pdf', type: 'application/pdf', size: 20_000_000 }, 0)
    expect(result.reason).toBe('too_large')
    expect(result.message).toContain('10 MB')
  })

  it('accepts a PDF inside the cap', () => {
    expect(
      acceptFile({ name: 'manual.pdf', type: 'application/pdf', size: 2_000_000 }, 0).isAccepted,
    ).toBe(true)
  })
})

describe('renameToWebp', () => {
  it('swaps the extension after re-encoding', () => {
    expect(renameToWebp('receipt.jpg')).toBe('receipt.webp')
  })

  it('handles a filename containing dots', () => {
    expect(renameToWebp('invoice.2026.06.12.heic')).toBe('invoice.2026.06.12.webp')
  })

  it('appends an extension when there was none', () => {
    expect(renameToWebp('scan')).toBe('scan.webp')
  })
})

// On-device photo compression using native browser APIs. No third-party library — the framework-first gate passed (research.md R14).
'use client'

import { IMAGE_WEBP_QUALITY } from '@/lib/constants'
import {
  computeTargetDimensions,
  renameToWebp,
  shouldPassThrough,
} from '@/lib/media/compress-params'

export interface CompressedFile {
  blob: Blob
  filename: string
  mimeType: string
  originalBytes: number
  compressedBytes: number
}

/**
 * Compresses a photograph on the device, or passes a PDF through untouched.
 *
 * Two things are usually why a library gets reached for here, and both are
 * native now:
 *
 *   - `imageOrientation: 'from-image'` applies the EXIF rotation. Without it a
 *     receipt photographed in portrait renders sideways, which fails SC-014
 *     outright — an unreadable receipt is the same as no receipt.
 *   - `OffscreenCanvas` lets the work happen off the main thread, so the UI
 *     does not freeze while someone is standing over an engine bay.
 *
 * Compression happens before the file is queued, so the outbox stays small
 * enough to drain on a marginal connection (FR-026a, SC-015).
 */
export async function compressAttachment(file: File): Promise<CompressedFile> {
  if (shouldPassThrough(file.type)) {
    return {
      blob: file,
      filename: file.name,
      mimeType: file.type,
      originalBytes: file.size,
      compressedBytes: file.size,
    }
  }

  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })

  try {
    const target = computeTargetDimensions({ width: bitmap.width, height: bitmap.height })
    const canvas = createCanvas(target.width, target.height)
    const context = canvas.getContext('2d')

    if (!context) throw new Error('Could not prepare the image for compression')

    context.drawImage(bitmap, 0, 0, target.width, target.height)
    const blob = await canvasToBlob(canvas)

    return {
      blob,
      filename: renameToWebp(file.name),
      mimeType: 'image/webp',
      originalBytes: file.size,
      compressedBytes: blob.size,
    }
  } finally {
    // Bitmaps hold decoded pixel data; a phone runs out of memory fast without this.
    bitmap.close()
  }
}

/** Prefers OffscreenCanvas, falling back to a DOM canvas where it is unavailable. */
function createCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

/** Encodes a canvas to WebP, whichever canvas flavour it is. */
async function canvasToBlob(canvas: OffscreenCanvas | HTMLCanvasElement): Promise<Blob> {
  if ('convertToBlob' in canvas) {
    return canvas.convertToBlob({ type: 'image/webp', quality: IMAGE_WEBP_QUALITY })
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Image encoding failed'))),
      'image/webp',
      IMAGE_WEBP_QUALITY,
    )
  })
}

// Decides how an attachment should be processed, separately from actually processing it — so the decisions stay unit-testable.

import {
  ATTACHMENT_ACCEPTED_MIME_TYPES,
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_PER_ENTRY,
  ATTACHMENT_PASSTHROUGH_MIME_TYPES,
  BYTES_PER_KILOBYTE,
  IMAGE_MAX_LONGEST_EDGE_PX,
} from '@/lib/constants'

export interface Dimensions {
  width: number
  height: number
}

export type RejectionReason = 'unsupported_type' | 'too_large' | 'too_many'

export interface FileAcceptance {
  isAccepted: boolean
  reason: RejectionReason | null
  /** Names the specific limit that was exceeded, as FR-026 requires. */
  message: string | null
}

/**
 * Scales an image down to the longest-edge budget, preserving aspect ratio.
 *
 * An image already inside the budget is left alone: upscaling would inflate the
 * file for no gain in legibility, and legibility is the entire point of the
 * budget (SC-014).
 */
export function computeTargetDimensions(source: Dimensions): Dimensions {
  const longestEdge = Math.max(source.width, source.height)
  if (longestEdge <= IMAGE_MAX_LONGEST_EDGE_PX) return { ...source }

  const scale = IMAGE_MAX_LONGEST_EDGE_PX / longestEdge
  return {
    width: Math.max(1, Math.round(source.width * scale)),
    height: Math.max(1, Math.round(source.height * scale)),
  }
}

/**
 * Whether a file is stored exactly as supplied.
 *
 * PDFs are passed through so an installation manual stays searchable and its
 * text stays selectable — re-encoding one as an image would destroy both.
 */
export function shouldPassThrough(mimeType: string): boolean {
  return (ATTACHMENT_PASSTHROUGH_MIME_TYPES as readonly string[]).includes(mimeType)
}

/** Whether the file type is accepted at all. */
export function isAcceptedType(mimeType: string): boolean {
  return (ATTACHMENT_ACCEPTED_MIME_TYPES as readonly string[]).includes(mimeType)
}

/**
 * Decides whether one file can be attached.
 *
 * Rejection messages name the limit that was exceeded rather than saying the
 * file was refused, because "too big" without a number tells someone holding a
 * phone nothing about what to do next.
 */
export function acceptFile(
  file: { name: string; type: string; size: number },
  existingCount: number,
): FileAcceptance {
  if (existingCount >= ATTACHMENT_MAX_PER_ENTRY) {
    return {
      isAccepted: false,
      reason: 'too_many',
      message: `Up to ${ATTACHMENT_MAX_PER_ENTRY} files per entry.`,
    }
  }

  if (!isAcceptedType(file.type)) {
    return {
      isAccepted: false,
      reason: 'unsupported_type',
      message: `${file.name} is not a photo or PDF.`,
    }
  }

  // Photographs are compressed before the cap is applied, so only a
  // pass-through file can fail on size at this stage.
  if (shouldPassThrough(file.type) && file.size > ATTACHMENT_MAX_BYTES) {
    const megabytes = Math.round(ATTACHMENT_MAX_BYTES / (BYTES_PER_KILOBYTE * BYTES_PER_KILOBYTE))
    return {
      isAccepted: false,
      reason: 'too_large',
      message: `${file.name} is over the ${megabytes} MB limit.`,
    }
  }

  return { isAccepted: true, reason: null, message: null }
}

/** Swaps a filename's extension after re-encoding. */
export function renameToWebp(originalName: string): string {
  return originalName.replace(/\.[^.]+$/, '') + '.webp'
}

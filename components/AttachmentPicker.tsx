// Attaches photos and PDFs to a log entry: captures, compresses on-device, enforces the limits, and queues bytes for upload.
'use client'

import { useRef, useState } from 'react'
import { Paperclip, X, FileText, ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { compressAttachment } from '@/lib/media/compress'
import { acceptFile } from '@/lib/media/compress-params'
import { createRevisionId } from '@/lib/offline/uuid'
import { putBlob } from '@/lib/offline/db'
import {
  ATTACHMENT_ACCEPTED_MIME_TYPES,
  ATTACHMENT_MAX_PER_ENTRY,
  BYTES_PER_KILOBYTE,
} from '@/lib/constants'

export interface PendingAttachment {
  id: string
  filename: string
  mimeType: string
  bytes: number
  isImage: boolean
}

interface AttachmentPickerProps {
  attachments: PendingAttachment[]
  onChange: (next: PendingAttachment[]) => void
}

/**
 * Collects attachments for the entry being written.
 *
 * Compression runs here, before anything is stored, so a queued entry stays
 * small enough to drain on a marginal connection. The bytes go into IndexedDB
 * immediately rather than being held in memory, so a receipt photographed in a
 * garage survives the browser being closed before signal returns (FR-026b).
 */
export function AttachmentPicker({ attachments, onChange }: AttachmentPickerProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [rejections, setRejections] = useState<string[]>([])
  const [isProcessing, setIsProcessing] = useState(false)

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return

    setRejections([])
    setIsProcessing(true)

    const accepted: PendingAttachment[] = []
    const refused: string[] = []

    for (const file of Array.from(fileList)) {
      const verdict = acceptFile(file, attachments.length + accepted.length)
      if (!verdict.isAccepted) {
        if (verdict.message) refused.push(verdict.message)
        continue
      }

      try {
        const compressed = await compressAttachment(file)
        const attachmentId = createRevisionId()

        // Stored before the entry is even saved: the photo is the part most
        // likely to be lost, and the least reproducible.
        await putBlob(attachmentId, '', compressed.blob, compressed.mimeType)

        accepted.push({
          id: attachmentId,
          filename: compressed.filename,
          mimeType: compressed.mimeType,
          bytes: compressed.compressedBytes,
          isImage: compressed.mimeType !== 'application/pdf',
        })
      } catch {
        refused.push(`${file.name} could not be processed on this device.`)
      }
    }

    setIsProcessing(false)
    setRejections(refused)
    if (accepted.length > 0) onChange([...attachments, ...accepted])
    if (inputRef.current) inputRef.current.value = ''
  }

  const remaining = ATTACHMENT_MAX_PER_ENTRY - attachments.length

  return (
    <div className="space-y-2">
      <span className="block text-sm font-semibold text-text-secondary">
        Photos &amp; documents
      </span>

      {attachments.length > 0 ? (
        <ul className="space-y-2">
          {attachments.map((attachment) => (
            <li
              key={attachment.id}
              className="flex min-h-touch items-center gap-2 rounded-card border border-border bg-surface-sunken px-3 py-2"
            >
              {attachment.isImage ? (
                <ImageIcon size={16} className="shrink-0 text-text-secondary" aria-hidden />
              ) : (
                <FileText size={16} className="shrink-0 text-text-secondary" aria-hidden />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{attachment.filename}</span>
                <span className="block text-xs tabular text-text-muted">
                  {formatBytes(attachment.bytes)}
                </span>
              </span>
              <button
                type="button"
                aria-label={`Remove ${attachment.filename}`}
                onClick={() => onChange(attachments.filter((item) => item.id !== attachment.id))}
                className="flex min-h-touch min-w-touch items-center justify-center text-text-muted"
              >
                <X size={18} aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ATTACHMENT_ACCEPTED_MIME_TYPES.join(',')}
        // Offers the camera directly on a phone, which is where this is used.
        capture="environment"
        className="hidden"
        onChange={(event) => void handleFiles(event.target.files)}
      />

      <Button
        variant="secondary"
        fullWidth
        icon={<Paperclip size={16} aria-hidden />}
        onClick={() => inputRef.current?.click()}
        disabled={isProcessing || remaining <= 0}
      >
        {isProcessing
          ? 'Processing…'
          : remaining <= 0
            ? `Limit of ${ATTACHMENT_MAX_PER_ENTRY} reached`
            : `Add photo or PDF (${remaining} left)`}
      </Button>

      {rejections.map((message) => (
        <p key={message} role="alert" className="text-xs font-medium text-danger">
          {message}
        </p>
      ))}
    </div>
  )
}

/** Formats a byte count for a phone screen. */
function formatBytes(bytes: number): string {
  const KILOBYTE = BYTES_PER_KILOBYTE
  if (bytes < KILOBYTE) return `${bytes} B`
  if (bytes < KILOBYTE * KILOBYTE) return `${Math.round(bytes / KILOBYTE)} KB`
  return `${(bytes / (KILOBYTE * KILOBYTE)).toFixed(1)} MB`
}

// The runs made so far, and how much of each has reached a customer.
'use client'

import { useState, useTransition } from 'react'
import { Package, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { hydrationMarker, useIsHydrated } from '@/components/ui/useIsHydrated'
import { readBatchTags, type TagBatchSummary } from '@/app/actions/admin-tags'
import { buildEncoderCsv } from '@/lib/tags/encoder-csv'
import { COPY_FEEDBACK_MS } from '@/lib/constants'

interface TagBatchListProps {
  batches: TagBatchSummary[]
  appUrl: string
}

/**
 * Lists production runs with their claim rate.
 *
 * The claimed count is the only signal that hardware reached somebody and
 * worked: a run sitting at zero weeks after shipping means the tags are wrong,
 * unwritten, or still in a box.
 */
export function TagBatchList({ batches, appUrl }: TagBatchListProps) {
  const isReady = useIsHydrated()
  const [copiedBatchId, setCopiedBatchId] = useState<string | null>(null)
  const [isReading, startReading] = useTransition()

  if (batches.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-border-strong px-4 py-8 text-center text-sm text-text-muted">
        No runs yet. Make one above and the encoder file comes with it.
      </p>
    )
  }

  const handleCopy = (batchId: string) => {
    startReading(async () => {
      const tags = await readBatchTags(batchId)
      await navigator.clipboard.writeText(
        buildEncoderCsv(
          tags.map((tag) => tag.tagId),
          appUrl,
        ),
      )
      setCopiedBatchId(batchId)
      setTimeout(() => setCopiedBatchId(null), COPY_FEEDBACK_MS)
    })
  }

  return (
    <ul className="space-y-3" {...hydrationMarker(isReady)}>
      {batches.map((batch) => (
        <li key={batch.id} className="rounded-card border border-border bg-surface-raised p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="flex items-center gap-2 font-semibold text-text-primary">
                <Package size={16} className="shrink-0 text-text-secondary" aria-hidden />
                <span className="truncate">{batch.label}</span>
              </p>
              {batch.note ? (
                <p className="mt-0.5 pl-6 text-sm text-text-muted">{batch.note}</p>
              ) : null}
              <p className="mt-0.5 pl-6 text-xs text-text-muted">
                {new Date(batch.createdAt).toLocaleDateString()}
              </p>
            </div>

            <p className="shrink-0 rounded-card border border-border-strong bg-surface-sunken px-2.5 py-1.5 text-sm font-bold tabular text-text-primary">
              {batch.claimedCount}/{batch.tagCount}
            </p>
          </div>

          <p className="mt-2 text-xs text-text-muted">
            {batch.claimedCount === 0
              ? 'None claimed yet — still in a box, or not written.'
              : `${batch.claimedCount} of ${batch.tagCount} in use.`}
          </p>

          <Button
            variant="secondary"
            fullWidth
            icon={
              copiedBatchId === batch.id ? (
                <Check size={16} aria-hidden />
              ) : (
                <Copy size={16} aria-hidden />
              )
            }
            onClick={() => handleCopy(batch.id)}
            disabled={isReading}
            className="mt-3"
          >
            {copiedBatchId === batch.id ? 'Copied' : 'Copy encoder file'}
          </Button>
        </li>
      ))}
    </ul>
  )
}

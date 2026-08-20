// Makes a production run of tags and hands back the file an encoder needs.
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Factory, Download, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { hydrationMarker, useIsHydrated } from '@/components/ui/useIsHydrated'
import { createTagBatch, readBatchTags } from '@/app/actions/admin-tags'
import { buildEncoderCsv } from '@/lib/tags/encoder-csv'
import { clampProductionBatchSize, MAX_PRODUCTION_BATCH } from '@/lib/tags/batch'
import { COPY_FEEDBACK_MS } from '@/lib/constants'

interface TagBatchCreatorProps {
  appUrl: string
}

/**
 * Mints a run and produces the encoder file in one go.
 *
 * The two have to happen together: a run whose identifiers were never exported
 * is several hundred rows nobody can write to hardware, and there is no way to
 * recover which ones they were except by reading the batch back.
 */
export function TagBatchCreator({ appUrl }: TagBatchCreatorProps) {
  const router = useRouter()
  const isReady = useIsHydrated()

  const [label, setLabel] = useState('')
  const [note, setNote] = useState('')
  const [count, setCount] = useState('100')
  const [csv, setCsv] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [hasCopied, setHasCopied] = useState(false)
  const [isCreating, startCreating] = useTransition()

  const handleCreate = () => {
    setFormError(null)
    setCsv(null)
    startCreating(async () => {
      const result = await createTagBatch(label, note, clampProductionBatchSize(Number(count)))
      if (!result.ok) {
        setFormError(result.error)
        return
      }

      const tags = await readBatchTags(result.data.batchId)
      setCsv(
        buildEncoderCsv(
          tags.map((tag) => tag.tagId),
          appUrl,
        ),
      )
      setLabel('')
      setNote('')
      router.refresh()
    })
  }

  const handleCopy = async () => {
    if (!csv) return
    await navigator.clipboard.writeText(csv)
    setHasCopied(true)
    setTimeout(() => setHasCopied(false), COPY_FEEDBACK_MS)
  }

  return (
    <section
      className="rounded-card border border-border bg-surface-raised p-4"
      aria-label="New production run"
      {...hydrationMarker(isReady)}
    >
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-text-secondary">
        <Factory size={16} aria-hidden />
        New run
      </h2>

      <div className="mt-4 space-y-3">
        <TextField
          label="Name this run"
          placeholder="March order — 3-puck kits"
          hint="How you will recognise it on an invoice or a box."
          value={label}
          onChange={(event) => setLabel(event.target.value)}
        />

        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="How many tags"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_PRODUCTION_BATCH}
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
          <TextField
            label="Note"
            placeholder="Optional"
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>

        <Button
          variant="primary"
          fullWidth
          icon={<Factory size={16} aria-hidden />}
          onClick={handleCreate}
          disabled={isCreating || label.trim() === ''}
        >
          {isCreating ? 'Making…' : 'Make this run'}
        </Button>
      </div>

      {csv ? (
        <div className="mt-4 space-y-2">
          <p className="flex items-center gap-2 text-sm font-semibold text-success">
            <Download size={16} aria-hidden />
            Encoder file ready
          </p>
          <pre className="max-h-48 overflow-auto rounded-card border border-border-strong bg-surface-sunken p-3 text-xs text-text-secondary">
            {csv}
          </pre>
          <Button
            variant="secondary"
            fullWidth
            icon={hasCopied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            onClick={handleCopy}
          >
            {hasCopied ? 'Copied' : 'Copy encoder file'}
          </Button>
          <p className="text-xs text-text-muted">
            Save this as a .csv and load it into the encoder. It can be read back from the run below
            at any time, so nothing is lost if you close this.
          </p>
        </div>
      ) : null}

      {formError ? (
        <p
          role="alert"
          className="mt-3 rounded-card border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </p>
      ) : null}
    </section>
  )
}

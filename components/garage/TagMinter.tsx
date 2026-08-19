// Gives an owner with blank tags an address to write to them.
'use client'

import { useState, useTransition } from 'react'
import { Nfc, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { hydrationMarker, useIsHydrated } from '@/components/ui/useIsHydrated'
import { mintTagAddresses } from '@/app/actions/tags'
import { clampTagBatchSize, MAX_TAG_BATCH } from '@/lib/tags/batch'
import { COPY_FEEDBACK_MS } from '@/lib/constants'

interface TagMinterProps {
  /** Where a tag points, so the address shown is the real one to write. */
  appUrl: string
}

/**
 * Mints tag addresses for blank hardware.
 *
 * A ready-made tag arrives already written. A blank one is useless until the
 * product hands over an address, and until now the only source was a script —
 * so the instructions for writing a tag ended at "it looks like this".
 */
export function TagMinter({ appUrl }: TagMinterProps) {
  const isReady = useIsHydrated()
  const [requested, setRequested] = useState('1')
  const [addresses, setAddresses] = useState<string[]>([])
  const [formError, setFormError] = useState<string | null>(null)
  const [hasCopied, setHasCopied] = useState(false)
  const [isMinting, startMinting] = useTransition()

  const handleMint = () => {
    setFormError(null)
    startMinting(async () => {
      const result = await mintTagAddresses(clampTagBatchSize(Number(requested)))
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      setAddresses(result.data.tagIds.map((id) => `${appUrl}/t/${id}`))
    })
  }

  const handleCopy = async () => {
    await navigator.clipboard.writeText(addresses.join('\n'))
    setHasCopied(true)
    setTimeout(() => setHasCopied(false), COPY_FEEDBACK_MS)
  }

  return (
    <div className="space-y-3" {...hydrationMarker(isReady)}>
      <div className="flex items-end gap-2">
        <div className="w-28">
          <TextField
            label="How many"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_TAG_BATCH}
            value={requested}
            onChange={(event) => setRequested(event.target.value)}
          />
        </div>
        <Button
          variant="secondary"
          icon={<Nfc size={16} aria-hidden />}
          onClick={handleMint}
          disabled={isMinting}
          className="flex-1"
        >
          {isMinting ? 'Getting…' : 'Get tag addresses'}
        </Button>
      </div>

      {addresses.length > 0 ? (
        <div className="space-y-2">
          <ul className="space-y-1 rounded-card border border-border-strong bg-surface-sunken p-3">
            {addresses.map((address) => (
              <li key={address} className="tabular break-all text-xs text-text-secondary">
                {address}
              </li>
            ))}
          </ul>

          <Button
            variant="secondary"
            fullWidth
            icon={hasCopied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
            onClick={handleCopy}
          >
            {hasCopied ? 'Copied' : addresses.length === 1 ? 'Copy address' : 'Copy all'}
          </Button>

          <p className="text-xs text-text-muted">
            Write one address per tag. Each works only once — a second tag with the same address
            opens the same part.
          </p>
        </div>
      ) : null}

      {formError ? (
        <p
          role="alert"
          className="rounded-card border border-danger/50 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {formError}
        </p>
      ) : null}
    </div>
  )
}

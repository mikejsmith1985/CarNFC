// Owner controls for the shareable passport: off by default, mint, copy, revoke, re-mint.
'use client'

import { useState, useTransition } from 'react'
import { Share2, Copy, Check, ShieldOff } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { ToggleField } from '@/components/ui/Field'
import { mintPassportShare, revokePassportShare } from '@/app/actions/passport'
import { COPY_FEEDBACK_MS } from '@/lib/constants'

interface PassportSharingProps {
  vehicleId: string
  initiallyShared: boolean
  initialIncludeCosts: boolean
}

/**
 * Turns passport sharing on and off for one vehicle.
 *
 * Off by default, always. A service history exposed by a guessable address would
 * leak an owner's location patterns, spending and vehicle identity, so sharing
 * is an explicit act that mints a separate unguessable link (FR-049).
 */
export function PassportSharing({
  vehicleId,
  initiallyShared,
  initialIncludeCosts,
}: PassportSharingProps) {
  const [isShared, setIsShared] = useState(initiallyShared)
  const [includeCosts, setIncludeCosts] = useState(initialIncludeCosts)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [hasCopied, setHasCopied] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [isWorking, startWorking] = useTransition()

  const handleMint = () => {
    setFormError(null)
    startWorking(async () => {
      const result = await mintPassportShare(vehicleId, includeCosts)
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      setShareUrl(result.shareUrl)
      setIsShared(true)
    })
  }

  const handleRevoke = () => {
    setFormError(null)
    startWorking(async () => {
      const result = await revokePassportShare(vehicleId)
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      setShareUrl(null)
      setIsShared(false)
    })
  }

  const handleCopy = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setHasCopied(true)
    setTimeout(() => setHasCopied(false), COPY_FEEDBACK_MS)
  }

  return (
    <section className="rounded-card border border-border bg-surface-raised p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-text-secondary">
        <Share2 size={16} aria-hidden />
        Share service record
      </h2>

      <p className="mt-2 text-sm text-text-muted">
        Sends a buyer a read-only copy of this vehicle&apos;s history. They need no account, and you
        can revoke it at any time.
      </p>

      {!isShared ? (
        <div className="mt-4 space-y-3">
          <ToggleField
            label="Include what you paid"
            hint="Off by default. Costs stay private unless you turn this on."
            checked={includeCosts}
            onChange={setIncludeCosts}
          />
          <Button variant="primary" fullWidth onClick={handleMint} disabled={isWorking}>
            {isWorking ? 'Creating…' : 'Create share link'}
          </Button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          {shareUrl ? (
            <>
              <p className="rounded-card border border-border-strong bg-surface-sunken px-3 py-2 text-xs break-all text-text-secondary">
                {shareUrl}
              </p>
              <Button
                variant="secondary"
                fullWidth
                icon={hasCopied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
                onClick={handleCopy}
              >
                {hasCopied ? 'Copied' : 'Copy link'}
              </Button>
            </>
          ) : (
            // Only the hash is stored, so an existing link cannot be shown again.
            <p className="rounded-card border border-border-strong bg-surface-sunken px-3 py-2 text-sm text-text-secondary">
              Sharing is on. The link was shown once when it was created — create a new one if you
              no longer have it, which revokes the old.
            </p>
          )}

          <Button variant="secondary" fullWidth onClick={handleMint} disabled={isWorking}>
            Create a new link
          </Button>

          <Button
            variant="danger"
            fullWidth
            icon={<ShieldOff size={16} aria-hidden />}
            onClick={handleRevoke}
            disabled={isWorking}
          >
            {isWorking ? 'Revoking…' : 'Stop sharing'}
          </Button>
        </div>
      )}

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

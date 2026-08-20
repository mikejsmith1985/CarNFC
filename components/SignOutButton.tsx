// Sign-out, guarded against discarding entries that have not reached the server yet.
'use client'

import { useState, useTransition } from 'react'
import { LogOut } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Sheet } from '@/components/ui/Sheet'
import { getOutbox } from '@/lib/offline/sync'
import { clearLocalData } from '@/lib/offline/db'
import { signOut } from '@/app/actions/auth'

/**
 * Signs the owner out of this device.
 *
 * Blocks while the outbox is non-empty and requires explicit confirmation
 * before proceeding (FR-047d). Signing out on a phone still holding the only
 * copy of this morning's oil change would destroy it silently, and the whole
 * point of the offline layer is that this cannot happen by accident.
 */
export function SignOutButton() {
  const [pendingCount, setPendingCount] = useState(0)
  const [isConfirming, setIsConfirming] = useState(false)
  const [isWorking, startWorking] = useTransition()

  const handleClick = () => {
    startWorking(async () => {
      const outstanding = await getOutbox().pendingCount()
      if (outstanding > 0) {
        setPendingCount(outstanding)
        setIsConfirming(true)
        return
      }
      await finish()
    })
  }

  const finish = async () => {
    // Clear device-local data before ending the session, so a shared phone
    // retains nothing readable about this owner's vehicles (FR-047c).
    await clearLocalData()
    await signOut()
  }

  return (
    <>
      <Button
        variant="ghost"
        icon={<LogOut size={16} aria-hidden />}
        onClick={handleClick}
        disabled={isWorking}
        className="text-sm"
      >
        Sign out
      </Button>

      <Sheet
        isOpen={isConfirming}
        onClose={() => setIsConfirming(false)}
        title="Entries not yet uploaded"
        footer={
          <div className="space-y-2">
            <Button
              variant="danger"
              size="large"
              fullWidth
              onClick={() => startWorking(finish)}
              disabled={isWorking}
            >
              Sign out and discard them
            </Button>
            <Button variant="secondary" fullWidth onClick={() => setIsConfirming(false)}>
              Stay signed in
            </Button>
          </div>
        }
      >
        <p className="text-sm text-text-secondary">
          {pendingCount} entr{pendingCount === 1 ? 'y is' : 'ies are'} saved on this device and
          haven&apos;t reached the server yet. Signing out will delete{' '}
          {pendingCount === 1 ? 'it' : 'them'} permanently.
        </p>
        <p className="mt-3 text-sm text-text-muted">
          Get back online for a moment first and they&apos;ll upload by themselves.
        </p>
      </Sheet>
    </>
  )
}

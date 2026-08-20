// Shows what is still waiting to upload, and what has stopped trying. Starts the sync engine for the session.
'use client'

import { useEffect, useState } from 'react'
import { CloudUpload, CloudOff, AlertTriangle } from 'lucide-react'
import { startSyncEngine, subscribeToSync, getOutbox } from '@/lib/offline/sync'
import { readStoragePressure } from '@/lib/offline/quota'

/**
 * Surfaces the state of the offline queue.
 *
 * Pending entries are ordinary and stated calmly. Stuck ones are not: FR-042
 * keeps them on the device forever rather than discarding them, which is only
 * honest if the owner can actually see that something needs their attention.
 */
export function SyncIndicator() {
  const [pending, setPending] = useState(0)
  const [stuck, setStuck] = useState(0)
  const [isOnline, setIsOnline] = useState(true)
  const [isStorageAtRisk, setIsStorageAtRisk] = useState(false)

  useEffect(() => {
    const stopEngine = startSyncEngine()
    const unsubscribe = subscribeToSync((summary) => {
      setPending(summary.pending)
      setStuck(summary.stuck)
    })

    void getOutbox()
      .list()
      .then((records) => {
        setPending(records.length)
        setStuck(records.filter((record) => record.state === 'stuck').length)
      })
      .catch(() => setPending(0))

    void readStoragePressure().then((pressure) => setIsStorageAtRisk(pressure.isUnderPressure))

    const updateOnlineState = () => setIsOnline(navigator.onLine)
    updateOnlineState()
    window.addEventListener('online', updateOnlineState)
    window.addEventListener('offline', updateOnlineState)

    return () => {
      unsubscribe()
      stopEngine()
      window.removeEventListener('online', updateOnlineState)
      window.removeEventListener('offline', updateOnlineState)
    }
  }, [])

  if (pending === 0 && isOnline && !isStorageAtRisk) return null

  return (
    <div className="space-y-2 px-4 pt-3">
      {stuck > 0 ? (
        <Banner
          tone="danger"
          icon={<AlertTriangle size={16} aria-hidden />}
          text={`${stuck} entr${stuck === 1 ? 'y' : 'ies'} couldn't be saved to the server. Still kept on this device.`}
        />
      ) : null}

      {pending - stuck > 0 ? (
        <Banner
          tone="muted"
          icon={
            isOnline ? <CloudUpload size={16} aria-hidden /> : <CloudOff size={16} aria-hidden />
          }
          text={
            isOnline
              ? `Uploading ${pending - stuck} entr${pending - stuck === 1 ? 'y' : 'ies'}…`
              : `${pending - stuck} entr${pending - stuck === 1 ? 'y' : 'ies'} saved here. They'll upload when you have signal.`
          }
        />
      ) : null}

      {pending === 0 && !isOnline ? (
        <Banner
          tone="muted"
          icon={<CloudOff size={16} aria-hidden />}
          text="Offline. Anything you log is saved on this device."
        />
      ) : null}

      {isStorageAtRisk ? (
        <Banner
          tone="danger"
          icon={<AlertTriangle size={16} aria-hidden />}
          text="This device is low on storage. Get back online soon so nothing waiting is lost."
        />
      ) : null}
    </div>
  )
}

function Banner({
  tone,
  icon,
  text,
}: {
  tone: 'muted' | 'danger'
  icon: React.ReactNode
  text: string
}) {
  const toneClasses =
    tone === 'danger'
      ? 'border-danger/50 bg-danger/10 text-danger'
      : 'border-border-strong bg-surface-raised text-text-secondary'

  return (
    <p className={`flex items-start gap-2 rounded-card border px-3 py-2 text-sm ${toneClasses}`}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{text}</span>
    </p>
  )
}

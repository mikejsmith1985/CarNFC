// Offline fallback for an address never visited while connected. Never shows the browser's error page (FR-038).
import { WifiOff } from 'lucide-react'

export const metadata = { title: 'Offline · ServiceCard' }

/**
 * Shown when a card was never loaded online and so is not in the local cache.
 *
 * Offline reading is scoped to cards this device has seen before — there is
 * nothing to show for one it has not, and saying so plainly beats a spinner
 * that never resolves.
 */
export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col items-center justify-center px-6 text-center">
      <WifiOff size={40} className="text-text-muted" aria-hidden />
      <h1 className="mt-4 text-xl font-bold">No connection</h1>
      <p className="mt-2 text-sm text-text-secondary">
        This card hasn&apos;t been opened on this device yet, so there&apos;s no offline copy.
      </p>
      <p className="mt-4 text-sm text-text-muted">
        Anything you log while offline is saved on the device and uploads by itself once you have
        signal.
      </p>
    </main>
  )
}

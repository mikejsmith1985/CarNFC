// Bottom-sheet modal primitive. Rises from the bottom so its controls land under the thumb, not at the top of the screen.
'use client'

import { useEffect, useRef, type ReactNode } from 'react'
import { X } from 'lucide-react'

interface SheetProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: ReactNode
  footer?: ReactNode
}

/**
 * A bottom sheet with focus trapping and escape-to-close.
 *
 * Uses the native `<dialog>` element rather than a hand-rolled overlay: the
 * browser already provides the focus trap, the inert background, and the
 * escape handling, and reimplementing those is how accessibility bugs happen.
 */
export function Sheet({ isOpen, onClose, title, children, footer }: SheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return

    if (isOpen && !dialog.open) {
      dialog.showModal()
    } else if (!isOpen && dialog.open) {
      dialog.close()
    }
  }, [isOpen])

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
      aria-label={title}
      className="m-0 mt-auto w-full max-w-xl rounded-t-2xl border border-border bg-surface-raised p-0 text-text-primary backdrop:bg-black/70 sm:mx-auto sm:mb-auto sm:mt-auto sm:rounded-2xl"
    >
      <div className="flex max-h-[88dvh] flex-col">
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-lg font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex min-h-touch min-w-touch items-center justify-center rounded-card text-text-secondary active:bg-surface"
          >
            <X size={24} aria-hidden />
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer ? (
          <footer className="border-t border-border px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {footer}
          </footer>
        ) : null}
      </div>
    </dialog>
  )
}

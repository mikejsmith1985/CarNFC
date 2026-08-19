// Two-step email code sign-in: request a code, then enter it.
'use client'

import { useEffect, useState, useSyncExternalStore, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, KeyRound, Clock } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useHasHydrated } from '@/components/ui/useHasHydrated'
import { TextField } from '@/components/ui/Field'
import { requestSignInCode, verifySignInCode } from '@/app/actions/auth'
import { SIGN_IN_CODE_LENGTH } from '@/lib/validation/auth'
import {
  clearPendingSignIn,
  formatRemaining,
  formatSentAt,
  getPendingSignInSnapshot,
  getServerPendingSignInSnapshot,
  parsePendingSignIn,
  readPendingSignIn,
  rememberPendingSignIn,
  secondsRemaining,
  subscribeToPendingSignIn,
} from '@/lib/auth/pending-sign-in'

interface SignInFormProps {
  /** Where to land after signing in — usually the card that was scanned. */
  nextPath: string
}

/** How often the countdown redraws. */
const TICK_MS = 1000

/**
 * Collects an email address, then the code sent to it.
 *
 * The second step requires leaving the page — the code is in an email — so
 * which step to show is read from device storage rather than held in component
 * state. Without that, the walk to the inbox and back lands on an empty email
 * field, having just been sent a perfectly good code. On a phone the browser
 * tab may be discarded entirely while the mail app is open, so this survives
 * that too.
 *
 * The step is derived, never assigned: sending a code writes the record and the
 * form follows; the record lapsing or being cleared returns the form to the
 * email step on its own. There is no second copy of the truth to fall out of step.
 */
export function SignInForm({ nextPath }: SignInFormProps) {
  const router = useRouter()

  // Read through `useSyncExternalStore` so the first client render matches the
  // server's HTML — the server cannot see this device's storage, so it renders
  // the email step, and React re-renders with the real value once hydrated.
  // Reading storage directly while rendering instead produces a hydration
  // mismatch, and React discards the client tree.
  const rawPending = useSyncExternalStore(
    subscribeToPendingSignIn,
    getPendingSignInSnapshot,
    getServerPendingSignInSnapshot,
  )

  // Bumped once a second purely to redraw the countdown. The value is never
  // read; the re-render it triggers is the point.
  const [, setSecondsTick] = useState(0)

  // The server cannot see this device's storage, so it always sends the email
  // step. Waiting for hydration keeps the first client render identical to that.
  const hasHydrated = useHasHydrated()

  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  // Set only when a code is sent from this screen, so the confirmation appears
  // for the press that caused it rather than on every resumed visit.
  const [justSent, setJustSent] = useState(false)
  const [isPending, startTransition] = useTransition()

  const pending = hasHydrated ? parsePendingSignIn(rawPending) : null
  const isAwaitingCode = pending !== null
  const remainingSeconds = pending ? secondsRemaining(pending) : null

  // Redraw the countdown, and let a lapsed code tidy itself away — clearing the
  // record is what returns the form to the email step.
  useEffect(() => {
    if (!isAwaitingCode) return

    const timer = setInterval(() => {
      if (!readPendingSignIn()) {
        setCode('')
        setFormError('That code expired. Send a new one.')
        return
      }
      setSecondsTick((previousTick) => previousTick + 1)
    }, TICK_MS)

    return () => clearInterval(timer)
  }, [isAwaitingCode])

  const handleRequestCode = () => {
    setFormError(null)
    const requestedEmail = (pending?.email ?? email).trim()
    startTransition(async () => {
      const result = await requestSignInCode(requestedEmail)
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      rememberPendingSignIn(requestedEmail)
      setJustSent(true)
      setCode('')
    })
  }

  const handleVerifyCode = () => {
    setFormError(null)
    startTransition(async () => {
      const result = await verifySignInCode(pending?.email ?? email, code)
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      clearPendingSignIn()
      // Refresh so Server Components pick up the new session cookie before the
      // destination renders, otherwise the card would fetch as a signed-out user.
      router.replace(nextPath)
      router.refresh()
    })
  }

  const handleStartOver = () => {
    clearPendingSignIn()
    setCode('')
    setFormError(null)
  }

  return (
    <div className="space-y-4">
      {!isAwaitingCode ? (
        <>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            hint={`We'll send a ${SIGN_IN_CODE_LENGTH}-digit code. There's no password to remember.`}
          />
          <Button
            variant="primary"
            size="large"
            fullWidth
            icon={<Mail size={18} aria-hidden />}
            onClick={handleRequestCode}
            disabled={isPending || email.trim() === ''}
          >
            {isPending ? 'Sending…' : 'Send code'}
          </Button>
        </>
      ) : (
        <>
          <p className="text-sm text-text-secondary">
            Code sent to <span className="font-semibold text-text-primary">{pending.email}</span> at{' '}
            <span className="font-semibold text-text-primary">
              {formatSentAt(pending.sentAtMs)}
            </span>
          </p>

          {/*
            Three sign-in emails look identical in an inbox and only the newest
            works. Without saying so, the natural response to a rejected code is
            to request another — which retires the one that would have worked.
          */}
          <p className="text-xs text-text-muted">
            Open the newest email. Asking for another code stops the earlier ones working.
          </p>

          <TextField
            label={`${SIGN_IN_CODE_LENGTH}-digit code`}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            autoFocus
            maxLength={SIGN_IN_CODE_LENGTH}
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            className="tabular text-center text-2xl tracking-[0.4em]"
          />

          {remainingSeconds !== null ? (
            <p className="flex items-center gap-1.5 text-xs text-text-muted">
              <Clock size={12} aria-hidden />
              Code valid for{' '}
              <span className="tabular font-semibold">{formatRemaining(remainingSeconds)}</span>
            </p>
          ) : null}

          <Button
            variant="primary"
            size="large"
            fullWidth
            icon={<KeyRound size={18} aria-hidden />}
            onClick={handleVerifyCode}
            disabled={isPending || code.length !== SIGN_IN_CODE_LENGTH}
          >
            {isPending ? 'Verifying…' : 'Sign in'}
          </Button>

          <Button variant="secondary" fullWidth onClick={handleRequestCode} disabled={isPending}>
            {isPending ? 'Sending…' : 'Send a new code'}
          </Button>

          {justSent ? (
            <p role="status" className="text-sm text-success">
              New code sent at {formatSentAt(pending.sentAtMs)}. Any earlier code has stopped
              working.
            </p>
          ) : null}

          <Button variant="ghost" fullWidth onClick={handleStartOver}>
            Use a different email
          </Button>
        </>
      )}

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

// Two-step email code sign-in: request a code, then enter it.
'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, KeyRound } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { TextField } from '@/components/ui/Field'
import { requestSignInCode, verifySignInCode } from '@/app/actions/auth'
import { SIGN_IN_CODE_LENGTH } from '@/lib/validation/auth'

interface SignInFormProps {
  /** Where to land after signing in — usually the card that was scanned. */
  nextPath: string
}

type Step = 'email' | 'code'

/**
 * Collects an email address, then the six-digit code sent to it.
 *
 * Two steps rather than one screen with both fields: the code does not exist
 * until the first step completes, and showing an empty field for it invites
 * people to sit and wait for something that has not been sent yet.
 */
export function SignInForm({ nextPath }: SignInFormProps) {
  const router = useRouter()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [formError, setFormError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const handleRequestCode = () => {
    setFormError(null)
    startTransition(async () => {
      const result = await requestSignInCode(email)
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      setStep('code')
    })
  }

  const handleVerifyCode = () => {
    setFormError(null)
    startTransition(async () => {
      const result = await verifySignInCode(email, code)
      if (!result.ok) {
        setFormError(result.error)
        return
      }
      // Refresh so Server Components pick up the new session cookie before the
      // destination renders, otherwise the card would fetch as a signed-out user.
      router.replace(nextPath)
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      {step === 'email' ? (
        <>
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            inputMode="email"
            placeholder="you@example.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            hint="We'll send a six-digit code. There's no password to remember."
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
            Code sent to <span className="font-semibold text-text-primary">{email}</span>
          </p>
          <TextField
            label={`${SIGN_IN_CODE_LENGTH}-digit code`}
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={SIGN_IN_CODE_LENGTH}
            placeholder="000000"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
            className="tabular text-center text-2xl tracking-[0.4em]"
          />
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
          <Button
            variant="ghost"
            fullWidth
            onClick={() => {
              setStep('email')
              setCode('')
              setFormError(null)
            }}
          >
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

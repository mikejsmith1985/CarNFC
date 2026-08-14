// Server Actions for email one-time-code sign-in and sign-out. There is no password path anywhere in the product.
'use server'

import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { emailSchema, signInCodeSchema, SIGN_IN_CODE_LENGTH } from '@/lib/validation/auth'

export type AuthResult = { ok: true } | { ok: false; error: string }

/**
 * Sends a one-time sign-in code to an email address.
 *
 * No password, by design. There is nothing to recall while lying under a truck,
 * and the emailed code doubles as the recovery path when a phone is replaced —
 * which makes the owner's inbox the account's recovery anchor (FR-047).
 */
export async function requestSignInCode(email: string): Promise<AuthResult> {
  const parsed = emailSchema.safeParse(email.trim())
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Enter a valid email address' }
  }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.auth.signInWithOtp({
    email: parsed.data,
    options: { shouldCreateUser: true },
  })

  if (error) return { ok: false, error: error.message }

  return { ok: true }
}

/**
 * Exchanges the emailed code for a session.
 *
 * On success the session cookie is written by `@supabase/ssr`, and the proxy
 * refreshes it on every subsequent request. That is what makes every scan after
 * this one credential-free (FR-047a).
 */
export async function verifySignInCode(email: string, code: string): Promise<AuthResult> {
  const parsedEmail = emailSchema.safeParse(email.trim())
  const parsedCode = signInCodeSchema.safeParse(code.trim())

  if (!parsedEmail.success) return { ok: false, error: 'Enter a valid email address' }
  if (!parsedCode.success) return { ok: false, error: `The code is ${SIGN_IN_CODE_LENGTH} digits` }

  const supabase = await createServerSupabaseClient()

  const { error } = await supabase.auth.verifyOtp({
    email: parsedEmail.data,
    token: parsedCode.data,
    type: 'email',
  })

  if (error) return { ok: false, error: 'That code is wrong or has expired. Request a new one.' }

  return { ok: true }
}

/**
 * Signs out and returns to the sign-in screen.
 *
 * Clearing device-local caches and guarding against unsynchronized entries is
 * handled by the offline layer (FR-047c, FR-047d); this action ends the session.
 */
export async function signOut(): Promise<never> {
  const supabase = await createServerSupabaseClient()
  await supabase.auth.signOut()
  redirect('/auth/verify')
}

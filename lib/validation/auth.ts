// Validation for email one-time-code sign-in, shared by the form and the Server Action.

import { z } from 'zod'

/** Digits in the emailed sign-in code. Supabase Auth issues six. */
export const SIGN_IN_CODE_LENGTH = 6

export const emailSchema = z.email('Enter a valid email address')

export const signInCodeSchema = z
  .string()
  .regex(new RegExp(`^\\d{${SIGN_IN_CODE_LENGTH}}$`), `The code is ${SIGN_IN_CODE_LENGTH} digits`)

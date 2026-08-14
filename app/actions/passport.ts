// Server Actions for minting and revoking a vehicle's shareable passport link.
'use server'

import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { buildShareUrl, generateShareToken, hashShareToken } from '@/lib/passport/token'

export type MintResult = { ok: true; shareUrl: string } | { ok: false; error: string }

export type PassportActionResult = { ok: true } | { ok: false; error: string }

/**
 * Mints a share link for a vehicle.
 *
 * The raw token is returned exactly once, here, and never stored — only its hash
 * reaches the database. If the owner loses the link they mint a new one; there
 * is no way to recover the old, which is the point.
 *
 * Any live share is revoked first, so a vehicle never has two working links and
 * "revoke" always means what it says.
 */
export async function mintPassportShare(
  vehicleId: string,
  includeCosts: boolean,
): Promise<MintResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to share this vehicle.' }

  const { error: revokeError } = await supabase
    .from('passport_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('vehicle_id', vehicleId)
    .is('revoked_at', null)

  if (revokeError) return { ok: false, error: revokeError.message }

  const token = generateShareToken()

  const { error: insertError } = await supabase.from('passport_shares').insert({
    vehicle_id: vehicleId,
    token_hash: hashShareToken(token),
    include_costs: includeCosts,
  })

  if (insertError) return { ok: false, error: insertError.message }

  revalidatePath('/garage')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? ''
  return { ok: true, shareUrl: buildShareUrl(token, appUrl) }
}

/**
 * Revokes the live share link for a vehicle.
 *
 * The row is retained rather than deleted. A re-minted link creates a new row
 * while the old token still hashes to a revoked one and is refused — which is
 * what makes "never reissued" a guarantee rather than a probability (FR-051).
 */
export async function revokePassportShare(vehicleId: string): Promise<PassportActionResult> {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { ok: false, error: 'Sign in to manage sharing.' }

  const { error } = await supabase
    .from('passport_shares')
    .update({ revoked_at: new Date().toISOString() })
    .eq('vehicle_id', vehicleId)
    .is('revoked_at', null)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/garage')
  return { ok: true }
}

/** Whether a vehicle currently has a live share, for the settings panel. */
export async function readShareState(
  vehicleId: string,
): Promise<{ isShared: boolean; includeCosts: boolean; mintedAt: string | null }> {
  const supabase = await createServerSupabaseClient()

  const { data } = await supabase
    .from('passport_shares')
    .select('include_costs, minted_at')
    .eq('vehicle_id', vehicleId)
    .is('revoked_at', null)
    .maybeSingle()

  if (!data) return { isShared: false, includeCosts: false, mintedAt: null }

  return {
    isShared: true,
    includeCosts: data.include_costs as boolean,
    mintedAt: data.minted_at as string,
  }
}

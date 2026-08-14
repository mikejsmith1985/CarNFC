// Root entry point. Nobody should arrive here in normal use — the product is entered by tapping a tag.
import { redirect } from 'next/navigation'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/**
 * Sends whoever lands on the bare domain somewhere useful.
 *
 * Reached by typing the address or opening the installed app from a home
 * screen, rather than by scanning. A signed-in owner goes to their garage; a
 * stranger goes to sign in.
 */
export default async function RootPage() {
  const supabase = await createServerSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  redirect(user ? '/garage' : '/auth/verify')
}

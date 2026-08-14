// Mints unbound tag identifiers for physical manufacture: writes rows to the database and a CSV for the tag encoder.
//
// Without this, nothing ever creates a `tags` row and every physical tag would
// resolve as `unknown` forever. Writing tags from inside the app is out of
// scope; generating the identifiers they carry is not.

import { createClient } from '@supabase/supabase-js'
import { writeFileSync } from 'node:fs'
import { generateTagBatch } from '../lib/tags/generate'

async function main() {
  const requestedCount = Number(process.argv[2] ?? '100')
  const outputPath = process.argv[3] ?? `tags-${requestedCount}.csv`

  if (!Number.isInteger(requestedCount) || requestedCount < 1) {
    throw new Error('Usage: pnpm tags:mint <count> [outputPath]')
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. Outside local development these come from the Forge Vault, never from a file.',
    )
  }

  // Inserting unbound tags is the one legitimate service-role operation in the
  // product: nobody owns these rows yet, so no RLS policy could permit it.
  const supabase = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  const identifiers = generateTagBatch(requestedCount)

  const { error } = await supabase.from('tags').insert(identifiers.map((id) => ({ id })))
  if (error) throw new Error(`Failed to insert tags: ${error.message}`)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.servicecard.example'
  const csv = ['tag_id,url', ...identifiers.map((id) => `${id},${appUrl}/t/${id}`)].join('\n')
  writeFileSync(outputPath, csv, 'utf8')

  console.log(`Minted ${identifiers.length} tags. Encoder CSV written to ${outputPath}`)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exit(1)
})

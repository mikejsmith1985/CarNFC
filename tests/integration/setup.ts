// Per-file connection to the shared PostgreSQL container, plus the role helpers the specs use.
//
// Article V: integration tests use real infrastructure, never mocked drivers.
// RLS is the security boundary behind FR-048 and it can only be proven against
// actual PostgreSQL evaluating actual policies.

import { Client } from 'pg'
import { afterAll, beforeAll, inject } from 'vitest'

let adminClient: Client | null = null

/** A superuser client. Bypasses RLS, so use it only for fixtures and structural assertions. */
export function admin(): Client {
  if (!adminClient) throw new Error('Database not ready')
  return adminClient
}

/**
 * Runs a callback as a specific signed-in owner.
 *
 * Sets the role and the JWT claims Supabase would set, inside a transaction that
 * is always rolled back — so a test asserting that RLS blocks something cannot
 * leave residue for the next test.
 */
export async function asUser<ResultType>(
  userId: string | null,
  work: (client: Client) => Promise<ResultType>,
): Promise<ResultType> {
  const client = admin()
  await client.query('begin')
  try {
    await client.query(`set local role ${userId ? 'authenticated' : 'anon'}`)
    await client.query('select set_config($1, $2, true)', [
      'request.jwt.claims',
      userId ? JSON.stringify({ sub: userId, role: 'authenticated' }) : JSON.stringify({}),
    ])
    return await work(client)
  } finally {
    await client.query('rollback')
  }
}

/**
 * Runs a callback as a signed-in owner, keeping whatever it writes.
 *
 * The rollback in `asUser` is right for read and deny assertions — it stops a
 * blocked write leaving residue. It is wrong for testing a function whose whole
 * job is to write, because the rollback discards exactly what the test came to
 * check. Still runs under the RLS-bound `authenticated` role.
 */
export async function asUserCommitted<ResultType>(
  userId: string,
  work: (client: Client) => Promise<ResultType>,
): Promise<ResultType> {
  const client = admin()
  await client.query('set role authenticated')
  await client.query('select set_config($1, $2, false)', [
    'request.jwt.claims',
    JSON.stringify({ sub: userId, role: 'authenticated' }),
  ])
  try {
    return await work(client)
  } finally {
    await client.query('reset role')
    await client.query("select set_config('request.jwt.claims', '', false)")
  }
}

/** Creates an auth user and its account row, returning the id. */
export async function createOwner(email: string): Promise<string> {
  const { rows } = await admin().query<{ id: string }>(
    'insert into auth.users (email) values ($1) returning id',
    [email],
  )
  const ownerId = rows[0]!.id
  await admin().query('insert into public.accounts (id) values ($1) on conflict do nothing', [
    ownerId,
  ])
  return ownerId
}

/** Removes all test data between suites, leaving the schema and seeded library intact. */
export async function truncateAll(): Promise<void> {
  await admin().query(`
    truncate table
      public.passport_shares, public.reminders, public.attachments,
      public.spec_overrides, public.energy_entry_revisions, public.energy_entries,
      public.service_entry_revisions, public.service_entries,
      public.component_specs, public.tags, public.components, public.vehicles,
      public.accounts
    restart identity cascade;
  `)
  await admin().query('delete from auth.users')
}

beforeAll(async () => {
  // The container and its schema are prepared once, in global-setup.ts.
  adminClient = new Client({ connectionString: inject('connectionUri') })
  await adminClient.connect()
}, 60_000)

afterAll(async () => {
  await adminClient?.end()
  adminClient = null
})

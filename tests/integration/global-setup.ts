// Boots one PostgreSQL container for the whole integration run, and applies the real migrations to it once.
//
// Previously each test file started its own container. That was slow and, worse,
// flaky — nine simultaneous Postgres instances exhausted connections and threw
// ECONNRESET mid-suite, which reads exactly like a real failure and is not one.
// One container, applied once, shared by every file.

import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Client } from 'pg'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { TestProject } from 'vitest/node'

const REPOSITORY_ROOT = process.cwd()
const MIGRATIONS_DIR = join(REPOSITORY_ROOT, 'supabase', 'migrations')
const BOOTSTRAP_PATH = join(REPOSITORY_ROOT, 'tests', 'integration', 'bootstrap.sql')
const SEED_PATH = join(REPOSITORY_ROOT, 'supabase', 'seed.sql')

let container: StartedPostgreSqlContainer | null = null

export async function setup(project: TestProject): Promise<void> {
  container = await new PostgreSqlContainer('postgres:15-alpine')
    .withDatabase('servicecard_test')
    .start()

  const connectionUri = container.getConnectionUri()
  const client = new Client({ connectionString: connectionUri })
  await client.connect()

  try {
    // Supabase platform surface first, then our own migrations in filename order.
    await client.query(readFileSync(BOOTSTRAP_PATH, 'utf8'))

    for (const migration of readdirSync(MIGRATIONS_DIR)
      .filter((name) => name.endsWith('.sql'))
      .sort()) {
      try {
        await client.query(readFileSync(join(MIGRATIONS_DIR, migration), 'utf8'))
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        throw new Error(`Migration ${migration} failed: ${message}`)
      }
    }

    await client.query(readFileSync(SEED_PATH, 'utf8'))
  } finally {
    await client.end()
  }

  project.provide('connectionUri', connectionUri)
}

export async function teardown(): Promise<void> {
  await container?.stop()
}

declare module 'vitest' {
  interface ProvidedContext {
    connectionUri: string
  }
}

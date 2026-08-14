// Asserts the grant surface directly, because Row Level Security is meaningless if no role may touch the table at all.

import { describe, expect, it } from 'vitest'
import { admin } from './setup'

/** Reads the DML privileges one role holds on one table. */
async function privilegesFor(role: string, table: string): Promise<string[]> {
  const { rows } = await admin().query<{ privilege_type: string }>(
    `select privilege_type from information_schema.role_table_grants
     where table_schema = 'public' and table_name = $1 and grantee = $2
       and privilege_type in ('SELECT','INSERT','UPDATE','DELETE')
     order by privilege_type`,
    [table, role],
  )
  return rows.map((row) => row.privilege_type)
}

const OWNER_TABLES = [
  'accounts',
  'vehicles',
  'components',
  'component_specs',
  'tags',
  'service_entries',
  'energy_entries',
  'spec_overrides',
  'attachments',
  'reminders',
  'passport_shares',
]

describe('authenticated privileges', () => {
  for (const table of OWNER_TABLES) {
    it(`can read and write ${table}`, async () => {
      // Without this, RLS never even gets consulted — Postgres refuses first.
      expect(await privilegesFor('authenticated', table)).toEqual([
        'DELETE',
        'INSERT',
        'SELECT',
        'UPDATE',
      ])
    })
  }

  it('can read the component library but not write it', async () => {
    expect(await privilegesFor('authenticated', 'component_templates')).toEqual(['SELECT'])
  })

  for (const table of ['service_entry_revisions', 'energy_entry_revisions']) {
    it(`can append to ${table} but never rewrite it`, async () => {
      expect(await privilegesFor('authenticated', table)).toEqual(['INSERT', 'SELECT'])
    })
  }
})

describe('service_role privileges', () => {
  it('can write vehicles, which the seed and minting scripts need', async () => {
    expect(await privilegesFor('service_role', 'vehicles')).toContain('INSERT')
  })

  for (const table of ['service_entry_revisions', 'energy_entry_revisions']) {
    it(`cannot rewrite ${table}, despite bypassing RLS`, async () => {
      const privileges = await privilegesFor('service_role', table)
      // The only guard against a server-side bug erasing recorded history.
      expect(privileges).not.toContain('UPDATE')
      expect(privileges).not.toContain('DELETE')
    })
  }
})

describe('anon privileges', () => {
  for (const table of [...OWNER_TABLES, 'service_entry_revisions', 'component_templates']) {
    it(`holds nothing on ${table}`, async () => {
      // Both guest paths are SECURITY DEFINER functions, so a leaked anon key
      // reaches no table at all.
      expect(await privilegesFor('anon', table)).toEqual([])
    })
  }
})

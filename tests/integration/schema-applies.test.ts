// Proves the migrations actually run, and that the structural guarantees the design depends on are really in the database.

import { describe, expect, it } from 'vitest'
import { admin } from './setup'

describe('schema applies', () => {
  it('creates every table the data model defines', async () => {
    const { rows } = await admin().query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE'
       order by table_name`,
    )
    const tables = rows.map((row) => row.table_name)

    expect(tables).toEqual([
      'accounts',
      'attachments',
      'component_specs',
      'component_templates',
      'components',
      'energy_entries',
      'energy_entry_revisions',
      'passport_shares',
      'reminders',
      'service_entries',
      'service_entry_revisions',
      'spec_overrides',
      'tag_batches',
      'tags',
      'vehicles',
    ])
  })

  it('creates the three views', async () => {
    const { rows } = await admin().query<{ table_name: string }>(
      `select table_name from information_schema.views
       where table_schema = 'public' order by table_name`,
    )
    expect(rows.map((row) => row.table_name)).toEqual([
      'v_component_effective_specs',
      'v_current_energy_revisions',
      'v_current_service_revisions',
    ])
  })

  it('runs its views as the invoker, so they cannot bypass RLS', async () => {
    // A view without security_invoker runs as its owner and silently ignores the
    // querying user's policies. That would turn every view into a data leak.
    const { rows } = await admin().query<{ relname: string; options: string[] | null }>(
      `select c.relname, c.reloptions as options
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'v'`,
    )

    for (const view of rows) {
      expect(view.options ?? []).toContain('security_invoker=true')
    }
  })

  it('creates the five RPCs', async () => {
    const { rows } = await admin().query<{ proname: string }>(
      `select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public'
         and p.proname in ('get_component_card','resolve_tag','get_public_passport',
                           'claim_tag','recompute_component_derived')
       order by p.proname`,
    )
    expect(rows.map((row) => row.proname)).toEqual([
      'claim_tag',
      'get_component_card',
      'get_public_passport',
      'recompute_component_derived',
      'resolve_tag',
    ])
  })

  it('pins search_path on both SECURITY DEFINER guest paths', async () => {
    // Without a pinned search_path, a definer function can be tricked into
    // resolving to an attacker-controlled object.
    const { rows } = await admin().query<{ proname: string; config: string[] | null }>(
      `select p.proname, p.proconfig as config
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef
         and p.proname in ('resolve_tag','get_public_passport')`,
    )

    expect(rows).toHaveLength(2)
    for (const routine of rows) {
      // Postgres records an empty search_path as `search_path=""`.
      expect(routine.config ?? []).toContain('search_path=""')
    }
  })

  it('enables row level security on every table', async () => {
    const { rows } = await admin().query<{ relname: string; relrowsecurity: boolean }>(
      `select c.relname, c.relrowsecurity
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'`,
    )
    const unprotected = rows.filter((row) => !row.relrowsecurity).map((row) => row.relname)
    expect(unprotected).toEqual([])
  })

  it('seeds the component template library', async () => {
    const { rows } = await admin().query<{ count: string }>(
      'select count(*)::text as count from public.component_templates',
    )
    expect(Number(rows[0]!.count)).toBeGreaterThanOrEqual(10)
  })

  it('marks the fuel and charge templates as energy ports with a mode', async () => {
    const { rows } = await admin().query<{ key: string; energy_mode_hint: string }>(
      `select key, energy_mode_hint from public.component_templates
       where is_energy_port order by key`,
    )
    expect(rows).toEqual([
      { key: 'charge-port', energy_mode_hint: 'charge' },
      { key: 'fuel-door', energy_mode_hint: 'fuel' },
    ])
  })
})

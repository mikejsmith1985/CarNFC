-- Grants table privileges explicitly, because relying on Supabase's ambient default privileges left every table unreachable.
--
-- Found by running the real local stack: `permission denied for table vehicles`.
--
-- Row Level Security decides WHICH ROWS a role may touch. It does not grant the
-- privilege to touch the table at all — that is a separate GRANT, and without
-- it Postgres refuses the statement before any policy is consulted. The schema
-- had perfect policies and no privileges, so the application was dead on
-- arrival: every query denied for every role.
--
-- The privileges were assumed to arrive from Supabase's default-privilege
-- configuration, which grants ALL on public tables to anon, authenticated and
-- service_role. Those defaults are attached to a specific creating role, and
-- tables created by the migration role do not inherit them. Nothing warned.
--
-- The integration harness masked this by granting ALL up front, so it was more
-- permissive than production and the suite passed against a schema that could
-- not work. tests/integration/bootstrap.sql no longer does that, and
-- tests/integration/table-grants.test.ts now asserts this grant surface
-- directly.
--
-- Privileges are enumerated per table rather than granted wholesale, so adding
-- a table is a deliberate decision about who may reach it.

-- --- authenticated: the owner's own data, governed by RLS ---------------------

grant select, insert, update, delete on
  public.accounts,
  public.vehicles,
  public.components,
  public.component_specs,
  public.tags,
  public.service_entries,
  public.energy_entries,
  public.spec_overrides,
  public.attachments,
  public.reminders,
  public.passport_shares
to authenticated;

-- Revisions are append-only. SELECT and INSERT, never UPDATE or DELETE, so
-- immutability holds at the privilege layer as well as the policy layer.
grant select, insert on
  public.service_entry_revisions,
  public.energy_entry_revisions
to authenticated;

-- The component library is reference data: readable, never writable.
grant select on public.component_templates to authenticated;

-- --- service_role: server-side jobs, bypassing RLS ----------------------------
-- Used by tag minting, the demo seed, and passport attachment signing.

grant select, insert, update, delete on
  public.accounts,
  public.vehicles,
  public.components,
  public.component_specs,
  public.component_templates,
  public.tags,
  public.service_entries,
  public.energy_entries,
  public.spec_overrides,
  public.attachments,
  public.reminders,
  public.passport_shares
to service_role;

-- service_role holds BYPASSRLS, so this is the only thing standing between a
-- server-side bug and rewritten history.
grant select, insert on
  public.service_entry_revisions,
  public.energy_entry_revisions
to service_role;

-- --- anon: nothing --------------------------------------------------------
-- Deliberately absent. Both guest paths are SECURITY DEFINER functions that
-- validate their own input, so a leaked anon key reaches no table at all.

revoke all on all tables in schema public from anon;
grant execute on function public.resolve_tag(text)         to anon;
grant execute on function public.get_public_passport(text) to anon;

-- --- views --------------------------------------------------------------------
-- A view is its own object and needs its own grant. Missing these produced
-- "permission denied for view v_current_service_revisions" even though every
-- underlying table was readable.

grant select on
  public.v_current_service_revisions,
  public.v_current_energy_revisions,
  public.v_component_effective_specs
to authenticated, service_role;

-- --- function execution -------------------------------------------------------
-- Postgres grants EXECUTE to PUBLIC by default, so anon could invoke the
-- owner-facing RPCs. RLS meant they returned nothing, but unnecessary reachable
-- surface on a security boundary is worth closing: revoke from PUBLIC, then
-- grant only where intended.

revoke execute on function public.get_component_card(text, text, int)        from public;
revoke execute on function public.claim_tag(text, uuid, text, text, text)    from public;
revoke execute on function public.recompute_component_derived(uuid)          from public;
revoke execute on function public.resolve_tag(text)                          from public;
revoke execute on function public.get_public_passport(text)                  from public;

grant execute on function public.get_component_card(text, text, int)         to authenticated;
grant execute on function public.claim_tag(text, uuid, text, text, text)     to authenticated;
grant execute on function public.recompute_component_derived(uuid)           to authenticated;

-- The two guest doors, and only these, are reachable without a session.
grant execute on function public.resolve_tag(text)                           to anon, authenticated;
grant execute on function public.get_public_passport(text)                   to anon, authenticated;

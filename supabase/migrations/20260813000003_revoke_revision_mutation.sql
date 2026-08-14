-- Revokes UPDATE and DELETE on the revision tables, so append-only holds even for roles that bypass Row Level Security.
--
-- Found by tests/integration/rls-ownership.test.ts.
--
-- RLS alone was not enough. Supabase's default privileges grant ALL on public
-- tables to anon, authenticated and service_role. For the first two that is
-- harmless — there is no UPDATE or DELETE policy on either revision table, so
-- RLS refuses the statement regardless of the table grant.
--
-- service_role is the problem: it holds BYPASSRLS. Without this revoke, any
-- server-side code path holding the service key could rewrite or erase a
-- recorded revision, which is precisely what the append-only model exists to
-- make impossible. A buyer reading a shared passport is entitled to a record
-- that cannot be quietly altered, and "we don't write that query" is a
-- convention, not a guarantee.
--
-- After this, immutability is enforced twice over: by the absence of a policy,
-- and by the absence of the privilege itself.

revoke update, delete on public.service_entry_revisions from anon, authenticated, service_role;
revoke update, delete on public.energy_entry_revisions  from anon, authenticated, service_role;

-- Future tables inherit the same default grants, so re-revoking is part of any
-- migration that adds another append-only table.
alter default privileges in schema public revoke update, delete on tables from service_role;

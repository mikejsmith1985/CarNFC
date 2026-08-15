-- Makes an unclaimed tag visible to the person claiming it, and gives the energy view the vehicle it belongs to.
--
-- Both found by running the Cypress suite against the real stack.

-- ── 1. Unclaimed tags were invisible to everyone ─────────────────────────────
--
-- The policy on `tags` was `claimed_by = auth.uid()`. An unclaimed tag has
-- claimed_by NULL, so it matched nobody — including the owner standing in front
-- of the vehicle trying to claim it. `claim_tag` is SECURITY INVOKER, so its
-- own lookup was filtered out too and it raised `tag_not_found` every time.
-- The whole onboarding path could never complete.
--
-- Reading an unclaimed tag discloses nothing: the row carries its own id and
-- four nulls, and the id is already in the hand of whoever scanned it. What
-- must stay protected is a *claimed* tag, which still resolves only for its
-- owner.

drop policy if exists tags_owner on public.tags;

create policy tags_owner_all on public.tags
  for all to authenticated
  using (claimed_by = (select auth.uid()))
  with check (claimed_by = (select auth.uid()));

-- An unbound tag is readable by any signed-in owner, so it can be claimed.
create policy tags_unclaimed_readable on public.tags
  for select to authenticated
  using (vehicle_id is null);

-- Claiming is the moment a tag becomes owned, so the update has to be able to
-- see the row it is transitioning out of the unclaimed state.
create policy tags_claim_unclaimed on public.tags
  for update to authenticated
  using (vehicle_id is null)
  with check (claimed_by = (select auth.uid()));

-- ── 2. The energy view could not be filtered by vehicle ──────────────────────
--
-- `v_current_energy_revisions` exposed entry_id but not vehicle_id, so the card
-- tried to reach the vehicle through a PostgREST embed on a view. Views carry
-- no declared relationships, so the embed returned nothing, the previous
-- odometer was always null, and the energy logger could never compute economy —
-- MPG stayed blank, which is the entire purpose of a fuel-door tag.

drop view if exists public.v_current_energy_revisions;

create view public.v_current_energy_revisions
with (security_invoker = true) as
with latest as (
  select distinct on (entry_id) *
  from public.energy_entry_revisions
  order by entry_id, server_received_at desc, id desc
),
revision_counts as (
  select entry_id, count(*) as revision_count
  from public.energy_entry_revisions
  group by entry_id
)
select
  latest.*,
  entries.vehicle_id,
  revision_counts.revision_count,
  (revision_counts.revision_count > 1) as is_edited
from latest
join revision_counts on revision_counts.entry_id = latest.entry_id
join public.energy_entries entries on entries.id = latest.entry_id
where not latest.is_tombstone;

grant select on public.v_current_energy_revisions to authenticated, service_role;

-- Initial ServiceCard schema. Generated from lib/supabase/schema.sql, which is the readable consolidated reference.
-- Subsequent changes get their own timestamped migration via: pnpm dlx supabase migration new <name>
--
--   1. Entries are append-only. An edit writes a superseding revision and a
--      delete writes a tombstone. No role holds UPDATE or DELETE on either
--      revision table, so immutability is a privilege boundary rather than a
--      convention someone can forget.
--
--   2. Ordering never trusts a device clock. Every precedence decision reads
--      server_received_at. The specification explicitly assumes a phone's clock
--      may be wrong, so client_created_at is retained for display only.

set check_function_bodies = off;

-- =============================================================================
-- 1. ENUMERATED TYPES
-- =============================================================================

create type public.power_source     as enum ('gasoline', 'electric', 'both');
create type public.log_category     as enum ('maintenance', 'repair', 'replace', 'upgrade');
create type public.energy_mode      as enum ('fuel', 'charge');
create type public.charge_location  as enum ('home', 'work', 'public_fast');
create type public.spec_kind        as enum ('torque', 'capacity', 'fluid', 'tool', 'part_number', 'interval');
create type public.spec_origin      as enum ('factory', 'override');
create type public.reminder_kind    as enum ('recheck', 'next_due');
create type public.attachment_state as enum ('pending', 'uploaded', 'failed');

-- =============================================================================
-- 2. IDENTITY
-- =============================================================================

-- Email lives in auth.users and is deliberately not duplicated here: it is the
-- account recovery anchor and belongs to exactly one system of record.
create table public.accounts (
  id           uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  created_at   timestamptz not null default now()
);

-- =============================================================================
-- 3. VEHICLES AND COMPONENTS
-- =============================================================================

create table public.vehicles (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null references public.accounts (id) on delete cascade,
  slug             text not null,
  year             int check (year between 1900 and 2100),
  make             text,
  model            text,
  trim             text,
  nickname         text,
  vin              text,
  power_source     public.power_source not null,
  current_odometer int not null default 0 check (current_odometer >= 0),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  -- Slugs are unique per owner, not globally: two owners may both have "raptor".
  -- Address resolution is always scoped by the authenticated owner.
  constraint vehicles_owner_slug_unique unique (owner_id, slug)
);

-- Seeded library of common component types. Specs are COPIED from a template at
-- claim time rather than referenced live, so a later library correction never
-- silently rewrites what an owner recorded about their own vehicle.
create table public.component_templates (
  key                    text primary key,
  display_name           text not null,
  default_specs          jsonb not null default '[]'::jsonb,
  default_interval_miles int,
  default_interval_days  int,
  is_energy_port         boolean not null default false,
  energy_mode_hint       public.energy_mode,
  sort_order             int not null default 0
);

create table public.components (
  id                     uuid primary key default gen_random_uuid(),
  vehicle_id             uuid not null references public.vehicles (id) on delete cascade,
  slug                   text not null,
  display_name           text not null,
  template_key           text references public.component_templates (key) on delete set null,
  is_energy_port         boolean not null default false,
  energy_mode_hint       public.energy_mode,
  service_interval_miles int,
  service_interval_days  int,
  created_at             timestamptz not null default now(),
  constraint components_vehicle_slug_unique unique (vehicle_id, slug),
  -- An energy port must declare which logger it opens, or the tap has nowhere to go.
  constraint components_energy_port_has_mode
    check (not is_energy_port or energy_mode_hint is not null)
);

create table public.component_specs (
  id           uuid primary key default gen_random_uuid(),
  component_id uuid not null references public.components (id) on delete cascade,
  spec_key     text not null,
  kind         public.spec_kind not null,
  label        text not null,
  -- Text, because specs span 24, 75W-90, and 3/8" square.
  value        text not null,
  unit         text,
  sort_order   int not null default 0,
  constraint component_specs_key_unique unique (component_id, spec_key),
  -- Units are enforced by the database, not by convention (FR-055).
  constraint component_specs_numeric_kinds_have_unit
    check (kind not in ('torque', 'capacity', 'interval') or unit is not null)
);

-- =============================================================================
-- 4. TAGS
-- =============================================================================

-- id is 128 bits of CSPRNG rendered base32url, fixed at manufacture. It carries
-- no vehicle meaning of its own, which is what lets a stock tag ship uncustomized
-- and be re-bound if it is peeled off and moved to another component.
create table public.tags (
  id           text primary key,
  vehicle_id   uuid references public.vehicles (id) on delete set null,
  component_id uuid references public.components (id) on delete set null,
  claimed_by   uuid references public.accounts (id) on delete set null,
  claimed_at   timestamptz,
  created_at   timestamptz not null default now(),
  -- Bound to both or to neither. A half-bound tag has no meaning.
  constraint tags_binding_is_complete
    check ((vehicle_id is null) = (component_id is null))
);

-- =============================================================================
-- 5. SERVICE ENTRIES — IDENTITY PLUS APPEND-ONLY REVISIONS
-- =============================================================================

create table public.service_entries (
  id           uuid primary key,          -- client-generated UUIDv7
  component_id uuid not null references public.components (id) on delete cascade,
  created_by   uuid not null references public.accounts (id) on delete cascade,
  created_at   timestamptz not null default now()
);

create table public.service_entry_revisions (
  id                     uuid primary key,  -- client-generated UUIDv7; the exactly-once key
  entry_id               uuid not null references public.service_entries (id) on delete cascade,
  supersedes_revision_id uuid references public.service_entry_revisions (id) on delete set null,
  is_tombstone           boolean not null default false,
  author_id              uuid not null references public.accounts (id) on delete cascade,

  -- Untrusted. Display and single-device FIFO ordering only.
  client_created_at      timestamptz not null,
  -- The only ordering authority anywhere in this schema.
  server_received_at     timestamptz not null default now(),

  category               public.log_category,
  performed_on           date,
  odometer               int check (odometer >= 0),
  notes                  text,

  -- Maintenance (FR-019)
  fluid_type             text,
  quantity               numeric(10, 3),
  quantity_unit          text,
  filter_part_number     text,
  applied_torque         text,
  next_interval_miles    int,
  next_interval_days     int,

  -- Repair (FR-020)
  symptom                text,
  diagnosis              text,
  action_taken           text,
  recheck_miles          int,
  recheck_days           int,

  -- Replace (FR-021)
  old_part_number        text,
  new_part_number        text,
  brand                  text,
  supplier               text,
  cost                   numeric(10, 2),
  warranty_expires_on    date,

  -- Upgrade (FR-022)
  upgrade_brand          text,
  product_name           text,
  install_notes          text,
  reference_url          text,

  -- A tombstone records the fact of deletion and nothing else.
  constraint service_revision_tombstone_is_empty
    check (not is_tombstone or (category is null and odometer is null)),

  -- A non-tombstone revision must carry the fields every category shares.
  constraint service_revision_has_required_fields
    check (is_tombstone or (category is not null and performed_on is not null and odometer is not null)),

  -- Every category-specific column is NULL unless its own category is selected.
  -- The database refuses a Repair that carries a warranty date (FR-017).
  constraint service_revision_category_fields_exclusive
    check (is_tombstone or case category
      when 'maintenance' then
        symptom is null and diagnosis is null and action_taken is null
        and recheck_miles is null and recheck_days is null
        and old_part_number is null and new_part_number is null and warranty_expires_on is null
        and upgrade_brand is null and product_name is null and install_notes is null
      when 'repair' then
        fluid_type is null and quantity is null and filter_part_number is null
        and next_interval_miles is null and next_interval_days is null
        and old_part_number is null and new_part_number is null and warranty_expires_on is null
        and upgrade_brand is null and product_name is null and install_notes is null
      when 'replace' then
        fluid_type is null and quantity is null and filter_part_number is null
        and next_interval_miles is null and next_interval_days is null
        and symptom is null and diagnosis is null and action_taken is null
        and recheck_miles is null and recheck_days is null
        and upgrade_brand is null and product_name is null and install_notes is null
      when 'upgrade' then
        fluid_type is null and quantity is null and filter_part_number is null
        and next_interval_miles is null and next_interval_days is null
        and symptom is null and diagnosis is null and action_taken is null
        and recheck_miles is null and recheck_days is null
        and old_part_number is null and new_part_number is null and warranty_expires_on is null
    end)
);

-- Zero or more per upgrade revision. component_id is denormalized so the
-- effective-spec view does not have to walk back through the entry.
create table public.spec_overrides (
  id                uuid primary key default gen_random_uuid(),
  revision_id       uuid not null references public.service_entry_revisions (id) on delete cascade,
  component_id      uuid not null references public.components (id) on delete cascade,
  spec_key          text not null,
  kind              public.spec_kind not null,
  label             text not null,
  new_value         text not null,
  unit              text,
  superseded_value  text
);

-- =============================================================================
-- 6. ENERGY ENTRIES
-- =============================================================================

-- Vehicle-scoped, not component-scoped, so a plug-in hybrid's fuel and charge
-- sessions interleave on one continuous odometer axis (FR-037).
create table public.energy_entries (
  id         uuid primary key,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  created_by uuid not null references public.accounts (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table public.energy_entry_revisions (
  id                     uuid primary key,
  entry_id               uuid not null references public.energy_entries (id) on delete cascade,
  supersedes_revision_id uuid references public.energy_entry_revisions (id) on delete set null,
  is_tombstone           boolean not null default false,
  author_id              uuid not null references public.accounts (id) on delete cascade,
  client_created_at      timestamptz not null,
  server_received_at     timestamptz not null default now(),

  mode                   public.energy_mode,
  occurred_at            timestamptz,
  odometer               int check (odometer >= 0),
  notes                  text,

  -- Fuel (FR-030)
  volume_gallons         numeric(8, 3) check (volume_gallons is null or volume_gallons > 0),
  price_per_gallon       numeric(8, 3),
  total_cost             numeric(10, 2),
  fuel_grade             text,
  is_full_fill           boolean,
  missed_fill_before     boolean not null default false,

  -- Charge (FR-034)
  soc_start_pct          numeric(5, 2) check (soc_start_pct is null or soc_start_pct between 0 and 100),
  soc_end_pct            numeric(5, 2) check (soc_end_pct   is null or soc_end_pct   between 0 and 100),
  energy_kwh             numeric(8, 3) check (energy_kwh is null or energy_kwh > 0),
  charge_location        public.charge_location,
  location_label         text,
  session_cost           numeric(10, 2),

  constraint energy_revision_tombstone_is_empty
    check (not is_tombstone or (mode is null and odometer is null)),

  constraint energy_revision_has_required_fields
    check (is_tombstone or (mode is not null and occurred_at is not null and odometer is not null)),

  -- Charging cannot end with less charge than it started (FR-036).
  constraint energy_revision_soc_not_reversed
    check (is_tombstone or mode <> 'charge' or soc_end_pct >= soc_start_pct),

  -- Fuel and charge columns are mutually exclusive by mode.
  constraint energy_revision_mode_fields_exclusive
    check (is_tombstone or case mode
      when 'fuel' then
        soc_start_pct is null and soc_end_pct is null and energy_kwh is null
        and charge_location is null and session_cost is null
      when 'charge' then
        volume_gallons is null and price_per_gallon is null and total_cost is null
        and fuel_grade is null and is_full_fill is null
    end),

  constraint energy_revision_fuel_requires_volume
    check (is_tombstone or mode <> 'fuel' or volume_gallons is not null),

  constraint energy_revision_charge_requires_energy
    check (is_tombstone or mode <> 'charge' or energy_kwh is not null)
);

-- No derived metric is stored. MPG, mi/kWh, Wh/mi and cost per mile are computed
-- by pure functions in lib/calc/, so correcting a formula re-derives all history
-- rather than requiring a data migration.

-- =============================================================================
-- 7. ATTACHMENTS
-- =============================================================================

create table public.attachments (
  id                uuid primary key,
  revision_id       uuid not null references public.service_entry_revisions (id) on delete cascade,
  -- {owner_id}/{vehicle_id}/{attachment_id} — the owner prefix drives the Storage policy.
  storage_path      text not null,
  original_filename text not null,
  mime_type         text not null,
  byte_size         int not null,
  state             public.attachment_state not null default 'pending',
  created_at        timestamptz not null default now(),
  constraint attachments_mime_type_allowed
    check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf')),
  constraint attachments_size_within_cap
    check (byte_size > 0 and byte_size <= 10485760)
);

-- =============================================================================
-- 8. REMINDERS
-- =============================================================================

create table public.reminders (
  id                 uuid primary key default gen_random_uuid(),
  component_id       uuid not null references public.components (id) on delete cascade,
  source_revision_id uuid references public.service_entry_revisions (id) on delete cascade,
  kind               public.reminder_kind not null,
  due_odometer       int,
  due_on             date,
  completed_at       timestamptz,
  created_at         timestamptz not null default now(),
  -- A reminder with neither trigger can never fire.
  constraint reminders_has_a_trigger
    check (due_odometer is not null or due_on is not null)
);

-- =============================================================================
-- 9. PASSPORT SHARES
-- =============================================================================

-- Rows are NEVER deleted. Revoking sets revoked_at and the row stays, so a
-- re-minted link creates a new row while the old token still hashes to a revoked
-- row and is refused. That is what makes "never reissued" a guarantee rather
-- than a probability (FR-051).
create table public.passport_shares (
  id            uuid primary key default gen_random_uuid(),
  vehicle_id    uuid not null references public.vehicles (id) on delete cascade,
  token_hash    bytea not null unique,   -- sha256 of the raw token; the raw token is never stored
  include_costs boolean not null default false,
  minted_at     timestamptz not null default now(),
  revoked_at    timestamptz
);

-- At most one live share per vehicle.
create unique index passport_shares_one_live_per_vehicle
  on public.passport_shares (vehicle_id)
  where revoked_at is null;

-- =============================================================================
-- 10. INDEXES
-- =============================================================================

create index components_vehicle_idx                on public.components (vehicle_id);
create index component_specs_component_idx         on public.component_specs (component_id);
create index tags_vehicle_idx                      on public.tags (vehicle_id);
create index service_entries_component_idx         on public.service_entries (component_id);
-- The hottest read in the product: resolving an entry's current revision.
create index service_revisions_entry_received_idx  on public.service_entry_revisions (entry_id, server_received_at desc, id desc);
create index spec_overrides_component_key_idx      on public.spec_overrides (component_id, spec_key);
create index energy_entries_vehicle_idx            on public.energy_entries (vehicle_id);
create index energy_revisions_entry_received_idx   on public.energy_entry_revisions (entry_id, server_received_at desc, id desc);
create index attachments_revision_idx              on public.attachments (revision_id);
-- Partial: only outstanding reminders are ever queried.
create index reminders_outstanding_idx             on public.reminders (component_id) where completed_at is null;

-- =============================================================================
-- 11. VIEWS
-- =============================================================================

-- security_invoker is essential. Without it a view runs as its owner and silently
-- bypasses the querying user's RLS, which would turn every view below into a
-- data leak.

create view public.v_current_service_revisions
with (security_invoker = true) as
with latest as (
  select distinct on (entry_id) *
  from public.service_entry_revisions
  order by entry_id, server_received_at desc, id desc
),
revision_counts as (
  select entry_id, count(*) as revision_count
  from public.service_entry_revisions
  group by entry_id
)
select
  latest.*,
  revision_counts.revision_count,
  (revision_counts.revision_count > 1) as is_edited
from latest
join revision_counts on revision_counts.entry_id = latest.entry_id
where not latest.is_tombstone;

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
  revision_counts.revision_count,
  (revision_counts.revision_count > 1) as is_edited
from latest
join revision_counts on revision_counts.entry_id = latest.entry_id
where not latest.is_tombstone;

-- Factory specifications overlaid by the most recent active override.
-- Computed once here so the owner card, the shared passport, and any future
-- export can never disagree about what the effective torque figure is.
create view public.v_component_effective_specs
with (security_invoker = true) as
with active_overrides as (
  select
    so.component_id,
    so.spec_key,
    so.kind,
    so.label,
    so.new_value,
    so.unit,
    so.superseded_value,
    so.revision_id,
    row_number() over (
      partition by so.component_id, so.spec_key
      order by cr.server_received_at desc, so.revision_id desc
    ) as precedence_rank,
    count(*) over (partition by so.component_id, so.spec_key) as override_count
  from public.spec_overrides so
  join public.v_current_service_revisions cr on cr.id = so.revision_id
  where cr.category = 'upgrade'
)
-- Factory specs, overlaid where an override exists.
select
  cs.component_id,
  cs.spec_key,
  cs.kind,
  coalesce(ao.label, cs.label)                                  as label,
  coalesce(ao.new_value, cs.value)                              as effective_value,
  coalesce(ao.unit, cs.unit)                                    as unit,
  (case when ao.spec_key is null then 'factory' else 'override' end)::public.spec_origin as origin,
  cs.value                                                      as factory_value,
  ao.revision_id                                                as override_revision_id,
  coalesce(ao.override_count - 1, 0)                            as superseded_override_count,
  cs.sort_order
from public.component_specs cs
left join active_overrides ao
  on  ao.component_id    = cs.component_id
  and ao.spec_key        = cs.spec_key
  and ao.precedence_rank = 1

union all

-- Overrides that introduce a specification the factory never had. An aftermarket
-- diff cover with a fill capacity the OEM part had no equivalent for still needs
-- to reach the HUD.
select
  ao.component_id,
  ao.spec_key,
  ao.kind,
  ao.label,
  ao.new_value                       as effective_value,
  ao.unit,
  'override'::public.spec_origin     as origin,
  null::text                         as factory_value,
  ao.revision_id                     as override_revision_id,
  (ao.override_count - 1)            as superseded_override_count,
  1000                               as sort_order
from active_overrides ao
where ao.precedence_rank = 1
  and not exists (
    select 1 from public.component_specs cs
    where cs.component_id = ao.component_id and cs.spec_key = ao.spec_key
  );

-- =============================================================================
-- 12. TRIGGERS
-- =============================================================================

-- The vehicle's odometer only ever rises, and only from a confirmed reading.
-- An owner correcting a typo downward does not drag the vehicle's mileage back.
create or replace function public.raise_vehicle_odometer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_vehicle_id uuid;
begin
  if new.odometer is null or new.is_tombstone then
    return new;
  end if;

  if tg_table_name = 'service_entry_revisions' then
    select c.vehicle_id into target_vehicle_id
    from public.service_entries se
    join public.components c on c.id = se.component_id
    where se.id = new.entry_id;
  else
    select ee.vehicle_id into target_vehicle_id
    from public.energy_entries ee
    where ee.id = new.entry_id;
  end if;

  update public.vehicles
  set current_odometer = new.odometer,
      updated_at       = now()
  where id = target_vehicle_id
    and current_odometer < new.odometer;

  return new;
end;
$$;

create trigger service_revision_raises_odometer
  after insert on public.service_entry_revisions
  for each row execute function public.raise_vehicle_odometer();

create trigger energy_revision_raises_odometer
  after insert on public.energy_entry_revisions
  for each row execute function public.raise_vehicle_odometer();

-- A CHECK constraint cannot count sibling rows, so the five-attachment limit
-- needs a trigger (FR-026).
create or replace function public.enforce_attachment_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  sibling_count int;
begin
  select count(*) into sibling_count
  from public.attachments
  where revision_id = new.revision_id;

  if sibling_count >= 5 then
    raise exception 'attachment_limit_exceeded'
      using hint = 'A service entry accepts at most 5 attachments.';
  end if;

  return new;
end;
$$;

create trigger attachments_enforce_limit
  before insert on public.attachments
  for each row execute function public.enforce_attachment_limit();

-- =============================================================================
-- 13. ROW LEVEL SECURITY
-- =============================================================================

alter table public.accounts               enable row level security;
alter table public.vehicles               enable row level security;
alter table public.components             enable row level security;
alter table public.component_specs        enable row level security;
alter table public.component_templates    enable row level security;
alter table public.tags                   enable row level security;
alter table public.service_entries        enable row level security;
alter table public.service_entry_revisions enable row level security;
alter table public.spec_overrides         enable row level security;
alter table public.energy_entries         enable row level security;
alter table public.energy_entry_revisions enable row level security;
alter table public.attachments            enable row level security;
alter table public.reminders              enable row level security;
alter table public.passport_shares        enable row level security;

-- Accounts
create policy accounts_self on public.accounts
  for all to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Vehicles: the root of every ownership check (FR-048)
create policy vehicles_owner on public.vehicles
  for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- Components and their specs, reached through the vehicle
create policy components_owner on public.components
  for all to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())));

create policy component_specs_owner on public.component_specs
  for all to authenticated
  using (exists (
    select 1 from public.components c join public.vehicles v on v.id = c.vehicle_id
    where c.id = component_id and v.owner_id = (select auth.uid())))
  with check (exists (
    select 1 from public.components c join public.vehicles v on v.id = c.vehicle_id
    where c.id = component_id and v.owner_id = (select auth.uid())));

-- The component library is readable by any signed-in owner and writable by none.
create policy component_templates_read on public.component_templates
  for select to authenticated using (true);

-- Tags: owner only. Unauthenticated resolution goes through resolve_tag().
create policy tags_owner on public.tags
  for all to authenticated
  using (claimed_by = (select auth.uid()))
  with check (claimed_by = (select auth.uid()));

-- Entry identity rows
create policy service_entries_owner on public.service_entries
  for all to authenticated
  using (exists (
    select 1 from public.components c join public.vehicles v on v.id = c.vehicle_id
    where c.id = component_id and v.owner_id = (select auth.uid())))
  with check (exists (
    select 1 from public.components c join public.vehicles v on v.id = c.vehicle_id
    where c.id = component_id and v.owner_id = (select auth.uid())));

create policy energy_entries_owner on public.energy_entries
  for all to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())));

-- Revisions: SELECT and INSERT ONLY.
-- There is deliberately no UPDATE or DELETE policy on either revision table.
-- Append-only is therefore enforced by the absence of privilege rather than by
-- application code remembering to write a superseding row.
create policy service_revisions_read on public.service_entry_revisions
  for select to authenticated
  using (exists (
    select 1 from public.service_entries se
    join public.components c on c.id = se.component_id
    join public.vehicles v   on v.id = c.vehicle_id
    where se.id = entry_id and v.owner_id = (select auth.uid())));

create policy service_revisions_insert on public.service_entry_revisions
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.service_entries se
      join public.components c on c.id = se.component_id
      join public.vehicles v   on v.id = c.vehicle_id
      where se.id = entry_id and v.owner_id = (select auth.uid())));

create policy energy_revisions_read on public.energy_entry_revisions
  for select to authenticated
  using (exists (
    select 1 from public.energy_entries ee
    join public.vehicles v on v.id = ee.vehicle_id
    where ee.id = entry_id and v.owner_id = (select auth.uid())));

create policy energy_revisions_insert on public.energy_entry_revisions
  for insert to authenticated
  with check (
    author_id = (select auth.uid())
    and exists (
      select 1 from public.energy_entries ee
      join public.vehicles v on v.id = ee.vehicle_id
      where ee.id = entry_id and v.owner_id = (select auth.uid())));

-- Children of a revision
create policy spec_overrides_owner on public.spec_overrides
  for all to authenticated
  using (exists (
    select 1 from public.components c join public.vehicles v on v.id = c.vehicle_id
    where c.id = component_id and v.owner_id = (select auth.uid())))
  with check (exists (
    select 1 from public.components c join public.vehicles v on v.id = c.vehicle_id
    where c.id = component_id and v.owner_id = (select auth.uid())));

create policy attachments_owner on public.attachments
  for all to authenticated
  using (exists (
    select 1 from public.service_entry_revisions r
    join public.service_entries se on se.id = r.entry_id
    join public.components c on c.id = se.component_id
    join public.vehicles v   on v.id = c.vehicle_id
    where r.id = revision_id and v.owner_id = (select auth.uid())))
  with check (exists (
    select 1 from public.service_entry_revisions r
    join public.service_entries se on se.id = r.entry_id
    join public.components c on c.id = se.component_id
    join public.vehicles v   on v.id = c.vehicle_id
    where r.id = revision_id and v.owner_id = (select auth.uid())));

create policy reminders_owner on public.reminders
  for all to authenticated
  using (exists (
    select 1 from public.components c join public.vehicles v on v.id = c.vehicle_id
    where c.id = component_id and v.owner_id = (select auth.uid())))
  with check (exists (
    select 1 from public.components c join public.vehicles v on v.id = c.vehicle_id
    where c.id = component_id and v.owner_id = (select auth.uid())));

-- Shares: owner only. Guest access goes through get_public_passport().
create policy passport_shares_owner on public.passport_shares
  for all to authenticated
  using (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.vehicles v where v.id = vehicle_id and v.owner_id = (select auth.uid())));

-- The anon role never receives a policy that reads vehicle data directly, so a
-- leaked anon key discloses nothing. Both guest paths are SECURITY DEFINER
-- functions that validate their own input and return a fixed projection.

-- =============================================================================
-- 14. RPCs
-- =============================================================================

-- 14.1 -- Component service card, in one round trip -----------------------------
-- SECURITY INVOKER: RLS still applies. This function exists purely to collapse a
-- card render into a single round trip, never to bypass authorization.
create or replace function public.get_component_card(
  p_vehicle_slug   text,
  p_component_slug text,
  p_limit          int default 20
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  target_vehicle   public.vehicles%rowtype;
  target_component public.components%rowtype;
  result           jsonb;
begin
  select * into target_vehicle
  from public.vehicles
  where slug = p_vehicle_slug and owner_id = (select auth.uid());

  if not found then
    return null;   -- the route renders 404, never 403
  end if;

  select * into target_component
  from public.components
  where vehicle_id = target_vehicle.id and slug = p_component_slug;

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'vehicle', jsonb_build_object(
      'id', target_vehicle.id, 'slug', target_vehicle.slug, 'year', target_vehicle.year,
      'make', target_vehicle.make, 'model', target_vehicle.model, 'trim', target_vehicle.trim,
      'nickname', target_vehicle.nickname, 'power_source', target_vehicle.power_source,
      'current_odometer', target_vehicle.current_odometer),

    'component', jsonb_build_object(
      'id', target_component.id, 'slug', target_component.slug,
      'display_name', target_component.display_name,
      'is_energy_port', target_component.is_energy_port,
      'energy_mode_hint', target_component.energy_mode_hint,
      'service_interval_miles', target_component.service_interval_miles,
      'service_interval_days', target_component.service_interval_days),

    'specs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'spec_key', s.spec_key, 'kind', s.kind, 'label', s.label,
        'effective_value', s.effective_value, 'unit', s.unit, 'origin', s.origin,
        'factory_value', s.factory_value, 'override_revision_id', s.override_revision_id,
        'superseded_override_count', s.superseded_override_count)
        order by s.sort_order, s.label)
      from public.v_component_effective_specs s
      where s.component_id = target_component.id), '[]'::jsonb),

    'reminders', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rm.id, 'kind', rm.kind, 'due_odometer', rm.due_odometer, 'due_on', rm.due_on,
        'is_overdue', (rm.due_odometer is not null and target_vehicle.current_odometer >= rm.due_odometer)
                   or (rm.due_on is not null and current_date >= rm.due_on))
        order by rm.due_on nulls last, rm.due_odometer nulls last)
      from public.reminders rm
      where rm.component_id = target_component.id and rm.completed_at is null), '[]'::jsonb),

    'timeline', coalesce((
      select jsonb_agg(entry_row order by sort_performed_on desc, sort_odometer desc)
      from (
        select
          cr.performed_on as sort_performed_on,
          cr.odometer     as sort_odometer,
          jsonb_build_object(
          'entry_id', cr.entry_id, 'revision_id', cr.id, 'category', cr.category,
          'performed_on', cr.performed_on, 'odometer', cr.odometer, 'notes', cr.notes,
          'is_edited', cr.is_edited,
          'category_fields', jsonb_strip_nulls(jsonb_build_object(
            'fluid_type', cr.fluid_type, 'quantity', cr.quantity, 'quantity_unit', cr.quantity_unit,
            'filter_part_number', cr.filter_part_number, 'applied_torque', cr.applied_torque,
            'symptom', cr.symptom, 'diagnosis', cr.diagnosis, 'action_taken', cr.action_taken,
            'old_part_number', cr.old_part_number, 'new_part_number', cr.new_part_number,
            'brand', cr.brand, 'supplier', cr.supplier, 'cost', cr.cost,
            'warranty_expires_on', cr.warranty_expires_on,
            'upgrade_brand', cr.upgrade_brand, 'product_name', cr.product_name,
            'install_notes', cr.install_notes, 'reference_url', cr.reference_url)),
          'attachments', coalesce((
            select jsonb_agg(jsonb_build_object(
              'id', a.id, 'storage_path', a.storage_path,
              'original_filename', a.original_filename, 'mime_type', a.mime_type, 'state', a.state))
            from public.attachments a where a.revision_id = cr.id), '[]'::jsonb)
        ) as entry_row
        from public.v_current_service_revisions cr
        join public.service_entries se on se.id = cr.entry_id
        where se.component_id = target_component.id
        order by cr.performed_on desc, cr.odometer desc
        limit p_limit
      ) ordered_entries), '[]'::jsonb),

    'timeline_has_more', (
      select count(*) > p_limit
      from public.v_current_service_revisions cr
      join public.service_entries se on se.id = cr.entry_id
      where se.component_id = target_component.id)
  ) into result;

  return result;
end;
$$;

-- 14.2 -- Tag resolution --------------------------------------------------------
-- SECURITY DEFINER, and one of only two unauthenticated data paths in the system.
--
-- It exists because an anonymous scan must be able to learn "this tag is
-- unclaimed" so it can route to the claim flow, while a scan of someone else's
-- claimed tag must learn nothing at all. A plain RLS-filtered SELECT cannot
-- express that asymmetry — it returns an empty row for both cases.
--
-- The 'forbidden' and 'unknown' branches must stay indistinguishable in payload
-- and in execution time. A measurable difference would turn the tag space into
-- an oracle for enumerating claimed tags.
create or replace function public.resolve_tag(p_tag_id text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  matched_tag    public.tags%rowtype;
  vehicle_slug   text;
  component_slug text;
begin
  select * into matched_tag from public.tags where id = p_tag_id;

  if not found then
    return jsonb_build_object('status', 'unknown');
  end if;

  if matched_tag.vehicle_id is null then
    return jsonb_build_object('status', 'unclaimed');
  end if;

  if matched_tag.claimed_by is distinct from (select auth.uid()) then
    return jsonb_build_object('status', 'forbidden');
  end if;

  select v.slug, c.slug into vehicle_slug, component_slug
  from public.vehicles v
  join public.components c on c.id = matched_tag.component_id
  where v.id = matched_tag.vehicle_id;

  if vehicle_slug is null then
    return jsonb_build_object('status', 'unknown');
  end if;

  return jsonb_build_object(
    'status', 'owned',
    'vehicle_slug', vehicle_slug,
    'component_slug', component_slug);
end;
$$;

-- 14.3 -- Public passport -------------------------------------------------------
-- The single highest-risk function in the system: the only path by which an
-- unauthenticated caller obtains vehicle data.
--
-- Redaction happens here, in SQL, before anything is returned. A client-side bug
-- must not be able to leak an owner's spending or location patterns.
create or replace function public.get_public_passport(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  matched_share  public.passport_shares%rowtype;
  target_vehicle public.vehicles%rowtype;
begin
  select * into matched_share
  from public.passport_shares
  where token_hash = sha256(convert_to(p_token, 'UTF8'))
    and revoked_at is null;

  if not found then
    return null;   -- revoked, unknown and malformed are all a 404
  end if;

  select * into target_vehicle from public.vehicles where id = matched_share.vehicle_id;

  return jsonb_build_object(
    'vehicle', jsonb_build_object(
      'year', target_vehicle.year, 'make', target_vehicle.make, 'model', target_vehicle.model,
      'trim', target_vehicle.trim, 'power_source', target_vehicle.power_source,
      'current_odometer', target_vehicle.current_odometer),
    -- Owner identity is absent by construction: no column from accounts or
    -- auth.users is selected anywhere in this projection.

    'components', coalesce((
      select jsonb_agg(jsonb_build_object(
        'display_name', c.display_name,
        'specs', coalesce((
          select jsonb_agg(jsonb_build_object(
            'label', s.label, 'effective_value', s.effective_value,
            'unit', s.unit, 'origin', s.origin) order by s.sort_order)
          from public.v_component_effective_specs s where s.component_id = c.id), '[]'::jsonb))
        order by c.display_name)
      from public.components c where c.vehicle_id = target_vehicle.id), '[]'::jsonb),

    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'component_name', c.display_name,
        'category', cr.category,
        'performed_on', cr.performed_on,
        'odometer', cr.odometer,
        'notes', cr.notes,
        'is_edited', cr.is_edited,
        -- Costs are nulled unless the owner explicitly opted in (FR-050).
        'cost', case when matched_share.include_costs then cr.cost else null end)
        order by cr.performed_on desc)
      from public.v_current_service_revisions cr
      join public.service_entries se on se.id = cr.entry_id
      join public.components c on c.id = se.component_id
      where c.vehicle_id = target_vehicle.id), '[]'::jsonb),

    -- Charging location labels are location data and are never shared.
    'energy_summary', (
      select jsonb_build_object(
        'entry_count', count(*),
        'first_odometer', min(cr.odometer),
        'last_odometer', max(cr.odometer))
      from public.v_current_energy_revisions cr
      join public.energy_entries ee on ee.id = cr.entry_id
      where ee.vehicle_id = target_vehicle.id),

    'include_costs', matched_share.include_costs);
end;
$$;

-- 14.4 -- Claim a tag -----------------------------------------------------------
create or replace function public.claim_tag(
  p_tag_id         text,
  p_vehicle_id     uuid,
  p_component_slug text,
  p_template_key   text,
  p_display_name   text
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  matched_tag       public.tags%rowtype;
  target_vehicle    public.vehicles%rowtype;
  resolved_slug     text;
  slug_suffix       int := 1;
  new_component_id  uuid;
  template          public.component_templates%rowtype;
  spec_entry        jsonb;
begin
  select * into matched_tag from public.tags where id = p_tag_id;
  if not found then
    raise exception 'tag_not_found';
  end if;

  if matched_tag.vehicle_id is not null
     and matched_tag.claimed_by is distinct from (select auth.uid()) then
    raise exception 'tag_already_claimed';
  end if;

  select * into target_vehicle
  from public.vehicles
  where id = p_vehicle_id and owner_id = (select auth.uid());
  if not found then
    raise exception 'vehicle_not_owned';
  end if;

  -- A slug collision is resolved with a discriminator, never by rejecting the
  -- claim. Someone standing at their truck with a peeled-off sticker should not
  -- be asked to invent a different name.
  resolved_slug := p_component_slug;
  while exists (
    select 1 from public.components
    where vehicle_id = p_vehicle_id and slug = resolved_slug
  ) loop
    slug_suffix   := slug_suffix + 1;
    resolved_slug := p_component_slug || '-' || slug_suffix;
  end loop;

  select * into template from public.component_templates where key = p_template_key;

  insert into public.components (
    vehicle_id, slug, display_name, template_key,
    is_energy_port, energy_mode_hint, service_interval_miles, service_interval_days)
  values (
    p_vehicle_id, resolved_slug,
    coalesce(p_display_name, template.display_name, resolved_slug), p_template_key,
    coalesce(template.is_energy_port, false), template.energy_mode_hint,
    template.default_interval_miles, template.default_interval_days)
  returning id into new_component_id;

  -- Copy template specs so the HUD is useful before any manual data entry.
  if template.default_specs is not null then
    for spec_entry in select * from jsonb_array_elements(template.default_specs) loop
      insert into public.component_specs (component_id, spec_key, kind, label, value, unit, sort_order)
      values (
        new_component_id,
        spec_entry->>'spec_key',
        (spec_entry->>'kind')::public.spec_kind,
        spec_entry->>'label',
        spec_entry->>'value',
        spec_entry->>'unit',
        coalesce((spec_entry->>'sort_order')::int, 0));
    end loop;
  end if;

  update public.tags
  set vehicle_id = p_vehicle_id, component_id = new_component_id,
      claimed_by = (select auth.uid()), claimed_at = now()
  where id = p_tag_id;

  return jsonb_build_object('vehicle_slug', target_vehicle.slug, 'component_slug', resolved_slug);
end;
$$;

-- 14.5 -- Recompute derived state ----------------------------------------------
-- Called after any revision is superseded or tombstoned. Idempotent, so a
-- retried sync is always safe to replay.
create or replace function public.recompute_component_derived(p_component_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  -- Drop outstanding derived reminders and rebuild from current revisions only.
  delete from public.reminders
  where component_id = p_component_id and completed_at is null;

  -- Re-check reminders introduced by repair entries.
  insert into public.reminders (component_id, source_revision_id, kind, due_odometer, due_on)
  select
    p_component_id, cr.id, 'recheck',
    case when cr.recheck_miles is not null then cr.odometer + cr.recheck_miles end,
    case when cr.recheck_days  is not null then cr.performed_on + cr.recheck_days end
  from public.v_current_service_revisions cr
  join public.service_entries se on se.id = cr.entry_id
  where se.component_id = p_component_id
    and cr.category = 'repair'
    and (cr.recheck_miles is not null or cr.recheck_days is not null);

  -- Next-due from the most recent maintenance entry and the component's interval.
  insert into public.reminders (component_id, source_revision_id, kind, due_odometer, due_on)
  select
    p_component_id, cr.id, 'next_due',
    case when coalesce(cr.next_interval_miles, c.service_interval_miles) is not null
         then cr.odometer + coalesce(cr.next_interval_miles, c.service_interval_miles) end,
    case when coalesce(cr.next_interval_days, c.service_interval_days) is not null
         then cr.performed_on + coalesce(cr.next_interval_days, c.service_interval_days) end
  from public.v_current_service_revisions cr
  join public.service_entries se on se.id = cr.entry_id
  join public.components c on c.id = se.component_id
  where se.component_id = p_component_id
    and cr.category = 'maintenance'
    and cr.id = (
      select cr2.id
      from public.v_current_service_revisions cr2
      join public.service_entries se2 on se2.id = cr2.entry_id
      where se2.component_id = p_component_id and cr2.category = 'maintenance'
      order by cr2.performed_on desc, cr2.odometer desc
      limit 1)
    and (coalesce(cr.next_interval_miles, c.service_interval_miles) is not null
      or coalesce(cr.next_interval_days,  c.service_interval_days)  is not null);
end;
$$;

-- =============================================================================
-- 15. FUNCTION GRANTS
-- =============================================================================

revoke all on function public.resolve_tag(text)           from public;
revoke all on function public.get_public_passport(text)   from public;

grant execute on function public.get_component_card(text, text, int)               to authenticated;
grant execute on function public.resolve_tag(text)                                  to anon, authenticated;
grant execute on function public.get_public_passport(text)                          to anon, authenticated;
grant execute on function public.claim_tag(text, uuid, text, text, text)            to authenticated;
grant execute on function public.recompute_component_derived(uuid)                  to authenticated;

-- =============================================================================
-- 16. STORAGE
-- =============================================================================

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

-- Path shape is {owner_id}/{vehicle_id}/{attachment_id}, so the first path
-- segment is the authorization key. Passport guests never touch these policies —
-- they receive short-lived signed URLs minted by get_public_passport instead.
create policy attachments_owner_read on storage.objects
  for select to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy attachments_owner_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

create policy attachments_owner_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'attachments' and (storage.foldername(name))[1] = (select auth.uid())::text);

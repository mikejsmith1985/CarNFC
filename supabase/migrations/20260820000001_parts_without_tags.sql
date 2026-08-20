-- Lets an owner add parts to a vehicle without a tag for each one.
--
-- Until now a component only came into existence by claiming a tag stuck to it.
-- That is fine for a tag-per-part vehicle, but a zone badge covers "everything
-- you reach from here" — and on a vehicle whose parts were never created, that
-- is nothing at all. The badge opened to an empty screen whose only way out led
-- back to the vehicle, which had no way to add a part either.

-- 1 -- Slug shape, decided in one place ---------------------------------------
-- The client already slugifies a name someone typed; a name that only ever
-- exists server-side (a template's display name) needs the same treatment, and
-- the two must agree or the same part gets two different addresses.
create or replace function public.slugify_component_name(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select coalesce(
    nullif(
      trim(both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g')),
      ''),
    'component');
$$;

-- 2 -- The shared component builder -------------------------------------------
-- Extracted from claim_tag so a part created by a tag and a part created by
-- hand are the same thing: same slug rules, same template specs, same service
-- intervals. Two code paths building components separately would drift apart.
create or replace function public.create_component_for_vehicle(
  p_vehicle_id     uuid,
  p_component_slug text,
  p_template_key   text,
  p_display_name   text
)
returns public.components
language plpgsql
security invoker
set search_path = ''
as $$
declare
  resolved_slug text;
  slug_suffix   int := 1;
  template      public.component_templates%rowtype;
  spec_entry    jsonb;
  new_component public.components%rowtype;
begin
  -- A slug collision is resolved with a discriminator, never by rejecting the
  -- request. Someone standing at their truck should not be asked to invent a
  -- different name for a part they already named once.
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
  returning * into new_component;

  -- Copy template specs so the card is useful before any manual data entry.
  if template.default_specs is not null then
    for spec_entry in select * from jsonb_array_elements(template.default_specs) loop
      insert into public.component_specs (component_id, spec_key, kind, label, value, unit, sort_order)
      values (
        new_component.id,
        spec_entry->>'spec_key',
        (spec_entry->>'kind')::public.spec_kind,
        spec_entry->>'label',
        spec_entry->>'value',
        spec_entry->>'unit',
        coalesce((spec_entry->>'sort_order')::int, 0));
    end loop;
  end if;

  return new_component;
end;
$$;

-- 3 -- claim_tag, now built on the shared builder -----------------------------
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
  matched_tag    public.tags%rowtype;
  target_vehicle public.vehicles%rowtype;
  new_component  public.components%rowtype;
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

  new_component := public.create_component_for_vehicle(
    p_vehicle_id, p_component_slug, p_template_key, p_display_name);

  update public.tags
  set vehicle_id = p_vehicle_id, component_id = new_component.id,
      claimed_by = (select auth.uid()), claimed_at = now()
  where id = p_tag_id;

  return jsonb_build_object('vehicle_slug', target_vehicle.slug,
                            'component_slug', new_component.slug);
end;
$$;

-- 4 -- Adding parts with no tag involved --------------------------------------
-- Takes a list of template keys, so setting up a whole working area is one
-- press rather than one press per part. Anything the vehicle already has is
-- skipped: pressing twice must not produce two engine oil cards.
create or replace function public.add_components_from_templates(
  p_vehicle_id    uuid,
  p_template_keys text[]
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_vehicle  public.vehicles%rowtype;
  template        public.component_templates%rowtype;
  requested_key   text;
  new_component   public.components%rowtype;
  created_slugs   text[] := '{}';
begin
  select * into target_vehicle
  from public.vehicles
  where id = p_vehicle_id and owner_id = (select auth.uid());
  if not found then
    raise exception 'vehicle_not_owned';
  end if;

  foreach requested_key in array coalesce(p_template_keys, '{}'::text[]) loop
    select * into template from public.component_templates where key = requested_key;
    if not found then
      raise exception 'unknown_template';
    end if;

    -- Already on this vehicle: skip rather than fail the whole batch, so a
    -- second press is harmless instead of duplicating half the engine bay.
    if exists (
      select 1 from public.components existing
      where existing.vehicle_id = p_vehicle_id and existing.template_key = template.key
    ) then
      continue;
    end if;

    new_component := public.create_component_for_vehicle(
      p_vehicle_id,
      public.slugify_component_name(template.display_name),
      template.key,
      template.display_name);

    created_slugs := created_slugs || new_component.slug;
  end loop;

  return jsonb_build_object('vehicle_slug', target_vehicle.slug,
                            'created_slugs', to_jsonb(created_slugs));
end;
$$;

-- 5 -- One part, named by the owner -------------------------------------------
-- For anything the seeded library does not cover. A hand-named part carries no
-- template, so nothing can infer where on the vehicle it sits — which is why
-- the caller may state the zone. Named from a zone badge and left unplaced, it
-- would be invisible to the very badge that created it.
create or replace function public.add_custom_component(
  p_vehicle_id   uuid,
  p_display_name text,
  p_zone_key     text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  target_vehicle public.vehicles%rowtype;
  new_component  public.components%rowtype;
begin
  if coalesce(trim(p_display_name), '') = '' then
    raise exception 'name_required';
  end if;

  select * into target_vehicle
  from public.vehicles
  where id = p_vehicle_id and owner_id = (select auth.uid());
  if not found then
    raise exception 'vehicle_not_owned';
  end if;

  new_component := public.create_component_for_vehicle(
    p_vehicle_id,
    public.slugify_component_name(p_display_name),
    null,
    trim(p_display_name));

  if p_zone_key is not null then
    update public.components set zone_key = p_zone_key where id = new_component.id;
  end if;

  return jsonb_build_object('vehicle_slug', target_vehicle.slug,
                            'component_slug', new_component.slug);
end;
$$;

-- 6 -- Grants -----------------------------------------------------------------
-- The builder deliberately does not re-check ownership, because its callers
-- already have. That is safe because it runs as the caller: the insert it
-- performs is still judged by the components policy, so reaching it directly
-- with somebody else's vehicle id raises a policy violation rather than
-- creating anything. The entry points' own check exists to turn that into an
-- error an owner can read.
revoke execute on function public.create_component_for_vehicle(uuid, text, text, text) from public;
revoke execute on function public.create_component_for_vehicle(uuid, text, text, text) from anon;
grant  execute on function public.create_component_for_vehicle(uuid, text, text, text) to authenticated;

revoke execute on function public.slugify_component_name(text) from public;
grant  execute on function public.slugify_component_name(text) to authenticated;

revoke execute on function public.add_components_from_templates(uuid, text[]) from public;
grant  execute on function public.add_components_from_templates(uuid, text[]) to authenticated;

revoke execute on function public.add_custom_component(uuid, text, text) from public;
grant  execute on function public.add_custom_component(uuid, text, text) to authenticated;

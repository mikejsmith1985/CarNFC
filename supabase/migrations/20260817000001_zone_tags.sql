-- Lets one tag cover a working zone instead of a single part.
--
-- A tag per part is the sharpest thing this product does, and it does not scale
-- to a whole vehicle: nobody is sticking twenty badges on a truck. A zone tag is
-- the other end of that trade — one badge where a person already stands,
-- covering everything they reach from there.
--
-- A tag still binds to exactly one thing. It is now either a component or a
-- zone, never both and never neither, which the constraint below enforces
-- rather than trusting the application to remember.

alter table public.tags
  add column if not exists zone_key text;

comment on column public.tags.zone_key is
  'The working zone this tag covers, when it covers a zone rather than one part.';

alter table public.tags
  drop constraint if exists tags_binding_is_complete;

alter table public.tags
  add constraint tags_binding_is_complete check (
    -- Unclaimed: bound to nothing at all.
    (vehicle_id is null and component_id is null and zone_key is null)
    -- Claimed: a vehicle, and exactly one of a part or a zone.
    or (
      vehicle_id is not null
      and ((component_id is not null)::int + (zone_key is not null)::int) = 1
    )
  );

-- Resolving a tag now has a third answer.
--
-- The two guest-facing branches are unchanged and deliberately identical:
-- 'forbidden' and 'unknown' must stay indistinguishable, or the tag space
-- becomes a way to find out which tags exist.
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

  select v.slug into vehicle_slug
  from public.vehicles v
  where v.id = matched_tag.vehicle_id;

  if vehicle_slug is null then
    return jsonb_build_object('status', 'unknown');
  end if;

  if matched_tag.zone_key is not null then
    return jsonb_build_object(
      'status', 'zone',
      'vehicle_slug', vehicle_slug,
      'zone_key', matched_tag.zone_key);
  end if;

  select c.slug into component_slug
  from public.components c
  where c.id = matched_tag.component_id;

  if component_slug is null then
    return jsonb_build_object('status', 'unknown');
  end if;

  return jsonb_build_object(
    'status', 'owned',
    'vehicle_slug', vehicle_slug,
    'component_slug', component_slug);
end;
$$;

-- Binds a tag to a zone, in one statement so a half-bound tag cannot exist.
--
-- Mirrors claim_tag, which does the same for a part. Security invoker: the
-- caller's own Row Level Security decides whether the vehicle is theirs, so
-- this cannot be used to bind a tag onto somebody else's truck.
create or replace function public.claim_zone_tag(
  p_tag_id     text,
  p_vehicle_id uuid,
  p_zone_key   text)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = ''
as $$
declare
  vehicle_slug text;
begin
  select v.slug into vehicle_slug
  from public.vehicles v
  where v.id = p_vehicle_id;

  if vehicle_slug is null then
    raise exception 'vehicle_not_found';
  end if;

  update public.tags
     set vehicle_id   = p_vehicle_id,
         component_id = null,
         zone_key     = p_zone_key,
         claimed_by   = (select auth.uid()),
         claimed_at   = now()
   where id = p_tag_id
     and (claimed_by is null or claimed_by = (select auth.uid()));

  if not found then
    raise exception 'tag_not_found';
  end if;

  return jsonb_build_object('vehicle_slug', vehicle_slug, 'zone_key', p_zone_key);
end;
$$;

revoke all on function public.claim_zone_tag(text, uuid, text) from public;
grant execute on function public.claim_zone_tag(text, uuid, text) to authenticated;

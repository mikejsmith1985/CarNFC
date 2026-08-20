-- Production side: making tags in batches, before any of them has an owner.
--
-- Everything else in this schema assumes a signed-in owner acting on their own
-- vehicle. Manufacturing has neither: tags are made in hundreds, written by an
-- encoder, and shipped to people who have never opened the app. Until now the
-- only way to make one was a script run by hand with the service-role key, and
-- nothing recorded which order a tag went out with.
--
-- A batch is the unit anyone actually thinks in — this run, this order, this
-- print job — so it is the unit tracked here.

-- --- who may do this ---------------------------------------------------------

alter table public.accounts
  add column if not exists is_admin boolean not null default false;

comment on column public.accounts.is_admin is
  'May mint and inspect tag batches. Granted deliberately, never by signing up.';

/*
  Asked by every admin function rather than trusted from the client.

  Security definer so it can read the accounts table regardless of the caller's
  own policies, and stable so Postgres may cache it within a statement.
*/
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select a.is_admin from public.accounts a where a.id = (select auth.uid())),
    false);
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- --- what a production run is ------------------------------------------------

create table if not exists public.tag_batches (
  id          uuid primary key default gen_random_uuid(),
  label       text not null check (length(trim(label)) between 1 and 80),
  note        text,
  created_by  uuid not null references public.accounts(id) on delete restrict,
  created_at  timestamptz not null default now()
);

comment on table public.tag_batches is
  'One production run of tags: a print job, an order, a shipment.';

alter table public.tags
  add column if not exists batch_id uuid references public.tag_batches(id) on delete set null;

create index if not exists tags_batch_idx on public.tags(batch_id);

alter table public.tag_batches enable row level security;
alter table public.tag_batches force row level security;

-- No policy grants ordinary access. Every read and write goes through the
-- functions below, which check `is_admin()` for themselves.
create policy tag_batches_admin on public.tag_batches
  for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

grant select, insert, update, delete on public.tag_batches to authenticated;

-- --- making a run ------------------------------------------------------------

/*
  Mints a batch of unclaimed tags in one transaction.

  The rows are left with no owner at all, which is what makes them claimable by
  whoever buys them — the buyer is unknown at manufacture. The identifiers are
  supplied by the caller rather than generated here, so the same generator is
  used for a batch of five hundred as for an owner setting up a single blank
  tag, and there is one definition of what a tag identifier looks like.
*/
create or replace function public.admin_create_tag_batch(
  p_label   text,
  p_note    text,
  p_tag_ids text[])
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  new_batch_id uuid;
begin
  if not public.is_admin() then
    raise exception 'not_permitted';
  end if;

  if array_length(p_tag_ids, 1) is null then
    raise exception 'no_tags_supplied';
  end if;

  insert into public.tag_batches (label, note, created_by)
  values (p_label, nullif(trim(coalesce(p_note, '')), ''), (select auth.uid()))
  returning id into new_batch_id;

  insert into public.tags (id, batch_id)
  select unnest(p_tag_ids), new_batch_id;

  return jsonb_build_object('batch_id', new_batch_id, 'tag_count', array_length(p_tag_ids, 1));
end;
$$;

revoke all on function public.admin_create_tag_batch(text, text, text[]) from public;
grant execute on function public.admin_create_tag_batch(text, text, text[]) to authenticated;

-- --- looking at the runs -----------------------------------------------------

/** Every batch with how many of its tags have been claimed. */
create or replace function public.admin_list_tag_batches()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_permitted';
  end if;

  return coalesce((
    select jsonb_agg(row_to_json(batch_summary) order by batch_summary.created_at desc)
    from (
      select b.id,
             b.label,
             b.note,
             b.created_at,
             count(t.id)                                        as tag_count,
             count(t.id) filter (where t.claimed_by is not null) as claimed_count
      from public.tag_batches b
      left join public.tags t on t.batch_id = b.id
      group by b.id, b.label, b.note, b.created_at
    ) as batch_summary
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_list_tag_batches() from public;
grant execute on function public.admin_list_tag_batches() to authenticated;

/** Every tag in one batch, for handing to an encoder or checking what shipped. */
create or replace function public.admin_batch_tags(p_batch_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'not_permitted';
  end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'tag_id', t.id,
             'is_claimed', t.claimed_by is not null,
             'claimed_at', t.claimed_at)
           order by t.created_at)
    from public.tags t
    where t.batch_id = p_batch_id
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.admin_batch_tags(uuid) from public;
grant execute on function public.admin_batch_tags(uuid) to authenticated;

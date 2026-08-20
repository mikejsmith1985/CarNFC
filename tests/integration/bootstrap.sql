-- Recreates the minimum Supabase surface our schema depends on, so migrations can run against plain PostgreSQL in a container.
--
-- Article V requires integration tests to use real infrastructure, never mocked
-- drivers. This is real PostgreSQL running the real migrations with the real
-- policies — what it stands in for is only the Supabase-managed `auth` and
-- `storage` schemas, which are platform surface rather than our code.
--
-- `auth.uid()` is reproduced exactly as Supabase defines it: it reads the `sub`
-- claim out of the `request.jwt.claims` GUC. That is what lets a test act as a
-- specific owner and prove Row Level Security actually holds.

create schema if not exists auth;
create schema if not exists storage;

-- Roles the policies are granted to.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

-- Deliberately NOT granting table privileges here.
--
-- An earlier version granted ALL on future tables, which made the harness more
-- permissive than production: the suite passed against a schema whose tables no
-- role could actually reach, and the failure only surfaced when the real stack
-- was started. The migrations now grant what they need explicitly, and this
-- file stays quiet so that stays true.
alter default privileges in schema public
  grant execute on functions to anon, authenticated, service_role;

-- --- auth ---------------------------------------------------------------------

create table if not exists auth.users (
  id         uuid primary key default gen_random_uuid(),
  email      text unique,
  created_at timestamptz not null default now()
);

/** The signed-in user id, read from the request's JWT claims. */
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claims', true)::json ->> 'sub', '')::uuid;
$$;

grant usage on schema auth to anon, authenticated, service_role;
grant select on auth.users to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

-- --- storage ------------------------------------------------------------------

create table if not exists storage.buckets (
  id     text primary key,
  name   text not null,
  public boolean not null default false
);

create table if not exists storage.objects (
  id        uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name      text not null,
  owner     uuid
);

alter table storage.objects enable row level security;

/** Splits an object path into its folder segments, as Supabase Storage does. */
create or replace function storage.foldername(name text)
returns text[]
language sql
immutable
as $$
  select string_to_array(name, '/');
$$;

grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.objects to anon, authenticated, service_role;
grant all on storage.buckets to anon, authenticated, service_role;
grant execute on function storage.foldername(text) to anon, authenticated, service_role;

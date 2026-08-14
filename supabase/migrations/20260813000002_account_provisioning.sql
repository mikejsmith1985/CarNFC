-- Creates the public.accounts row whenever Supabase Auth creates a user, so the first claim has an owner to point at.
--
-- Without this, `vehicles.owner_id` has no row to reference and the very first
-- claim fails on a foreign key — after the owner has already signed in, which is
-- the worst possible moment to discover it.

create or replace function public.provision_account_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.accounts (id)
  values (new.id)
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.provision_account_for_new_user();

-- Backfill anyone who signed up before this migration landed.
insert into public.accounts (id)
select id from auth.users
on conflict (id) do nothing;

-- Lets an owner say which zone a part belongs to, overriding its template.
--
-- Placement normally follows the template a part was created from. That works
-- for the seeded library and not at all for anything added by hand: a part with
-- no template belongs to no zone, so a badge on the bonnet can never reach it.
--
-- Null means "follow the template", a zone key means that zone, and 'none'
-- means deliberately nowhere — an owner can take a part out of every zone
-- without deleting it.

alter table public.components
  add column if not exists zone_key text;

comment on column public.components.zone_key is
  'Owner override for which zone this part belongs to. Null follows the template; ''none'' means no zone.';

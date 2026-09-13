-- Supabase's roles, for a bare Postgres container in CI.
--
-- The migrations reference `anon` and `authenticated` in their policies and
-- grants. A stock postgres:17 image has neither, so migration 0001 fails with
-- `role "anon" does not exist` before it reaches anything worth testing.
-- Supabase's own platform creates these; locally `supabase start` provides
-- them. CI uses a plain container (DEC-025), so it bootstraps them here.
--
-- Deliberately minimal: just enough for policies and grants to be expressible
-- and testable. This is NOT a Supabase emulation, and the RLS suite from M1
-- runs against real local Supabase as well.

create role anon nologin noinherit;
create role authenticated nologin noinherit;
create role service_role nologin noinherit bypassrls;

-- `authenticator` is the role PostgREST connects as and switches from.
create role authenticator noinherit login password 'postgres';
grant anon, authenticated, service_role to authenticator;

grant usage on schema public to anon, authenticated, service_role;

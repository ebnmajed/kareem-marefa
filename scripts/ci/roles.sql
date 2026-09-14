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

-- ── M1: the auth surface the migrations and the RLS suite touch. ────────────
-- Local Supabase provides all of this for real; CI's bare container gets the
-- smallest shim that lets the same SQL run. Local Supabase is the source of
-- truth (STATUS.md) — this shim exists so CI can run the suite at all, not to
-- stand in for the platform.
create role supabase_auth_admin nologin noinherit;
grant anon, authenticated, service_role, supabase_auth_admin to postgres;

create schema if not exists auth;
create schema if not exists extensions;
grant usage on schema auth to anon, authenticated, service_role, supabase_auth_admin;
grant usage on schema extensions to anon, authenticated, service_role, supabase_auth_admin;

create table auth.users (
  id                 uuid primary key,
  email              text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at         timestamptz not null default now()
);
grant select on auth.users to supabase_auth_admin;

-- Exactly how Supabase implements them: the claims of the current request.
create function auth.jwt() returns jsonb
language sql stable as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim', true), ''),
    nullif(current_setting('request.jwt.claims', true), '')
  )::jsonb
$$;
create function auth.uid() returns uuid
language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
create function auth.role() returns text
language sql stable as $$
  select nullif(auth.jwt() ->> 'role', '')
$$;
grant execute on function auth.jwt(), auth.uid(), auth.role()
  to anon, authenticated, service_role, supabase_auth_admin;

-- ── M2: the Realtime surface 03 §7.2 policies and §7.3 broadcasts from. ─────
-- Supabase creates schema realtime, realtime.messages and realtime.send() on
-- every project; migration 0016 adds RLS policies to that table and triggers
-- that call send(). A bare container has none of it (CI found this: 3F000,
-- schema "realtime" does not exist). Shape and grants mirror local Supabase
-- (introspected 2026-09-14); send() is Supabase's own body, minus nothing.
create schema if not exists realtime;
grant usage on schema realtime to anon, authenticated;

create table realtime.messages (
  topic          text not null,
  extension      text not null,
  payload        jsonb,
  event          text,
  private        boolean default false,
  updated_at     timestamp without time zone not null default now(),
  inserted_at    timestamp without time zone not null default now(),
  id             uuid not null default gen_random_uuid(),
  binary_payload bytea,
  primary key (id, inserted_at)
);
alter table realtime.messages enable row level security;
grant select, insert, update on realtime.messages to anon, authenticated;

create function realtime.send(payload jsonb, event text, topic text, private boolean default true)
returns void language plpgsql as $$
declare
  generated_id uuid;
  final_payload jsonb;
begin
  begin
    generated_id := gen_random_uuid();
    if payload ? 'id' then final_payload := payload;
    else final_payload := jsonb_set(payload, '{id}', to_jsonb(generated_id));
    end if;
    execute format('SET LOCAL realtime.topic TO %L', topic);
    insert into realtime.messages (id, payload, event, topic, private, extension)
    values (generated_id, final_payload, event, topic, private, 'broadcast');
  exception when others then
    raise warning 'WarnSendingBroadcastMessage: %', SQLERRM;
  end;
end $$;

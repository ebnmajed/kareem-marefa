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

-- ── M5: the Storage surface 03 §6's bucket policies attach to. ─────────────
-- Supabase creates schema storage, storage.buckets, storage.objects and the
-- path helpers on every project; the M5 migrations insert the six buckets
-- and policy storage.objects with the org-prefix rules (03 §6). A bare
-- container has none of it. Shape, grants and helper bodies mirror local
-- Supabase (introspected 2026-09-14, CLI 2.109.1): the platform grants every
-- privilege on both tables to the client roles and relies on RLS, which is
-- exactly what the prefix policies are tested against. Added by the wave-2
-- lead before the first storage migration, the way DEC-044 added realtime.
create schema if not exists storage;
grant usage on schema storage to anon, authenticated, service_role;

create type storage.buckettype as enum ('STANDARD', 'ANALYTICS', 'VECTOR');

create table storage.buckets (
  id                 text primary key,
  name               text not null,
  owner              uuid,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  public             boolean default false,
  avif_autodetection boolean default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  owner_id           text,
  type               storage.buckettype not null default 'STANDARD'
);
alter table storage.buckets enable row level security;
grant all on storage.buckets to anon, authenticated, service_role;

create table storage.objects (
  id               uuid primary key default gen_random_uuid(),
  bucket_id        text references storage.buckets(id),
  name             text,
  owner            uuid,
  created_at       timestamptz default now(),
  updated_at       timestamptz default now(),
  last_accessed_at timestamptz default now(),
  metadata         jsonb,
  path_tokens      text[] generated always as (string_to_array(name, '/')) stored,
  version          text,
  owner_id         text,
  user_metadata    jsonb
);
alter table storage.objects enable row level security;
grant all on storage.objects to anon, authenticated, service_role;

create function storage.foldername(name text) returns text[]
language plpgsql as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1 : array_length(_parts, 1) - 1];
end $$;
create function storage.filename(name text) returns text
language plpgsql as $$
declare _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[array_length(_parts, 1)];
end $$;
create function storage.extension(name text) returns text
language plpgsql as $$
declare _parts text[]; _filename text;
begin
  select string_to_array(name, '/') into _parts;
  select _parts[array_length(_parts, 1)] into _filename;
  return reverse(split_part(reverse(_filename), '.', 1));
end $$;
grant execute on function storage.foldername(text), storage.filename(text), storage.extension(text)
  to anon, authenticated, service_role;

-- ── M12 (wave 10): the Vault and pgcrypto surface 0140's webhook reads. ─────
-- Supabase creates schema vault, vault.secrets, the vault.decrypted_secrets
-- view and vault.create_secret() on every project (the supabase_vault
-- extension), and exposes pgcrypto's hmac()/digest() in schema extensions.
-- `resend_webhook()` (0140) reads the one secret through the view and verifies
-- the provider's signature with extensions.hmac(); a bare container has
-- neither (CI found this: 42P01, relation "vault.secrets" does not exist).
-- The shim keeps the SHAPE — the same columns, the same view name, the same
-- create_secret() signature, the same closed grants (only service_role may
-- read the table; no client role may read the view) — and stores the secret
-- as plain text, because encryption at rest is the platform's job and the
-- suite asserts who may READ, not how it is stored. Local Supabase is the
-- source of truth; this exists so CI can run the same file at all.
create extension if not exists pgcrypto with schema extensions;
grant execute on all functions in schema extensions to anon, authenticated, service_role;

create schema if not exists vault;
create table vault.secrets (
  id          uuid primary key default gen_random_uuid(),
  name        text unique,
  description text not null default '',
  secret      text not null,
  key_id      uuid,
  nonce       bytea,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create view vault.decrypted_secrets as
  select id, name, description, secret, secret as decrypted_secret, key_id, nonce, created_at, updated_at
    from vault.secrets;
create function vault.create_secret(new_secret text, new_name text default null, new_description text default '', new_key_id uuid default null)
returns uuid language sql security definer as $$
  insert into vault.secrets (secret, name, description, key_id) values (new_secret, new_name, new_description, new_key_id) returning id
$$;
-- The platform's grants: service_role may read and delete; no client role may
-- see the view or the table. The definer body of resend_webhook() reads it.
revoke all on schema vault from public;
grant usage on schema vault to service_role;
grant select, delete on vault.secrets to service_role;
grant select on vault.decrypted_secrets to service_role;
revoke execute on function vault.create_secret(text, text, text, uuid) from public;

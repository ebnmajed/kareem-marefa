-- 0003 — platform foundation: extensions, the tenancy enums, the claim readers.
-- 02-domain-model.md §3 · 03-permissions-rls.md §2 · DEC-014
--
-- Forward-only. Touches nothing that exists: `registrations` (DEC-002) is not
-- referenced here or in any later migration.

create extension if not exists citext with schema extensions;

-- ── Enums. Postgres enum types, never text + check (CLAUDE.md naming). ──────
create type public.org_status     as enum ('active', 'suspended');
create type public.org_role       as enum ('admin', 'moderator', 'member');
create type public.member_status  as enum ('active', 'deactivated');
create type public.numeral_system as enum ('western', 'arabic_indic');
create type public.company_metric as enum ('total_points', 'points_per_active_member');

-- ── Claim readers. STABLE, not VOLATILE: the planner may hoist them. ─────────
-- org_id is an immutable claim (DEC-014): isolation never depends on claim
-- freshness. org_role and status are read-side claims; every privileged write
-- re-reads them from `members` through assert_fresh_admin() (0005).
create function public.auth_org_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
$$;

create function public.auth_member_id() returns uuid
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'member_id', '')::uuid
$$;

create function public.auth_org_role() returns public.org_role
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'org_role', '')::public.org_role
$$;

create function public.auth_claims_version() returns int
language sql stable set search_path = '' as $$
  select nullif(auth.jwt() -> 'app_metadata' ->> 'claims_version', '')::int
$$;

create function public.is_org_admin() returns boolean
language sql stable set search_path = '' as $$
  select public.auth_org_role() = 'admin'
$$;

create function public.is_staff() returns boolean
language sql stable set search_path = '' as $$
  select public.auth_org_role() in ('admin', 'moderator')
$$;

grant execute on function
  public.auth_org_id(), public.auth_member_id(), public.auth_org_role(),
  public.auth_claims_version(), public.is_org_admin(), public.is_staff()
  to authenticated, anon, service_role;

-- ── updated_at, one definition. ─────────────────────────────────────────────
create function public.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

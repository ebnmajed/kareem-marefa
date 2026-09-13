-- 0006 — the Custom Access Token Hook. DEC-014 · 03 §1 · 14-roadmap.md M1 risk ★
--
-- Runs inside Supabase Auth, as supabase_auth_admin, before every token is
-- issued. It is a single point of failure for ALL sign-in, so it obeys three
-- rules that are tested in tests/rls/auth-hook.test.ts:
--
--   1. It NEVER raises. Any error inside returns the event unchanged; a broken
--      hook must look like "no platform claims", never like an auth outage.
--   2. A user with no member row gets the event back unchanged. Sign-in still
--      succeeds; provision_member() decides what happens next.
--   3. It needs THREE grants for supabase_auth_admin — usage on the schema,
--      execute on the function, select on the tables it reads — and execute
--      is revoked from everyone else so no client can mint claims.
--
-- Claims added under app_metadata: org_id (immutable), member_id, org_role,
-- status, claims_version, org_status; platform_admin when applicable.
-- jwt_expiry is 900 s (config.toml locally; the hosted project in PR C).

create function public.custom_access_token_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_uid    uuid;
  v_claims jsonb;
  v_app    jsonb;
  r        record;
  v_pa     boolean := false;
  v_member boolean := false;
begin
  v_uid := (event ->> 'user_id')::uuid;
  if v_uid is null then
    return event;
  end if;

  select m.id, m.org_id, m.org_role, m.status, m.claims_version, o.status as org_status
    into r
    from public.members m
    join public.orgs o on o.id = m.org_id
   where m.auth_user_id = v_uid;
  v_member := found;

  select exists (select 1 from public.platform_admins p where p.auth_user_id = v_uid) into v_pa;

  if not v_member and not v_pa then
    return event;
  end if;

  v_claims := coalesce(event -> 'claims', '{}'::jsonb);
  v_app    := coalesce(v_claims -> 'app_metadata', '{}'::jsonb);

  if v_member then
    v_app := v_app || jsonb_build_object(
      'org_id',         r.org_id,
      'member_id',      r.id,
      'org_role',       r.org_role,
      'status',         r.status,
      'claims_version', r.claims_version,
      'org_status',     r.org_status
    );
  end if;
  if v_pa then
    v_app := v_app || jsonb_build_object('platform_admin', true);
  end if;

  v_claims := jsonb_set(v_claims, '{app_metadata}', v_app, true);
  return jsonb_set(event, '{claims}', v_claims, true);
exception
  when others then
    -- Rule 1. A hook that raises is an outage for every user; a hook that
    -- returns the event unchanged is a member who lands on /no-access and
    -- an alert that fires (12 §5). The latter is recoverable.
    return event;
end $$;

-- Rule 3: the three grants — and nothing for anyone else.
grant usage on schema public to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from public, anon, authenticated;
-- The function is SECURITY DEFINER, so its body runs as its owner and RLS
-- does not bind it; this grant is defence in depth for the hook's own role.
grant select on public.members, public.orgs, public.platform_admins to supabase_auth_admin;

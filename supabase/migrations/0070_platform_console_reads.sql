-- platform (wave 4, M8) — the console's reads. Follows 0001.
--
-- Serves:  REQ-ADM-001 (the console reads what it manages), REQ-ADM-002 (it
--          reads nothing else), REQ-ADM-019, REQ-TEN-006, REQ-TEN-007
-- Cites:   03 §1.4, 03 §5.1, 09 §6 (SCR-080 … 085), DEC-014, DEC-052
--
-- ── Why these exist at all ─────────────────────────────────────────────────
-- A super admin has NO org_id claim, so `orgs_read_own` (0004) gives them zero
-- rows, and `org_domains_read_admin` gives them zero rows — which is correct
-- and is DEC-014 working. But `REQ-ADM-001` requires the console to list orgs,
-- set a first admin and manage allowed domains, so the console needs a door.
--
-- The door is a `security definer` function that calls `assert_platform_admin()`
-- first — the same shape as every write in 0001, and never a policy. What comes
-- back is deliberately narrow: **the org's own row, its domain list, and
-- counts**. No member, no session title, no piece of content (`REQ-ADM-003`),
-- so a super admin who wants to see an org's data still has to impersonate and
-- still leaves a row in that org's audit log.
--
-- ── 03 §8.2 rows this file needs ───────────────────────────────────────────
--   | `RPC-platform_org.platform_only` | An org admin, a moderator, a member and
--     `anon` are all refused `42501`; a platform admin gets the org's own row,
--     its domains and its counts — and no member, title or content field. |
--   | `RPC-platform_impersonations.own` | A platform admin lists their OWN
--     sessions across orgs; another platform admin's do not appear. The org's
--     admins read the same fact through the table's own policy (`REQ-ADM-019`). |
--
-- No table, no policy, no grant to any client role beyond `execute`.

-- ═══════════════════════════════════════════════════════════════════════════
-- platform_org — SCR-080's detail, SCR-081's result, SCR-082's whole screen.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.platform_org(p_org uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare o public.orgs; v_domains jsonb; v_counts jsonb;
begin
  perform public.assert_platform_admin();

  select * into o from public.orgs where id = p_org;
  if o.id is null then
    return null;
  end if;

  select coalesce(jsonb_agg(d.domain::text order by d.domain), '[]'::jsonb)
    into v_domains
    from public.org_domains d where d.org_id = p_org;

  -- Counts only. The metrics view is the one place a column list has to be
  -- read to know what a super admin can see, so this reuses it rather than
  -- growing a second select list nobody diffs (REQ-ADM-003).
  select to_jsonb(m) - 'org_id' - 'name' - 'slug' - 'status' - 'created_at'
    into v_counts
    from public.platform_org_metrics m where m.org_id = p_org;

  return jsonb_build_object(
    'id',                o.id,
    'name',              o.name,
    'slug',              o.slug,
    'status',            o.status,
    'certificatePrefix', o.certificate_prefix,
    'firstAdminEmail',   o.first_admin_email,
    'suspendedAt',       o.suspended_at,
    'suspendedReason',   o.suspended_reason,
    'createdAt',         o.created_at,
    'domains',           v_domains,
    'counts',            coalesce(v_counts, '{}'::jsonb)
  );
end $fn$;
revoke execute on function public.platform_org(uuid) from public, anon;
grant  execute on function public.platform_org(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- platform_impersonations — SCR-085's history, the caller's own sessions only.
-- A super admin cannot audit another super admin here; that is what
-- platform_audit() is for, and both are asserted.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.platform_impersonations(p_limit int default 20)
returns table (
  id uuid, org_id uuid, org_name text, org_slug text, reason text,
  started_at timestamptz, expires_at timestamptz, ended_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $fn$
declare v_admin uuid := public.assert_platform_admin();
begin
  return query
    select s.id, s.org_id, o.name, o.slug, s.reason, s.started_at, s.expires_at, s.ended_at
      from public.impersonation_sessions s
      join public.orgs o on o.id = s.org_id
     where s.platform_admin_id = v_admin
     order by s.started_at desc
     limit greatest(1, least(coalesce(p_limit, 20), 100));
end $fn$;
revoke execute on function public.platform_impersonations(int) from public, anon;
grant  execute on function public.platform_impersonations(int) to authenticated;

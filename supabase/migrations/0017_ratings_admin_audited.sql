-- supabase/proposed/event/02_ratings_admin_rpc.sql
-- The audited path onto per-rater ratings (REQ-RAT-005: "this access is audited").
--
-- 03 §5.6e / migration 0010 already grants org admins a DIRECT select on
-- `ratings` (`ratings_read_admin`, using is_org_admin()) — that policy is
-- untouched here; tests/rls/m2-schema.test.ts (outside this teammate's
-- globs) already asserts it works as written. RLS cannot leave an audit row
-- as a side effect of a plain select, so this function is the path
-- src/lib/dal/ratings.ts actually calls for an admin's per-rater view: it
-- re-checks admin freshness the same way every other privileged write in
-- 0005 does, writes one audit_log row, then returns the rows. See
-- docs/plan/notes/event.md §0 for the honest residual gap (a direct select
-- still bypasses the log) and why narrowing it further is the lead's call.
--
-- Serves: REQ-RAT-005
-- 03 §8.2 row this proves (tests/rls/ratings-audit.test.ts):
--   POL-ratings.select.admin.audited — a fresh admin gets the org's rows for
--   that session plus a matching audit_log row naming them; a moderator and
--   a stale admin are rejected; another org's session is rejected.

create function public.list_session_ratings_admin(p_session uuid)
returns setof public.ratings
language plpgsql security definer set search_path = '' as $$
declare
  actor  public.members := public.assert_fresh_admin();
  v_org  uuid;
begin
  select s.org_id into v_org from public.sessions s where s.id = p_session;
  if v_org is null or v_org <> actor.org_id then
    raise exception 'not_found' using errcode = '42501';
  end if;

  perform public.write_audit(
    actor.org_id, 'ratings.read_admin', 'session', p_session,
    null, null, null, actor.org_role::text, actor.id
  );

  return query
    select r.* from public.ratings r where r.session_id = p_session and r.org_id = actor.org_id;
end $$;

revoke execute on function public.list_session_ratings_admin from public, anon;
grant  execute on function public.list_session_ratings_admin to authenticated;

-- DEC-044: the audited RPC above is the ONLY admin path onto per-rater
-- ratings. 0010's direct admin select left an unaudited read that
-- REQ-RAT-005 forbids; an admin selecting the table now gets zero rows,
-- exactly as a presenter does. The aggregates view is untouched.
drop policy "ratings_read_admin" on public.ratings;

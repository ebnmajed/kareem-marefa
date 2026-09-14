-- supabase/proposed/event/04_rating_count_rpc.sql
-- REQ-RAT-006: "With 1 or 2 ratings the presenter sees the COUNT only, never
-- a value." `session_rating_aggregates` (0010) deliberately withholds the
-- WHOLE row below `org_settings.rating_min_aggregate`
-- (`having count(*) >= rating_min_aggregate`) — exactly right for the
-- averages and the free text, since those are what the anonymity promise
-- protects. But it means there is no way to show the bare count either, and
-- a count alone names nothing and nobody, so this is one narrow additive
-- function, not a change to the view or its test coverage.
--
-- Same audience as the view: staff, or the session's own presenter.
-- SECURITY DEFINER because a non-admin presenter has no SELECT policy on
-- `ratings` at all (POL-ratings.select.presenter is deliberately zero rows)
-- — the audience check is re-implemented inside the function, the same
-- technique the view itself already uses.
--
-- Serves: REQ-RAT-006
-- 03 §8.2 row this proves (tests/rls/ratings-count.test.ts):
--   POL-ratings.count.presenter_or_staff — a presenter with 1 rating gets
--   the number 1 from this function while the aggregate view stays empty;
--   an unrelated member gets 0, never an error, so nothing about the
--   session is inferable from the difference between "0" and "not allowed".

create function public.session_rating_count(p_session uuid) returns int
language sql stable security definer set search_path = '' as $$
  select count(*)::int
    from public.ratings r
   where r.session_id = p_session
     and r.org_id = public.auth_org_id()
     and (public.is_staff() or public.is_presenter_of(r.session_id))
$$;

revoke execute on function public.session_rating_count from public, anon;
grant  execute on function public.session_rating_count to authenticated;

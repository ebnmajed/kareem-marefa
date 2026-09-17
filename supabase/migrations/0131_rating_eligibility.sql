-- event (wave 10, §6) — one definition of «the rating window is open».
--
-- Serves:  REQ-RAT-003, REQ-SUR-003 (the survey's eligibility is the rating's,
--          and there is not a second window to keep in step)
-- Cites:   DEC-160 (sync 1, ruling R1 — this function stays, `rating_eligibility`
--          does not; R2 — it answers about the CALLER's org), 0010 (the two
--          policies, first written), 0087 (the same two, re-created for
--          `removed_at`), 0004 (`org_settings.rating_window_days`)
-- Docs:    docs/plan/notes/event.md "Wave 10 plan" §6
--
-- 03 §8.2 rows this adds (tests/rls/ratings-eligibility.test.ts):
--   | `RPC-rating_window_open.completed_and_inside` | True for a completed session inside `rating_window_days`; false before completion and false the day after the window closes. |
--   | `RPC-rating_window_open.other_org` | False for a session of another org, whatever its state — the function answers about the CALLER's org only. |
--   | `RPC-rating_window_open.not_public` | `anon` cannot execute it; `authenticated` can. |
--   | `POL-ratings.insert.window` | The re-created insert policy still accepts a rating inside the window and refuses one past it — the rule moved into a function, not out of the policy. |
--   | `POL-ratings.update.window` | The re-created update policy still refuses an edit past the window. |
--
-- ── Why this exists ─────────────────────────────────────────────────────────
-- «The session is completed and `now()` is inside the org's rating window» was
-- written out in full TWICE in SQL — the `with check` of `ratings_write_self`
-- and the `using` of `ratings_update_self` — and `submit_survey_response()`
-- would have been a third, in a file where the rule has to agree with the
-- rating's exactly or the survey admits someone the rating refuses. One
-- function, called from all three.
--
-- ★ NOT a rewrite of the DAL. `getRatingEligibility()` keeps deriving the
-- reason in TypeScript: it is the screen's explanation («التقييم متاح بعد
-- انتهاء الجلسة» / «لمن سجّل حضوره» / «أُغلق»), it needs the check-in id and
-- the closing date as well as a boolean, and `tests/unit/sessions-removed-check-in.test.ts`
-- runs it against an in-memory client with no RPC to pin that the DAL itself
-- filters `removed_at` (DEC-141). Turning it into one `.rpc()` call would turn
-- two untouched cases red for no gain the database does not already give.
--
-- ★ WHAT IS NOT IN THE FUNCTION, deliberately: «the supplied `check_in_id` is
-- one of MY active check-ins for this session». That is not the window rule
-- repeated — it binds a COLUMN of the row being written, which no boolean can
-- do, and since wave 9 a member may hold several check-ins on one session (one
-- per day). It stays inside the policy exactly as 0087 wrote it.
--
-- The two policies below are otherwise IDENTICAL to 0087's text: same name,
-- same role, same clauses, same order. The existing cases are the proof
-- (`m2-schema.test.ts` POL-ratings.insert.check_in, 0087's
-- `POL-ratings.write_self_excludes_removed`) and none of them is modified.

create function public.rating_window_open(p_session uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
      from public.sessions s
      join public.org_settings os on os.org_id = s.org_id
     where s.id = p_session
       and s.org_id = public.auth_org_id()          -- R2: the caller's org, never another's
       and s.state = 'completed'
       and now() <= s.completed_at + make_interval(days => os.rating_window_days)
  )
$$;

revoke execute on function public.rating_window_open(uuid) from public, anon;
grant  execute on function public.rating_window_open(uuid) to authenticated;

comment on function public.rating_window_open(uuid) is
  'REQ-RAT-003: the one definition of «this session is completed and the org''s rating window has not closed». Called by ratings_write_self, ratings_update_self and submit_survey_response() — the survey''s window is the rating''s (REQ-SUR-003), and there is not a second one to keep in step.';

-- ── The two policies, re-created to call it ─────────────────────────────────
drop policy "ratings_write_self" on public.ratings;
create policy "ratings_write_self" on public.ratings for insert to authenticated
  with check (org_id = public.auth_org_id()
              and member_id = public.auth_member_id()
              and check_in_id in (select id from public.check_ins c
                                   where c.session_id = ratings.session_id and c.member_id = public.auth_member_id()
                                     and c.removed_at is null)
              and public.rating_window_open(session_id));

drop policy "ratings_update_self" on public.ratings;
create policy "ratings_update_self" on public.ratings for update to authenticated
  using       (org_id = public.auth_org_id() and member_id = public.auth_member_id()
               and public.rating_window_open(session_id))
  with check  (org_id = public.auth_org_id() and member_id = public.auth_member_id());

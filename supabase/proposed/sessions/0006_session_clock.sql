-- proposed by `sessions` (wave 1, M2) — the clock moves sessions, not people
--
-- Serves:  REQ-SES-004, REQ-SES-005, A6 · JOB-start_session, JOB-complete_session (11 §2.1)
-- Cites:   02-domain-model.md §6.2 · 11-background-jobs.md §2.1 · CLAUDE.md invariant:
--          "the worker uses service_role only through SECURITY DEFINER functions"
--
-- 03 §8.2 rows this needs (for the lead to add):
--   | `RPC-clock.service_role_only` | Neither clock function is executable by `authenticated` or
--     `anon`; only the worker's role may call them. |
--   | `RPC-clock.idempotent` | Running either twice moves a session once, and neither ever moves a
--     session backwards: a session an admin started, completed or cancelled early is left alone. |
--   | `RPC-clock.closes_check_in` | Completing a session expires its live check-in codes in the
--     SAME transaction (REQ-CHK-004). |
--
-- ── Why there is no "was this manual?" check ────────────────────────────────
-- 11 §2.1 says start_session "skips any session an admin transitioned
-- manually". The obvious reading — look at the last `session_state_transitions`
-- row and skip it if `is_manual` — would be a BUG here: `publish_session()`
-- writes `is_manual = true` on every publish, because a person published it,
-- so that check would make the clock skip every session in the product.
--
-- The requirement's two acceptance criteria are met by the state filter alone,
-- and more strongly:
--   * "running the job twice moves a session once" — the second run finds no
--     row in the source state.
--   * "a session whose state was overridden by an admin is not moved back" —
--     these queries only ever move FORWARD along 02 §6.2. An admin who started
--     early leaves it `in_progress`, so start finds nothing; one who completed
--     early or cancelled leaves it `completed` or `cancelled`, so neither
--     query matches. There is no path by which the clock reverses a person.
-- `is_manual = false` and a null `actor_id` on these rows is how the audit
-- trail says "the clock did this", which is what that column is for.

-- ── JOB-start_session: published → in_progress at starts_at ─────────────────
-- `setof uuid`, not `table (session_id uuid, …)`: a RETURNS TABLE column named
-- `session_id` is an OUT parameter, and every unqualified `session_id` inside
-- the body — including the one in the transitions INSERT — then resolves
-- ambiguously and the function will not run. The session id is all either
-- caller needs.
create function public.clock_start_sessions(p_now timestamptz default now())
returns setof uuid
language sql security definer set search_path = '' as $$
  with moved as (
    update public.sessions s
       set state = 'in_progress'
     where s.state = 'published'
       and s.starts_at is not null
       and s.starts_at <= p_now
    returning s.id, s.org_id
  ), logged as (
    -- A data-modifying CTE runs whether or not anything selects from it, so
    -- the transition row is written for every moved session; the final select
    -- does not have to join it back.
    insert into public.session_state_transitions (org_id, session_id, from_state, to_state, actor_id, is_manual)
    select m.org_id, m.id, 'published', 'in_progress', null, false from moved m
    returning 1
  )
  select m.id from moved m;
$$;

-- ── JOB-complete_session: in_progress → completed at ends_at ────────────────
-- REQ-CHK-004 lives here rather than in a follow-up job: the check-in window
-- has to close in the SAME transaction as the completion, or there is a gap in
-- which a session is over and its code still works. `check_in_codes` is the
-- `checkin` track's table; this only shortens `valid_until` on codes that are
-- still live, and writes nothing else.
create function public.clock_complete_sessions(p_now timestamptz default now())
returns setof uuid
language sql security definer set search_path = '' as $$
  with moved as (
    update public.sessions s
       set state = 'completed', completed_at = p_now
     where s.state = 'in_progress'
       and s.ends_at is not null
       and s.ends_at <= p_now
    returning s.id, s.org_id
  ), logged as (
    insert into public.session_state_transitions (org_id, session_id, from_state, to_state, actor_id, is_manual)
    select m.org_id, m.id, 'in_progress', 'completed', null, false from moved m
    returning 1
  ), closed as (
    update public.check_in_codes c
       set valid_until = least(c.valid_until, p_now)
      from moved m
     where c.session_id = m.id
       and c.valid_until > p_now
       and c.revoked_at is null
    returning c.id
  )
  select m.id from moved m;
$$;

-- The worker's role and nothing else. `authenticated` never calls these:
-- REQ-SES-005's manual start and complete are a separate admin RPC.
revoke execute on function public.clock_start_sessions(timestamptz), public.clock_complete_sessions(timestamptz) from public, anon, authenticated;
grant  execute on function public.clock_start_sessions(timestamptz), public.clock_complete_sessions(timestamptz) to service_role;

-- wave 9 (DEC-150 contract 6) — the attendance predicate, and the per-day
-- reader behind it.
-- Promoted by the lead from supabase/proposed/scoring/0002_attendance_predicate.sql.
--
-- ★ `session_attendance_complete()` is the ONLY definition of «attended the
-- session» for points and certificates. `has_checked_in()` — any day,
-- unchanged, not mine — stays the definition for rating, photos and a
-- session-scoped «بعد» material. The two answer different questions and
-- wave 9 is where that distinction is made explicit: «may I act on this
-- session?» is any day; «did this member attend the workshop?» is every day.
--
-- ★ `n = 1`: with one day, «an active check-in on every day» and «on any day»
-- are the same sentence, and both equal `has_checked_in()` for that member.
-- There is no branch on the number of days in either function — 1 is a value
-- of n. `RPC-session_attendance_complete.one_day_equals_has_checked_in`
-- asserts it in both directions.
--
-- ★ THE EMPTY DAY SET IS FALSE, NOT VACUOUSLY TRUE. «An active check-in on
-- every day of no days» is true in logic and catastrophic here: it would pay
-- every member of an unscheduled session. 0100's deferred commit check already
-- refuses `session_without_days` at `published` and beyond, so this guard is
-- defence in depth (DEC-151 answer 8) — and it is first, before anything else
-- is read.
--
-- Two authorisation models, on purpose:
--   * session_attendance_complete() is SECURITY DEFINER and revoked from every
--     client role. Its callers are jobs (service_role) and other definer
--     functions — fan_out_certificates(), issue_certificate() — which run as
--     the owner. A member-invoked copy would silently answer `false` for
--     anyone else's attendance: a wrong answer wearing a policy's clothes.
--   * session_attendance() is SECURITY INVOKER and granted to authenticated,
--     because it is a READ and `checkins_read` (0010) already names exactly
--     the right audience — self, staff, or the session's presenter. No new
--     policy, no new grant on a table. A member who asks about someone else
--     sees the day set with `attended` false throughout, which reveals the
--     days (already visible) and nothing about the member.
--
-- Serves:  REQ-SES-017, REQ-CRT-001, REQ-CHK-009 · DEC-119's «POINTS AND
--          CERTIFICATES», DEC-150 contract 6, DEC-151
-- Cites:   0100 (session_days, sessions.require_all_days,
--          check_ins.session_day_id and its per-day unique index),
--          0087 (has_checked_in — excludes a removed check-in; not changed here),
--          0010 (checkins_read — the policy session_attendance() defers to)
-- Docs:    docs/plan/notes/scoring.md "Wave 9 plan" — CONTRACT 6
--
-- 03 §8.2 rows this adds:
--   | `RPC-session_attendance_complete.definer_only` | No client role can call it; only `service_role` and the function owner. |
--   | `RPC-session_attendance_complete.every_day` | With `require_all_days` (the default), an active check-in on EVERY day is required: one missing day, or one removed check-in, makes it false. |
--   | `RPC-session_attendance_complete.any_day` | With `require_all_days = false`, an active check-in on ANY day makes it true. |
--   | `RPC-session_attendance_complete.one_day_equals_has_checked_in` | On a one-day session the predicate agrees with `has_checked_in()` for that member, in both directions and under both settings. |
--   | `RPC-session_attendance_complete.no_days` | A session with no days is false under both settings — never vacuously true. |
--   | `POL-session_attendance.reader` | A member reads their own per-day rows; staff and the session's presenter read any member's; another ordinary member sees every day with `attended` false and learns nothing. |

-- ═══════════════════════════════════════════════════════════════════════════
-- session_attendance_complete — did this member attend the session?
-- ═══════════════════════════════════════════════════════════════════════════
create function public.session_attendance_complete(p_session uuid, p_member uuid)
returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    -- Defence in depth, and first: no days, no attendance.
    when not exists (select 1 from public.session_days d where d.session_id = p_session)
      then false
    when coalesce((select s.require_all_days from public.sessions s where s.id = p_session), true)
      then not exists (
             select 1 from public.session_days d
              where d.session_id = p_session
                and not exists (
                      select 1 from public.check_ins c
                       where c.session_day_id = d.id
                         and c.member_id = p_member
                         and c.removed_at is null))
    else exists (
           select 1 from public.check_ins c
             join public.session_days d on d.id = c.session_day_id
            where d.session_id = p_session
              and c.member_id = p_member
              and c.removed_at is null)
  end
$$;
revoke execute on function public.session_attendance_complete(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.session_attendance_complete(uuid, uuid) to service_role;
comment on function public.session_attendance_complete(uuid, uuid) is
  'DEC-150 contract 6: the ONLY definition of «attended the session» for points and certificates. has_checked_in() (any day) stays the definition for rating, photos and a session-scoped «بعد» material.';

-- ═══════════════════════════════════════════════════════════════════════════
-- session_attendance — one row per day, attended or not, in day order. The
-- missing-day answer for /app/me/points (REQ-SES-017: «the member can see
-- why») and for `checkin`'s attendance screen.
--
-- ★ The output columns are `day_position`, `day_starts_at`, `day_ends_at`,
-- not the column names they carry. `position` is a reserved word in a
-- RETURNS TABLE list (Postgres reads it as `position(x in y)`) and the
-- function will not parse with it; the other two are renamed with it so the
-- three read as one set. Every column reference in the body is table-qualified
-- besides, because RETURNS TABLE's names are parameters in a SQL function and
-- all three exist on session_days.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.session_attendance(p_session uuid, p_member uuid)
returns table (session_day_id uuid, day_position int, day_starts_at timestamptz,
               day_ends_at timestamptz, attended boolean, check_in_id uuid)
language sql stable security invoker set search_path = '' as $$
  select d.id, d.position, d.starts_at, d.ends_at, (c.id is not null), c.id
    from public.session_days d
    left join public.check_ins c
      on c.session_day_id = d.id and c.member_id = p_member and c.removed_at is null
   where d.session_id = p_session
   order by d.position
$$;
revoke execute on function public.session_attendance(uuid, uuid) from public, anon;
grant  execute on function public.session_attendance(uuid, uuid) to authenticated, service_role;
comment on function public.session_attendance(uuid, uuid) is
  'DEC-150 contract 6: one row per day, attended or not. SECURITY INVOKER — checkins_read (0010) decides who may see whose attendance; no new policy.';

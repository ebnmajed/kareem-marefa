-- wave 9 (REQ-SES-017, P4) — «the member can see why».
-- Promoted by the lead from supabase/proposed/scoring/0004_missed_attendance.sql.
--
-- ★ NO LEDGER ROW IS WRITTEN FOR AN AWARD THAT DID NOT HAPPEN. The ledger
-- records points, not explanations (invariant 9), so the missed-day line on
-- /app/me/points cannot come from it. `05` §8 already established the shape
-- this follows: «a capped sixth comment writes no row — but the CAP is
-- explained in place.» A missed day is explained the same way.
--
-- ★ Why a function with NO member parameter. It is SECURITY DEFINER, because
-- it has to call session_attendance_complete() — which is revoked from every
-- client role, and rightly so. A definer function that took a member id would
-- be a hole straight through A33's profile tiering: any member could ask about
-- any other. It takes none, derives the member from the caller's own claims,
-- and therefore cannot be pointed at anyone else. This is the same reason
-- has_checked_in() takes only a session.
--
-- ★ It answers for COMPLETED sessions with MORE THAN ONE DAY only. A one-day
-- session has no such thing as a missed day, so a one-day history is
-- byte-identical: the query returns no rows and the screen renders exactly
-- what it renders today.
--
-- One row per missed day rather than an array per session: the screen groups
-- them, and a set-returning function beats array_agg through PostgREST.
--
-- Serves:  REQ-SES-017, REQ-PTS-003 · `05` §8, DEC-150 contract 6
-- Cites:   scoring/0002 (session_attendance_complete — the one definition),
--          0100 (session_days), 0004 (auth_member_id)
-- Docs:    docs/plan/notes/scoring.md "Wave 9 plan" — the missed-day line
--
-- 03 §8.2 rows this adds:
--   | `RPC-missed_attendance_days.self_only` | The function takes no member and reads the caller's own claims; a member cannot ask about anyone else, and `anon` cannot call it at all. |
--   | `RPC-missed_attendance_days.multi_day_only` | A one-day session never appears, whatever the member did or did not attend. |
--   | `RPC-missed_attendance_days.names_the_missed_day` | A three-day workshop attended on days one and three returns exactly day two, with its position and its start. |
--   | `RPC-missed_attendance_days.silent_when_complete` | A workshop attended in full returns nothing — there is nothing to explain. |

create function public.missed_attendance_days()
returns table (session_id uuid, session_title text, session_completed_at timestamptz,
               day_count int, day_position int, day_starts_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select s.id,
         s.title,
         s.completed_at,
         (select count(*)::int from public.session_days dd where dd.session_id = s.id),
         d.position,
         d.starts_at
    from public.sessions s
    join public.session_days d on d.session_id = s.id
   where s.org_id = public.auth_org_id()
     and s.state in ('completed', 'archived')
     -- More than one day, or there is no such thing as a missed one.
     and (select count(*) from public.session_days dd where dd.session_id = s.id) > 1
     -- The member turned up for something: an absence is not explained here,
     -- only an attendance that did not earn its award.
     and exists (select 1 from public.check_ins c
                  where c.session_id = s.id and c.member_id = public.auth_member_id()
                    and c.removed_at is null)
     -- …and it did not earn it. One definition, contract 6's.
     and not public.session_attendance_complete(s.id, public.auth_member_id())
     -- the days they missed
     and not exists (select 1 from public.check_ins c
                      where c.session_day_id = d.id and c.member_id = public.auth_member_id()
                        and c.removed_at is null)
   order by s.completed_at desc, d.position
$$;
revoke execute on function public.missed_attendance_days() from public, anon;
grant  execute on function public.missed_attendance_days() to authenticated;
comment on function public.missed_attendance_days() is
  'REQ-SES-017: the missed-day line on /app/me/points. Definer with NO member parameter — it reads the caller''s own claims and cannot be pointed at anyone else.';

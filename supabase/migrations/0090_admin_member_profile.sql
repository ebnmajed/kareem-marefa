-- wave 7 (DEC-141 ruling 4b) · sessions — admin_member_profile(uuid): the admin
-- tier of SCR-020, the member profile, for ONE member.
--
-- Serves:  REQ-PRF-004 (A33 — the admin tier), REQ-PRF-005, SCR-020
-- Cites:   0004 (the column grant IS the member tier; `email` is outside it for
--          every reader), 0056 (admin_list_members — this is its shape, for
--          one row and with the attendance record), 03 §5.1b ("the additional
--          admin columns are read through an admin-gated function"),
--          checkin/04_attendance_removal.sql (`check_ins.removed_at`)
--
-- ★ WHY A FUNCTION. A33 gives an org admin a member's email, the sessions they
-- attended, and their no-show and late-cancellation record; a member sees none
-- of it about anyone else. `email` is outside `authenticated`'s column grant
-- for every reader, admin included, and a policy cannot condition on WHICH
-- role reads a column — so, as 0056 reasoned for the list, a definer function
-- is the only door, and its return type is the allowlist.
--
-- ★ THE GATE IS `is_org_admin()`, NOT `is_staff()`. A moderator reads the
-- member tier (A33); `check_ins` and `rsvps` would let a moderator count
-- attendance through RLS (`checkins_read` and `rsvps_read` admit staff), so
-- the function is where the admin-only line is drawn, and the DAL never reads
-- those tables for this screen. It is STABLE and claim-checked, as 0056 is: a
-- read, not a privileged write. A non-admin, or a member of another org, gets
-- ZERO rows — nothing to be told about.
--
-- ★ «ATTENDED» EXCLUDES A REMOVED CHECK-IN (REQ-CHK-017). `checkin`'s
-- `04_attendance_removal.sql` soft-deletes with `check_ins.removed_at`; every
-- reader of "did this member attend" must say `removed_at is null`. This file
-- therefore DEPENDS on that one and is promoted after it.
--
-- No-shows are derived, not stored as a count: a CONFIRMED reservation on a
-- session that has ended (`completed` or `archived`) with no active check-in —
-- the same fact `evaluate_no_shows` awards on. Late cancellations are the
-- reservations `cancel_rsvp()` marked `late_cancelled`.
--
-- 03 §8.2 rows this adds:
--   | `RPC-admin_member_profile.admin_only` | An admin of the member's org gets one row; a moderator, a member (including the member themselves) and an admin of another org get zero rows. |
--   | `RPC-admin_member_profile.fields` | The row carries exactly email, attended_count, attended, no_show_count, late_cancel_count. |
--   | `RPC-admin_member_profile.removed_excluded` | A removed check-in is neither counted nor listed as attended, and turns a confirmed reservation on an ended session into a no-show. |

create function public.admin_member_profile(p_member uuid)
returns table (
  email              extensions.citext,
  attended_count     int,
  attended           jsonb,
  no_show_count      int,
  late_cancel_count  int
)
language sql stable security definer set search_path = '' as $$
  select
    m.email,
    (select count(*)::int
       from public.check_ins c
       join public.sessions s on s.id = c.session_id
      where c.member_id = m.id and c.org_id = m.org_id and c.removed_at is null),
    coalesce(
      (select jsonb_agg(jsonb_build_object('session_id', a.id, 'title', a.title, 'starts_at', a.starts_at) order by a.starts_at desc)
         from (select s.id, s.title, s.starts_at
                 from public.check_ins c
                 join public.sessions s on s.id = c.session_id
                where c.member_id = m.id and c.org_id = m.org_id and c.removed_at is null
                order by s.starts_at desc
                limit 50) a),
      '[]'::jsonb),
    (select count(*)::int
       from public.rsvps r
       join public.sessions s on s.id = r.session_id
      where r.member_id = m.id and r.org_id = m.org_id
        and r.status = 'confirmed'
        and s.state in ('completed', 'archived')
        and not exists (select 1 from public.check_ins c
                         where c.session_id = r.session_id and c.member_id = m.id and c.removed_at is null)),
    (select count(*)::int
       from public.rsvps r
      where r.member_id = m.id and r.org_id = m.org_id and r.status = 'late_cancelled')
    from public.members m
   where m.id = p_member
     and m.org_id = public.auth_org_id()
     and public.is_org_admin()
$$;
revoke execute on function public.admin_member_profile(uuid) from public, anon;
grant  execute on function public.admin_member_profile(uuid) to authenticated;

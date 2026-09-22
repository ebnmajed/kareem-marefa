-- wave 12 (REQ-CHK-018, REQ-PTS-015, DEC-172, DEC-174) — contract 1: the
-- caller's pending attendance award for one session, COMPUTED and never stored.
--
-- ★ WHY A FUNCTION AND NOT A COLUMN. Since DEC-172 nothing a session earns is
-- written before the session completes, so the ledger row the member used to
-- see at check-in no longer exists at check-in. A «pending» row in any table
-- would be a second source of truth for a balance invariant 9 exists to keep
-- recomputable. This reads the rules, the days, the check-ins and the ledger
-- and writes nothing.
--
-- ★ ONE CONDITION IN ONE PLACE (checkin's correction at sync 1). `pending`
-- promises the amount the completion pass will write, so every condition that
-- stops award_points() from writing an attendance award must also stop this
-- from saying `pending`. The presenter bar is the one that could drift, so it
-- is a function both call: attendance_award_barred(). The timing, the
-- predicate and the standing award are the functions award_points() already
-- calls — session_attendance_complete(), and the ledger read below is the same
-- «no reversal names it» shape.
--
-- Serves:  REQ-CHK-018, REQ-PTS-015, REQ-PTS-001, REQ-SES-017, REQ-CHK-011
-- Cites:   0107 (session_attendance_complete), 0101 (check_in_ceiling),
--          0113 (the standing-award shape), 0114 (missed_attendance_days — the
--          caller-only definer shape this copies)
-- Docs:    docs/plan/notes/scoring.md "Wave 12 plan", CONTRACT 1
--
-- 03 §8.2 rows this adds:
--   | `RPC-session_award_state.caller_only` | Takes no member; reads the caller's claims; another org's session returns zero rows; `anon` cannot execute it. |
--   | `RPC-session_award_state.none` | No active check-in, a removed one, a disabled or zero-point rule, a cancelled session, or an accepted presenter → `none`. |
--   | `RPC-session_award_state.pending_before_completion` | Checked in on a running session → `pending` with the rule's points and the days attended, required and counted. |
--   | `RPC-session_award_state.paid_when_standing` | An attendance award that no reversal names → `paid` with its amount, before or after completion. |
--   | `RPC-session_award_state.incomplete` | After completion with the predicate false, or before it once a required day's ceiling has passed unattended → `incomplete`, naming those days in order. |
--   | `RPC-session_award_state.agrees_with_award_points` | `pending` on a completed session if and only if the completion pass writes the award. |
--   | `RPC-session_award_state.writes_nothing` | The ledger and the queue are identical before and after a call. |
--   | `RPC-attendance_award_barred.service_role_only` | No client role can execute the shared presenter bar. |

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · the presenter bar — one definition, called by award_points() (0002) and
-- by session_award_state() below.
--
-- REQ-CHK-011: a presenter does not attend their own session. check_in() and
-- mark_checked_in_manually() refuse an ACCEPTED presenter, but a member can
-- check in first and become an accepted presenter afterwards — through the
-- owner's data fix, a direct insert under p2_admin_insert, or (until the
-- lead's L3) the presenter's own update of `accepted`. The award is decided at
-- completion, so asking this THEN closes every one of those routes for a
-- change made before completion (DEC-174 ruling 3's measurement).
-- ═══════════════════════════════════════════════════════════════════════════
create function public.attendance_award_barred(p_session uuid, p_member uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.session_presenters sp
     where sp.session_id = p_session and sp.member_id = p_member
       and sp.accepted and sp.declined_at is null
  )
$$;
revoke execute on function public.attendance_award_barred(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.attendance_award_barred(uuid, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · session_award_state — the caller, one session, one row
-- ═══════════════════════════════════════════════════════════════════════════
create function public.session_award_state(p_session uuid)
returns table (
  state          text,
  points         int,
  days_attended  int,
  days_required  int,
  day_count      int,
  missed_days    jsonb
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_member   uuid := public.auth_member_id();
  s          public.sessions;
  r          public.scoring_rules;
  v_paid     int;
  v_days     int;
  v_attended int;
  v_required int;
  v_ended    boolean;
  v_missed   jsonb;
begin
  -- Not visible: zero rows. Another org's session and no session at all read
  -- the same, so this is not a way to learn whether an id exists.
  select * into s from public.sessions where id = p_session and org_id = public.auth_org_id();
  if not found or v_member is null then
    return;
  end if;

  select count(*)::int into v_days from public.session_days d where d.session_id = s.id;
  select count(distinct c.session_day_id)::int into v_attended
    from public.check_ins c
   where c.session_id = s.id and c.member_id = v_member and c.removed_at is null;
  v_required := case when s.require_all_days then v_days else least(v_days, 1) end;

  -- Row 1 — an award stands. First, so an award paid at check-in before
  -- DEC-172 reads as what it is.
  select sum(a.amount)::int into v_paid
    from public.points_ledger a
   where a.member_id = v_member and a.session_id = s.id and a.source = 'check_in'
     and not exists (select 1 from public.points_ledger rv
                      where rv.source = 'reversal' and rv.source_id = a.id);
  if v_paid is not null then
    return query select 'paid'::text, v_paid, v_attended, v_required, v_days, '[]'::jsonb;
    return;
  end if;

  -- Row 2 — nothing can be earned here.
  select * into r from public.scoring_rules where org_id = s.org_id and action_key = 'check_in';
  if s.state = 'cancelled' or r.id is null or not r.enabled or r.points <= 0
     or public.attendance_award_barred(s.id, v_member) then
    return query select 'none'::text, 0, v_attended, v_required, v_days, '[]'::jsonb;
    return;
  end if;

  -- Row 3 — not checked in (never, or every check-in removed).
  if v_attended = 0 then
    return query select 'none'::text, 0, v_attended, v_required, v_days, '[]'::jsonb;
    return;
  end if;

  -- Row 4 — it can no longer be earned. After completion the predicate
  -- decides; before it, a required day whose ceiling (check_in_ceiling(), the
  -- lead's one definition) has passed unattended. An admin may still mark that
  -- day (REQ-CHK-017 has no ceiling for an admin), so this can return to
  -- `pending` — which is right, because it is read from the data every time.
  v_ended := s.state in ('completed', 'archived');
  select coalesce(jsonb_agg(jsonb_build_object('position', d.position, 'starts_at', d.starts_at)
                            order by d.position), '[]'::jsonb)
    into v_missed
    from public.session_days d
   where d.session_id = s.id
     and not exists (select 1 from public.check_ins c
                      where c.session_day_id = d.id and c.member_id = v_member and c.removed_at is null)
     and (v_ended or now() >= public.check_in_ceiling(d.id));

  if (v_ended and not public.session_attendance_complete(s.id, v_member))
     or (not v_ended and s.require_all_days and jsonb_array_length(v_missed) > 0) then
    return query select 'incomplete'::text, 0, v_attended, v_required, v_days, v_missed;
    return;
  end if;

  -- Row 5 — checked in, and the completion pass has not paid yet: the amount
  -- award_points() will write under the rule as it stands.
  return query select 'pending'::text, r.points, v_attended, v_required, v_days, '[]'::jsonb;
end $$;
revoke execute on function public.session_award_state(uuid) from public, anon;
grant  execute on function public.session_award_state(uuid) to authenticated;
comment on function public.session_award_state(uuid) is
  'REQ-CHK-018 / contract 1: the CALLER''s attendance award for one session — none, pending, paid or incomplete. Computed, never stored; takes no member.';

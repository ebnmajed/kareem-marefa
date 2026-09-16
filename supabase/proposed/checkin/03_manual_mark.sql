-- wave 7 (DEC-141) — mark_checked_in_manually() gains the manual-mark
-- window ruling and a pre-existing gap is fixed on the way.
--
-- Per-role window, branching on the ACTOR calling the RPC — not on which
-- screen calls it, since the host view (SCR-016) and the admin console
-- (SCR-044) both call this same function:
--   · admin    — floor only (`now >= starts_at`), no ceiling. REQ-CHK-017's
--                "at any time" — this is the escape hatch that makes a
--                default-open switch safe, so it isn't bound by the code
--                RPCs' 2h grace. `archived` is included (flagged in
--                docs/plan/notes/checkin.md as my own addition, not
--                literally in DEC-141's ruling 1's state list): SCR-044 is a
--                reconciliation screen an admin may visit long after
--                archiving.
--   · moderator — REQ-CHK-008's original scope: the same three-state family
--                and floor/ceiling as check_in()/ensure_check_in_code().
-- Neither role's manual mark is gated by `check_in_open` (0001's file) — a
-- staff override of the door should not be blocked by the door itself.
--
-- ★ Finding, fixed inline (docs/plan/notes/checkin.md §1, "not a question"):
-- `mark_checked_in_manually()` never enqueued `award_points` at all — unlike
-- `check_in()` (enqueues inline) and unlike ratings/comments/proposals
-- (award via an AFTER INSERT/UPDATE trigger), a manual mark produced a
-- `check_ins` row and certificate eligibility but ZERO points, against
-- REQ-CHK-008's "grants exactly the same rights as a code check-in." Fixed
-- with the identical `enqueue_job('award_points', ...)` call `check_in()`
-- already makes, same idempotency key shape (`pts:check_in:<ci.id>`).
--
-- Serves:  REQ-CHK-008, REQ-CHK-017
-- Cites:   0015 (mark_checked_in_manually, re-created), 0028 (award_points
--          enqueue shape, mirrored)
-- Docs:    docs/plan/notes/checkin.md "Wave 7 plan" §1 item 8, DEC-141 ruling 6
--
-- 03 §8.2 rows this adds:
--   | `RPC-mark_checked_in_manually.window` | An admin marks a member present any time after the scheduled start, including on an archived session; a moderator is refused outside the code family's floor/ceiling; both are refused on a cancelled session. |
--   | `RPC-mark_checked_in_manually.award_points` | A manual mark enqueues exactly one `award_points` job, keyed `pts:check_in:<check_in.id>` — the same key shape a code check-in uses. |

create or replace function public.mark_checked_in_manually(p_session uuid, p_member uuid, p_reason text) returns public.check_ins
language plpgsql security definer set search_path = '' as $$
declare
  m public.members := public.assert_active_member();
  s public.sessions;
  ci public.check_ins;
  existing public.check_ins;
  v_conflict uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '23514';
  end if;
  if m.org_role not in ('admin', 'moderator') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into s from public.sessions where id = p_session for update;
  if not found or s.org_id <> m.org_id then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if m.org_role = 'admin' then
    if s.state = 'cancelled' or s.starts_at is null or now() < s.starts_at then
      raise exception 'not_open' using errcode = '23514';
    end if;
  else -- moderator
    if s.state not in ('published', 'in_progress', 'completed')
       or s.starts_at is null or s.ends_at is null
       or now() < s.starts_at
       or now() >= s.ends_at + interval '2 hours' then
      raise exception 'not_open' using errcode = '23514';
    end if;
  end if;

  if not exists (select 1 from public.members where id = p_member and org_id = s.org_id) then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if exists (
    select 1 from public.session_presenters
     where session_id = p_session and member_id = p_member and accepted
  ) then
    raise exception 'presenter_cannot_check_in' using errcode = '23514';   -- REQ-CHK-011 applies to manual too
  end if;

  select * into existing from public.check_ins where session_id = p_session and member_id = p_member;
  if found then
    return existing;                                                       -- REQ-CHK-005
  end if;

  begin
    insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
    values (s.org_id, p_session, p_member, 'manual', btrim(p_reason), m.id, tstzrange(s.starts_at, s.ends_at, '[)'))
    returning * into ci;
  exception when exclusion_violation then
    select session_id into v_conflict from public.check_ins
     where member_id = p_member and session_window && tstzrange(s.starts_at, s.ends_at, '[)')
     limit 1;
    raise exception 'overlapping_session:%', v_conflict using errcode = '23P01';
  end;

  perform public.write_audit(s.org_id, 'check_in.manual', 'check_in', ci.id, null,
           jsonb_build_object('member_id', p_member, 'reason', p_reason), p_reason, null, m.id);

  -- ★ the fix: mirrors check_in()'s own enqueue, same key shape.
  perform public.enqueue_job(
    'award_points',
    jsonb_build_object('rule', 'check_in', 'member_id', p_member, 'source', 'check_in',
                        'source_id', ci.id, 'session_id', s.id),
    'pts:check_in:' || ci.id
  );

  return ci;
end $$;
revoke execute on function public.mark_checked_in_manually(uuid, uuid, text) from public, anon;
grant  execute on function public.mark_checked_in_manually(uuid, uuid, text) to authenticated;

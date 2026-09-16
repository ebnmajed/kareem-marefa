-- wave 7 (DEC-141) — check-in is opened and closed by hand (REQ-CHK-015),
-- open by default, with a hard two-hour ceiling after the session's
-- SCHEDULED end (REQ-CHK-016). Supersedes 0078/0079's state-based gate
-- (`s.state <> 'in_progress'`) with a clock-derived floor/ceiling, plus the
-- three-state family DEC-141 ruling 1 adds so a clock-only gate can't accept
-- a code on a cancelled session whose scheduled start has passed.
--
-- ★ Does NOT touch `check_ins` itself — the soft-delete columns and the
-- removal-aware re-creation of check_in()/mark_checked_in_manually() are
-- file 04's, applied after this one (the same sequential-re-create pattern
-- 0015 → 0028 → 0079 already used for check_in() three times over).
--
-- Serves:  REQ-CHK-004 (amended), REQ-CHK-015, REQ-CHK-016
-- Cites:   0010 (sessions), 0015/0028/0079 (check_in, ensure_check_in_code —
--          re-created here), DEC-113, DEC-115, DEC-116, DEC-141
-- Docs:    docs/plan/notes/checkin.md "Wave 7 plan" §2, "DEC-141 applied"
--
-- 03 §8.2 rows this adds:
--   | `RPC-check_in.floor` | A code entered before the session's scheduled start is refused `not_started`, clock-derived, independent of `state`. |
--   | `RPC-check_in.ceiling` | A code entered at or after `ends_at + 2h` is refused `session_ended`, computed from the SCHEDULED end, not from when the session actually finished. |
--   | `RPC-check_in.switch_closed` | Inside the window, with `check_in_open = false`, a correct code is refused `check_in_closed` — never revealing whether it was right. |
--   | `RPC-check_in.attendance_states` | A `draft`/`approved`/`cancelled`/`archived` session refuses `not_started` regardless of the clock. |
--   | `RPC-set_check_in_open.role_set` | A plain member is refused; the session's own accepted presenter, any moderator, any admin succeed; a presenter of a DIFFERENT session is refused. |
--   | `RPC-set_check_in_open.ceiling` | Opening (not closing) past `ends_at + 2h` is refused; closing is always allowed. |
--   | `RPC-set_check_in_open.audited` | Every open and close writes an audit row naming who and when. |
--   | `RPC-ensure_check_in_code.floor_ceiling` | Mirrors `check_in()`'s own floor/ceiling/state gate — supersedes 0078's `RPC-ensure_check_in_code.only_live`. |

alter table public.sessions add column check_in_open boolean not null default true;
comment on column public.sessions.check_in_open is
  'DEC-141/REQ-CHK-015: defaults open. Closing stops admitting new check-ins and revokes nothing already recorded (DEC-115).';

-- ═══════════════════════════════════════════════════════════════════════════
-- set_check_in_open — REQ-CHK-015. The session's own accepted presenters,
-- any moderator, any admin. REQ-CHK-016: the ceiling refuses an OPEN past
-- it; closing is always allowed, at any time.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.set_check_in_open(p_session uuid, p_open boolean) returns public.sessions
language plpgsql security definer set search_path = '' as $$
declare
  actor  public.members := public.assert_active_member();
  target public.sessions;
begin
  select * into target from public.sessions where id = p_session and org_id = actor.org_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (public.is_presenter_of(p_session) or public.is_staff()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if target.state not in ('published', 'in_progress', 'completed') then
    raise exception 'not_open' using errcode = 'P0001';               -- DEC-141 ruling 1
  end if;
  if p_open and target.ends_at is not null and now() >= target.ends_at + interval '2 hours' then
    raise exception 'ceiling_passed' using errcode = 'P0001';         -- REQ-CHK-016: a forged request past it is refused
  end if;

  if target.check_in_open is distinct from p_open then
    update public.sessions set check_in_open = p_open where id = target.id returning * into target;
    perform public.write_audit(actor.org_id, 'session.check_in_open_changed', 'session', target.id,
                               jsonb_build_object('check_in_open', not p_open),
                               jsonb_build_object('check_in_open', p_open),
                               null, actor.org_role::text, actor.id);
  end if;
  return target;
end $$;
revoke execute on function public.set_check_in_open(uuid, boolean) from public, anon;
grant  execute on function public.set_check_in_open(uuid, boolean) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- ensure_check_in_code — re-created. Same floor/ceiling/state family as
-- check_in() below, replacing 0078's `state <> 'in_progress'` gate. The
-- switch (`check_in_open`) does NOT gate issuance — the host view may still
-- show a valid, rotating code while closed, so staff can see what reopening
-- would accept (checkin.md §2).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.ensure_check_in_code(p_session uuid) returns public.check_in_codes
language plpgsql security definer set search_path = '' as $$
declare s public.sessions;
begin
  select * into s from public.sessions where id = p_session;
  if not found or s.org_id <> public.auth_org_id() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (public.is_presenter_of(p_session) or public.is_staff()) then
    raise exception 'not_authorized' using errcode = '42501';         -- REQ-CHK-014 / OQ-013
  end if;
  if s.state not in ('published', 'in_progress', 'completed')
     or s.starts_at is null or s.ends_at is null
     or now() < s.starts_at
     or now() >= s.ends_at + interval '2 hours' then
    raise exception 'not_open' using errcode = 'P0001';               -- DEC-141: floor/ceiling/state, at issuance
  end if;
  return public._issue_check_in_code(p_session);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- check_in — re-created. DEC-141: the floor/ceiling/state family replaces
-- the state-based gate; `check_in_open` is a new refusal, `check_in_closed`,
-- distinct from "not started"/"ended" and checked AFTER the window (a
-- member outside the window gets the more specific `not_started`/
-- `session_ended` answer) and BEFORE the walk-in door (closed takes
-- precedence — there is nothing to be a walk-in INTO if the door is shut).
-- Everything else is copied verbatim from 0079 — this is a hook on the
-- window, not a rewrite of an RPC `checkin` already owns.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.check_in(p_session uuid, p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m public.members := public.assert_active_member();
  s public.sessions;
  c public.check_in_codes;
  v_recent int;
  v_code text := upper(btrim(coalesce(p_code, '')));
  ci public.check_ins;
  existing public.check_ins;
  v_conflict uuid;
begin
  select * into s from public.sessions where id = p_session;
  if not found or s.org_id <> m.org_id then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if public.is_presenter_of(p_session) then
    return jsonb_build_object('status', 'presenter_cannot_check_in');      -- REQ-CHK-011 / OQ-025
  end if;

  -- REQ-CHK-005: a second attempt by an already-checked-in member is a
  -- no-op reporting the existing check-in.
  select * into existing from public.check_ins where session_id = p_session and member_id = m.id;
  if found then
    return jsonb_build_object('status', 'already_checked_in', 'check_in', to_jsonb(existing));
  end if;

  -- REQ-CHK-006 / DEC-015: the attempt row is written BEFORE the limit is
  -- checked, so a request that trips the limit still counts toward it.
  select count(*) into v_recent from public.check_in_attempts
   where session_id = p_session and member_id = m.id
     and attempted_at > now() - interval '10 minutes';

  insert into public.check_in_attempts (org_id, session_id, member_id, submitted_code, succeeded)
  values (s.org_id, p_session, m.id, v_code, false);

  if v_recent >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- DEC-141: the floor/ceiling/state family, clock-derived — supersedes
  -- `s.state <> 'in_progress'`. REQ-CHK-004's "which of not-started/ended,
  -- without revealing whether the code was right" is unchanged.
  if s.state not in ('published', 'in_progress', 'completed') or s.starts_at is null or s.ends_at is null then
    return jsonb_build_object('status', 'not_started');
  elsif now() < s.starts_at then
    return jsonb_build_object('status', 'not_started');
  elsif now() >= s.ends_at + interval '2 hours' then
    return jsonb_build_object('status', 'session_ended');
  end if;

  -- REQ-CHK-015: the switch. Checked after the window (a more specific
  -- refusal already applies outside it) and before the walk-in door.
  if not s.check_in_open then
    return jsonb_build_object('status', 'check_in_closed');
  end if;

  -- DEC-065/REQ-CHK-010: the door policy. Checked before the code so a
  -- refused member learns nothing about it.
  if not s.allow_walk_ins and not exists (
    select 1 from public.rsvps r where r.session_id = p_session and r.member_id = m.id and r.status = 'confirmed'
  ) then
    return jsonb_build_object('status', 'reservation_required');
  end if;
  select * into c from public.check_in_codes
   where session_id = p_session and code = v_code
     and revoked_at is null and now() between valid_from and valid_until;
  if c is null then
    return jsonb_build_object('status', 'invalid_code');
  end if;

  begin
    insert into public.check_ins (org_id, session_id, member_id, method, code_id, session_window)
    values (s.org_id, p_session, m.id, 'code', c.id, tstzrange(s.starts_at, s.ends_at, '[)'))
    returning * into ci;
  exception when exclusion_violation then
    select session_id into v_conflict from public.check_ins
     where member_id = m.id and session_window && tstzrange(s.starts_at, s.ends_at, '[)')
     limit 1;
    return jsonb_build_object('status', 'overlap', 'conflict_session_id', v_conflict);
  end;

  update public.check_in_attempts set succeeded = true
   where id = (
     select id from public.check_in_attempts
      where session_id = p_session and member_id = m.id
      order by attempted_at desc
      limit 1
   );

  perform public.enqueue_job(
    'award_points',
    jsonb_build_object('rule', 'check_in', 'member_id', m.id, 'source', 'check_in',
                        'source_id', ci.id, 'session_id', s.id),
    'pts:check_in:' || ci.id
  );
  return jsonb_build_object('status', 'ok', 'check_in', to_jsonb(ci));
end $$;
revoke execute on function public.check_in(uuid, text) from public, anon;
grant  execute on function public.check_in(uuid, text) to authenticated;

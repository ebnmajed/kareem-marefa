-- Launch, post-launch (the owner's decision, 2026-09-15, DEC-065) — walk-in check-in is a
-- per-session switch that staff turn on; off, only a member with a confirmed reservation can
-- check in.
--
-- REQ-CHK-010 shipped walk-ins unconditionally (D24, OQ-005: capacity is a planning limit, not a
-- door policy). The owner runs the rooms and wants the door policy: by default a code is accepted
-- only from a member whose reservation is `confirmed`; an admin or a moderator may open a session
-- to walk-ins from the host view. Everything else about a check-in is unchanged — a walk-in on an
-- opened session still earns every attendance right, and is still distinguishable in reporting
-- (no rsvp row).
--
-- Serves:  REQ-CHK-010 (as amended by DEC-065), REQ-CHK-003, REQ-CHK-014
-- Cites:   0010 (sessions, rsvps), 0015 (check_in), 0021 (write_audit usage)
--
-- 03 §8.2 rows this adds:
--   | `RPC-check_in.reservation_required` | With `allow_walk_ins` off, a member with no confirmed
--     reservation gets `reservation_required` — the attempt is recorded, the code is not revealed as
--     right or wrong; with it on, the same member checks in. |
--   | `RPC-set_session_walk_ins.staff` | A member and a presenter are refused `42501`; an admin
--     and a moderator flip the flag, audited as `session.walk_ins_changed`. |

alter table public.sessions add column allow_walk_ins boolean not null default false;
comment on column public.sessions.allow_walk_ins is
  'DEC-065: when false, check_in() accepts a code only from a member with a confirmed reservation.';

create function public.set_session_walk_ins(p_session uuid, p_allow boolean) returns public.sessions
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_active_member();
  target public.sessions;
begin
  if not public.is_staff() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into target from public.sessions where id = p_session and org_id = actor.org_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if target.allow_walk_ins is distinct from p_allow then
    update public.sessions set allow_walk_ins = p_allow where id = target.id returning * into target;
    perform public.write_audit(actor.org_id, 'session.walk_ins_changed', 'session', target.id,
                               jsonb_build_object('allow_walk_ins', not p_allow),
                               jsonb_build_object('allow_walk_ins', p_allow),
                               null, actor.org_role::text, actor.id);
  end if;
  return target;
end $$;
revoke execute on function public.set_session_walk_ins(uuid, boolean) from public, anon;
grant  execute on function public.set_session_walk_ins(uuid, boolean) to authenticated;

-- check_in — re-created from its CURRENT definition (0028, which added the award_points enqueue to
-- 0015's body) with the reservation rule after the window check: «not started» and «ended» still
-- come first, the attempt row and the rate limit are untouched (DEC-015), and the enqueue stays.
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
  -- no-op reporting the existing check-in — not an error, not a duplicate.
  -- `already_checked_in` is its own status (09 SCR-014's states table: "أنت
  -- مسجَّل بالفعل" reads differently from a fresh "تم تسجيل حضورك").
  select * into existing from public.check_ins where session_id = p_session and member_id = m.id;
  if found then
    return jsonb_build_object('status', 'already_checked_in', 'check_in', to_jsonb(existing));
  end if;

  -- REQ-CHK-006 / DEC-015: the attempt row is written BEFORE the limit is
  -- checked, so a request that trips the limit still counts toward it —
  -- and, per the header above, every path from here on returns rather
  -- than raises, so this insert is never rolled back by what follows.
  select count(*) into v_recent from public.check_in_attempts
   where session_id = p_session and member_id = m.id
     and attempted_at > now() - interval '10 minutes';

  insert into public.check_in_attempts (org_id, session_id, member_id, submitted_code, succeeded)
  values (s.org_id, p_session, m.id, v_code, false);

  if v_recent >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- REQ-CHK-004: says which of "not started" / "ended" without revealing
  -- whether the code itself was correct — the code is never even checked
  -- when the window is wrong.
  if s.state <> 'in_progress' then
    if s.starts_at is not null and now() < s.starts_at then
      return jsonb_build_object('status', 'not_started');
    elsif s.ends_at is not null and now() > s.ends_at then
      return jsonb_build_object('status', 'session_ended');
    else
      return jsonb_build_object('status', 'not_open');
    end if;
  end if;

  -- DEC-065: the door policy. Checked before the code so a refused member learns nothing about it.
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
    -- A savepoint scoped to just this INSERT (PL/pgSQL's own BEGIN/EXCEPTION
    -- block) — everything before it, including the attempt row, stands.
    -- REQ-CHK-013: name the conflicting session rather than a bare constraint error.
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

  -- STORY-PTS-001 (was TODO(scoring, M4)): enqueue, never award inline —
  -- the check-in returns as soon as its own row commits (11 §2.3).
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

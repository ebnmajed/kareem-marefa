-- checkin/02_check_in.sql — check-in codes and the check-in RPC (03 §5.4,
-- STORY-CHK-001..006, DEC-015).
-- REQ-CHK-001 .. REQ-CHK-014.
--
-- `03` §8.2 rows: POL-check_in_codes.select.member, POL-check_in_codes.select.presenter,
-- POL-check_ins.insert.rpc, POL-check_ins.rate_limit, POL-check_ins.window,
-- POL-check_ins.revoked, POL-check_ins.single_use, POL-check_ins.overlap,
-- POL-check_ins.presenter, POL-check_ins.select.member, POL-check_in_attempts.select.staff.
--
-- Job enqueueing intentionally NOT here yet — see 01_rsvp.sql's header.
-- `award_points` (scoring, M4) is a TODO at the exact call site.

-- ═══════════════════════════════════════════════════════════════════════════
-- _issue_check_in_code — the private core. No grants: only called from the
-- two public wrappers below, as their SECURITY DEFINER owner. Deciding
-- "is the latest code still current" here, once, is what keeps rotation
-- lazy (no cron dependency to demonstrate M2 locally) while still being
-- exactly what JOB-rotate_check_in_code calls on a real schedule at M3.
-- ═══════════════════════════════════════════════════════════════════════════
create function public._issue_check_in_code(p_session uuid) returns public.check_in_codes
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  rotation_s int;
  grace_s int;
  cur public.check_in_codes;
  v_code text;
  i int;
  alphabet constant text := 'ACDEFGHJKMNPQRTUVWXY34679';  -- no 0/O 1/I/L 5/S 2/Z 8/B (REQ-CHK-002)
begin
  select * into s from public.sessions where id = p_session for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select check_in_rotation_seconds, check_in_grace_seconds into rotation_s, grace_s
    from public.org_settings where org_id = s.org_id;

  -- The most recently issued non-revoked code. If it was issued within the
  -- current rotation window, it IS the current code — return it unchanged
  -- (idempotent: calling this every render does not mint a new code every
  -- render). Otherwise the window has elapsed (or there is no code, or the
  -- latest was just revoked) — mint one.
  select * into cur from public.check_in_codes
   where session_id = p_session and revoked_at is null
   order by valid_from desc
   limit 1;

  if found and cur.valid_from > now() - make_interval(secs => rotation_s) then
    return cur;
  end if;

  loop
    v_code := '';
    for i in 1..6 loop
      v_code := v_code || substr(alphabet, 1 + floor(random() * length(alphabet))::int, 1);
    end loop;
    begin
      -- valid_until spans this window PLUS the next window's grace period,
      -- so the previous code stays acceptable to check_in() for exactly
      -- check_in_grace_seconds after a new one becomes current — "exactly
      -- one current code, at most one other in grace" (REQ-CHK-002).
      insert into public.check_in_codes (org_id, session_id, code, valid_from, valid_until)
      values (s.org_id, p_session, v_code, now(), now() + make_interval(secs => rotation_s + grace_s))
      returning * into cur;
      exit;
    exception when unique_violation then
      -- collision on (session_id, code) — vanishingly rare with a 6-char
      -- alphabet of 25, but retried rather than assumed away.
    end;
  end loop;
  return cur;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- ensure_check_in_code — the member-facing (well, presenter/staff-facing)
-- wrapper. This IS the host-view read path (REQ-CHK-001, REQ-CHK-014 /
-- OQ-013): check_in_codes has no select policy that would let a host lazily
-- see-or-create a code, because issuance is RPC-only (03 §5.4a) — so the
-- authorization check that keeps a member from ever reading the live code
-- lives here, not only in a table policy.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.ensure_check_in_code(p_session uuid) returns public.check_in_codes
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
  return public._issue_check_in_code(p_session);
end $$;
revoke execute on function public.ensure_check_in_code(uuid) from public, anon;
grant  execute on function public.ensure_check_in_code(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- rotate_check_in_code — JOB-rotate_check_in_code's service_role-only twin.
-- No identity check: the caller is the worker itself (trusted directly),
-- not a presenter or staff member reading through PostgREST — is_staff()
-- would read a null auth.jwt() in that context and always refuse.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.rotate_check_in_code(p_session uuid) returns public.check_in_codes
language sql security definer set search_path = '' as $$
  select public._issue_check_in_code(p_session)
$$;
revoke execute on function public.rotate_check_in_code(uuid) from public, anon, authenticated;
grant  execute on function public.rotate_check_in_code(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- revoke_check_in_code — REQ-CHK-007. Presenter, admin or moderator only;
-- issues the replacement in the same call ("at once", no restart).
-- ═══════════════════════════════════════════════════════════════════════════
create function public.revoke_check_in_code(p_session uuid) returns public.check_in_codes
language plpgsql security definer set search_path = '' as $$
declare
  m public.members := public.assert_active_member();
  s public.sessions;
  cur public.check_in_codes;
begin
  select * into s from public.sessions where id = p_session;
  if not found or s.org_id <> m.org_id then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (public.is_presenter_of(p_session) or m.org_role in ('admin', 'moderator')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into cur from public.check_in_codes
   where session_id = p_session and revoked_at is null and valid_until > now()
   order by valid_from desc
   limit 1
   for update;
  if not found then
    raise exception 'no_active_code' using errcode = 'P0002';
  end if;

  update public.check_in_codes set revoked_at = now(), revoked_by = m.id where id = cur.id;

  perform public.write_audit(s.org_id, 'check_in_code.revoked', 'check_in_code', cur.id,
           null, null, null, null, m.id);              -- REQ-CHK-007: audited with actor + timestamp

  return public._issue_check_in_code(p_session);
end $$;
revoke execute on function public.revoke_check_in_code(uuid) from public, anon;
grant  execute on function public.revoke_check_in_code(uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- check_in — the integrity keystone (D24). REQ-CHK-003..006, REQ-CHK-009..013.
--
-- Returns a `provision_member()`-style JSON envelope (0005) instead of
-- raising for the "expected, must leave a trail" outcomes — a real
-- Postgres gotcha, not a style choice: a single SQL statement that raises
-- an exception rolls back EVERYTHING it did, including a write from
-- earlier in the SAME function call. DEC-015 / REQ-CHK-006 requires the
-- check_in_attempts row to survive a rejection (rate limit, wrong code,
-- wrong window) — if this function `raise exception`d for those, the
-- attempt insert a few lines above it would be undone along with it, in
-- production (one RPC call = one statement = one transaction) exactly as
-- much as inside this suite's savepoint-per-statement harness. `raise
-- exception` is still used for `not_found` (a caller error, nothing to
-- log yet) — everything downstream of the attempt insert returns an
-- envelope `{status, check_in?, conflict_session_id?}` instead.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.check_in(p_session uuid, p_code text) returns jsonb
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
  select * into existing from public.check_ins where session_id = p_session and member_id = m.id;
  if found then
    return jsonb_build_object('status', 'ok', 'check_in', to_jsonb(existing));
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

  -- TODO(scoring, M4): perform graphile_worker.add_job('award_points',
  --   json_build_object('source', 'check_in', 'source_id', ci.id),
  --   job_key => 'pts:check_in:' || ci.id);
  return jsonb_build_object('status', 'ok', 'check_in', to_jsonb(ci));
end $$;
revoke execute on function public.check_in(uuid, text) from public, anon;
grant  execute on function public.check_in(uuid, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- mark_checked_in_manually — REQ-CHK-008. Admin or moderator, mandatory
-- reason, same row shape and same rights as a code check-in (D24 is not
-- weakened by the backup) — the only difference is `method = 'manual'`.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.mark_checked_in_manually(p_session uuid, p_member uuid, p_reason text) returns public.check_ins
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
  if s.state <> 'in_progress' then
    raise exception 'not_open' using errcode = '23514';
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

  return ci;
end $$;
revoke execute on function public.mark_checked_in_manually(uuid, uuid, text) from public, anon;
grant  execute on function public.mark_checked_in_manually(uuid, uuid, text) to authenticated;

-- promoted by the lead at wave-2 sync 2 · scoring/0002_award_points.sql — award_points() (05 §2.2) and the hook into
-- check_in()'s marked call site. STORY-PTS-001.
-- Serves: REQ-PTS-001, REQ-PTS-002, REQ-PTS-004, REQ-PTS-006, REQ-PTS-007,
--         REQ-PTS-012, REQ-CHK-009, A10 · 11 §2.3 JOB-award_points.
-- Cites:  supabase/proposed/scoring/0001_m4_schema.sql (points_ledger,
--         scoring_rules) · migration 0015 (check_in(), the TODO(scoring, M4)
--         call site) · migration 0025 (public.enqueue_job()).
--
-- The member's action never waits on the award (11 §2.3): check_in() only
-- enqueues; the worker's award_points task (worker/src/tasks/award_points.ts)
-- calls this function asynchronously. award_points() itself never raises —
-- a capped or cooled-down action returns silently, because a member's
-- sixth comment must still succeed even though it earns nothing (05 §2.2).
-- That already satisfies DEC-043's spirit without needing an outcome
-- envelope: nothing is written before the decision to skip, so there is
-- nothing an exception could roll back.
--
-- 03 §8.2 rows this adds:
--   RPC-award_points.definer_only — no client role can call it; only
--     service_role (the worker) and the function owner can.
--   RPC-award_points.silent_skip — a disabled rule, an exhausted cap, or a
--     live cooldown award nothing and raise nothing.
--   RPC-award_points.idempotent — the same (rule, source, source_id, member)
--     quadruple inserts at most one row, via on conflict do nothing.
--   POL-check_in.award_points_hook — a successful check-in enqueues exactly
--     one `award_points` job, keyed `pts:check_in:<check_in.id>`.

-- ═══════════════════════════════════════════════════════════════════════════
-- award_points — 05 §2.2, verbatim modulo the p_source typing (ledger_source,
-- not text, so a typo'd source is a database error at the call site rather
-- than a silently-orphaned ledger row).
-- ═══════════════════════════════════════════════════════════════════════════
create function public.award_points(
  p_rule       text,
  p_member     uuid,
  p_source     public.ledger_source,
  p_source_id  uuid,
  p_session    uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r    public.scoring_rules;
  used int;
  key  text;
begin
  select * into r from public.scoring_rules
   where org_id = (select org_id from public.members where id = p_member)
     and action_key = p_rule;
  if r is null or not r.enabled then
    return;                                            -- unknown/disabled rule: award nothing
  end if;

  -- Per-session cap (REQ-PTS-006). Expressed in occurrences in the schema
  -- (05 §3.2's footgun: cap_per_session * points is the point ceiling, not
  -- the occurrence count itself) — comparing against points-so-far keeps
  -- this correct even if a session mixes ledger rows written under two
  -- rule_versions with different point values.
  if r.cap_per_session is not null and p_session is not null then
    select coalesce(sum(amount), 0) into used from public.points_ledger
     where member_id = p_member and session_id = p_session and rule_key = p_rule;
    if used >= r.cap_per_session * r.points then
      return;
    end if;
  end if;

  -- Cooldown (REQ-PTS-007): inside the window, award nothing and fail nothing.
  if r.cooldown is not null and exists (
       select 1 from public.points_ledger
        where member_id = p_member and rule_key = p_rule
          and occurred_at > now() - r.cooldown) then
    return;
  end if;

  -- 05 §2.1's key: <rule_key>:<source>:<source_id>:<member_id>:v1. The
  -- trailing epoch is bumped only by a DECISIONS.md-logged re-award; nothing
  -- here ever writes anything but v1.
  key := format('%s:%s:%s:%s:v1', p_rule, p_source, p_source_id, p_member);

  insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id,
                                    reason, rule_key, rule_version, idempotency_key)
  values ((select org_id from public.members where id = p_member),
          p_member, r.points, p_source, p_source_id, p_session,
          r.reason_ar, p_rule, r.version, key)
  on conflict (idempotency_key) do nothing;            -- REQ-PTS-012: a replay writes zero rows
end $$;
revoke execute on function public.award_points(text, uuid, public.ledger_source, uuid, uuid)
  from public, anon, authenticated;
grant  execute on function public.award_points(text, uuid, public.ledger_source, uuid, uuid)
  to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- check_in() — unchanged except for the marked call site: the TODO comment
-- becomes a real enqueue through public.enqueue_job() (0025), never
-- graphile_worker.add_job() directly. Every other line is copied verbatim
-- from 0015 — this is a hook, not a rewrite, of an RPC `checkin` owns.
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

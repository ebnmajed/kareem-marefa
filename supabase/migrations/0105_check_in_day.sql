-- wave 9 (DEC-150 contract 4, DEC-151) — CHECK-IN MOVES TO THE DAY. Eight
-- definer functions stop keying on the session and key on a day, and no caller
-- on `main` notices: each keeps `p_session` and gains a trailing
-- `p_day uuid default null`.
-- Promoted by the lead from supabase/proposed/checkin/02_check_in_day.sql.
--
-- ★★ THE OLD SIGNATURE IS DROPPED IN THIS FILE, for each of the eight. Not
-- tidiness: while `f(uuid)` and `f(uuid, uuid default null)` both exist, a
-- one-argument call has two candidates and Postgres refuses it as not unique —
-- and PostgREST would publish two overloads of the same name (0085's lesson).
-- A migration file is one transaction, so `main` never sees the pair.
--
-- ★ THE ORDER INSIDE THIS FILE IS LOAD-BEARING. `_issue_check_in_code()` is
-- the private core the four code wrappers call. The new core is created first
-- so every new wrapper binds a two-argument call; the old wrappers are dropped
-- before the old core, so nothing is ever left pointing at a function that no
-- longer exists. Every new function calls `_issue_check_in_code(p_session,
-- <day>)` with both arguments explicitly, because a one-argument call is
-- ambiguous for as long as both arities are in the catalogue.
--
-- ★ HOW A NULL `p_day` RESOLVES — one rule, and `0100`'s own, never copied:
--   1 · `p_day`, when the caller named one (SCR-044 always does: an admin
--       corrects Tuesday's list on Thursday). A day that is not of this
--       session is `not_found`.
--   2 · `check_in()` only — THE CODE'S DAY, when that day is the one taking
--       attendance. The code belongs to a day, so the member never says which
--       (DEC-150 contract 4). A wrong code matches nothing and falls through to
--       3, so a refusal still reveals nothing about it: the day is CHOSEN
--       early, the code is still VALIDATED last, after the window, the switch
--       and the walk-in door (0084's ordering).
--       ★ «when that day is the one taking attendance» is not decoration, and
--       the case that forced it is real: a code minted a minute before day N's
--       capped ceiling stays inside `valid_until` for a rotation window AFTER
--       day N+1 has begun. Unconstrained, a member in day N+1's room typing
--       that leftover code would be told `session_ended` — which is both wrong
--       (the session has not ended, they are standing in it) and a disclosure
--       REQ-CHK-004 forbids, since only a REAL code could produce it. The
--       honest answer is `invalid_code`: the code is not valid now.
--       Under DEC-151's cap at most one day holds an instant, so this
--       shortcut provably agrees with step 3 — it is kept because the
--       requirement says the code names the day, and because it is what keeps
--       this function correct if the cap is ever lifted and two days can hold
--       one instant again.
--   3 · `public.resolve_session_day(p_session, now())` (0100, re-created by
--       0101 to use the capped ceiling). It returns the FIRST day when nothing
--       has begun, so the gates below answer `not_started` from
--       `now() < d.starts_at` — the same answer `main` gives, reached the same
--       way. Null only when the session has no day at all.
--
-- ★ THE CEILING IS `public.check_in_ceiling(p_day)` (0101, the lead's) —
-- `least(ends_at + 2 h, the next day's start)` — CALLED, never copied, so the
-- resolver and every gate can never disagree about which day holds an instant.
-- At one day there is no next day and `least(x, null)` is `x`, so every gate
-- compares the two instants it compares today.
--
-- ★ `check_ins.session_window` IS THE DAY'S, AND THAT IS WHAT MAKES THE FEATURE
-- POSSIBLE. The exclusion constraint is `(member_id =, session_window &&)`. Had
-- the window stayed the session's, a member's three check-ins across a
-- three-day workshop would carry three IDENTICAL ranges and day 2 would be
-- refused `23P01`. `0100`'s `check_ins_window()` derives it from the day, so
-- the inserts below pass `session_day_id` and DO NOT pass `session_window` —
-- one writer for that column, and no RPC can get it wrong.
--
-- ★ CONTRACT 5 IS NOT SWITCHED HERE. `scoring`'s `attendance_recorded()` /
-- `attendance_removed()` and the lead's `attendance_certificate_sync()` are not
-- promoted yet, so every points, certificate and no-show line below is `main`'s
-- text VERBATIM (DEC-151 §4). A third file switches all three call sites at
-- once, after the lead says each hook exists. Until then a multi-day session
-- would award at the first day's check-in, against REQ-SES-017 — which is why
-- no multi-day session goes through the demonstrable before that file lands.
--
-- ★ FINDING, fixed here rather than reported and left: `_issue_check_in_code()`
-- has NO revoke. 0015's own comment says «No grants: only called from the two
-- public wrappers» — but a function defaults to `execute` for `public`, so the
-- private, SECURITY DEFINER core that mints a live code has been callable by
-- `authenticated` since M2, bypassing `ensure_check_in_code()`'s REQ-CHK-014
-- check (03 §5.4a: «a member never reads the live code»). The revoke is added
-- in the same file that re-creates the function, the way 0087 added its
-- `removed_at` filters. Flagged in docs/plan/notes/checkin.md for the lead.
--
-- Serves:  REQ-CHK-001 … REQ-CHK-017, REQ-SES-015, REQ-NFR-001
-- Cites:   0015 (_issue_check_in_code, rotate/revoke — re-created),
--          0084 (ensure_check_in_code, set_check_in_open, the window family),
--          0086/0087 (mark_checked_in_manually), 0087 (check_in, remove_check_in),
--          0100 (session_days, resolve_session_day, check_ins_window),
--          0101 (check_in_ceiling, session_days.check_in_open),
--          checkin/01 (the shadow — set_check_in_open depends on it)
-- Docs:    docs/plan/notes/checkin.md «Wave 9 plan» §1, §2; DEC-150, DEC-151
--
-- 03 §8.2 rows this adds (each SUPERSEDES the same-named session-scoped row):
--   | `RPC-check_in.day_from_code` | A live code names the day it was minted for, and only while that day is taking attendance; a code of any other day of the same session — one not yet begun, or one whose ceiling has passed — is `invalid_code`, never a disclosure that it was real. |
--   | `RPC-check_in.already_checked_in_per_day` | A member checked into day 1 checking into day 2 succeeds; a second attempt on day 2 returns `already_checked_in` for day 2's row. |
--   | `RPC-check_in.rate_limit_per_day` | Ten attempts against day 1 do not consume day 2's stream (REQ-SES-015: «its own rate-limit stream»); at one day every attempt of the session is that day's. |
--   | `RPC-check_in.day_window` | The floor is the day's start, the ceiling `check_in_ceiling()`; after day 2's ceiling with day 3 still ahead the answer is `session_ended`, and the envelope status is the one main returns. |
--   | `RPC-check_in.day_switch` | Closing day 2's switch refuses day 2 with `check_in_closed` and leaves day 3 open. |
--   | `RPC-check_in.overlap_compares_days` | Three check-ins across three days of one session are all accepted (their windows are disjoint); a check-in overlapping ANOTHER session's day is refused `overlap` naming it. |
--   | `RPC-ensure_check_in_code.per_day` | The host view of day 2 gets day 2's code; issuance is refused `not_open` outside that day's floor/ceiling even while day 3 is ahead. |
--   | `RPC-_issue_check_in_code.not_callable` | ★ The private core is executable by no client role — a member calling it directly is refused `42501` instead of being handed a live code. |
--   | `RPC-revoke_check_in_code.per_day` | Revoking on day 2 revokes day 2's code and issues day 2's replacement; day 3 has none and is unaffected. |
--   | `RPC-mark_checked_in_manually.day` | An admin marks a member present on day 1 while day 3 is running; a future day is refused `not_open`; a moderator is still bound by that day's floor and ceiling. |
--   | `RPC-remove_check_in.day` | Removing day 2 leaves days 1 and 3 standing; removing a member with no active check-in on that day is `not_found`. |
--   | `RPC-set_check_in_open.day` | The switch moves the day's column; the audit row still names the SESSION and carries the day in its payload; the returned session row carries the recomputed shadow. |

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · the private core — the day's code
-- ═══════════════════════════════════════════════════════════════════════════
create function public._issue_check_in_code(p_session uuid, p_day uuid default null) returns public.check_in_codes
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  d public.session_days;
  rotation_s int;
  grace_s int;
  cur public.check_in_codes;
  v_code text;
  i int;
  alphabet constant text := 'ACDEFGHJKMNPQRTUVWXY34679';  -- no 0/O 1/I/L 5/S 2/Z 8/B (REQ-CHK-002)
begin
  -- The SESSION lock is kept, not narrowed to the day: it is the lock that
  -- also serialises against a day write, and two days of one session minting
  -- concurrently is not a scenario worth a weaker guarantee.
  select * into s from public.sessions where id = p_session for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  select * into d from public.session_days
   where id = coalesce(p_day, public.resolve_session_day(p_session, now()))
     and session_id = p_session;
  if d.id is null then
    raise exception 'not_found' using errcode = 'P0002';   -- no such day, or the session has none
  end if;

  select check_in_rotation_seconds, check_in_grace_seconds into rotation_s, grace_s
    from public.org_settings where org_id = s.org_id;

  -- The most recently issued non-revoked code OF THIS DAY. If it was issued
  -- within the current rotation window it IS the current code — returned
  -- unchanged, so calling this every render does not mint every render.
  select * into cur from public.check_in_codes
   where session_day_id = d.id and revoked_at is null
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
      -- `unique (session_id, code)` is UNCHANGED, so two days of one workshop
      -- can never share a code. Narrowing it to the day would make yesterday's
      -- code re-mintable today, which is a worse property than the retry costs.
      insert into public.check_in_codes (org_id, session_id, session_day_id, code, valid_from, valid_until)
      values (s.org_id, p_session, d.id, v_code, now(), now() + make_interval(secs => rotation_s + grace_s))
      returning * into cur;
      exit;
    exception when unique_violation then
      -- collision on (session_id, code) — vanishingly rare, retried rather
      -- than assumed away.
    end;
  end loop;
  return cur;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · ensure_check_in_code — the host view's read path (REQ-CHK-001/014)
-- ═══════════════════════════════════════════════════════════════════════════
create function public.ensure_check_in_code(p_session uuid, p_day uuid default null) returns public.check_in_codes
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  d public.session_days;
begin
  select * into s from public.sessions where id = p_session;
  if not found or s.org_id <> public.auth_org_id() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  -- Authority is the SESSION's: its own accepted presenter, or staff. There is
  -- no per-day role and REQ-CHK-014 does not imply one.
  if not (public.is_presenter_of(p_session) or public.is_staff()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  -- The state family stays on the session: a lifecycle fact, not a meeting one.
  if s.state not in ('published', 'in_progress', 'completed') then
    raise exception 'not_open' using errcode = 'P0001';               -- DEC-141 ruling 1
  end if;

  select * into d from public.session_days
   where id = coalesce(p_day, public.resolve_session_day(p_session, now()))
     and session_id = p_session;
  if d.id is null
     or now() < d.starts_at
     or now() >= public.check_in_ceiling(d.id) then
    raise exception 'not_open' using errcode = 'P0001';               -- the DAY's floor and ceiling
  end if;

  -- The switch still does NOT gate issuance: the room may see what reopening
  -- would accept (0084's own reasoning, unchanged).
  return public._issue_check_in_code(p_session, d.id);
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · rotate_check_in_code — JOB-rotate_check_in_code's service_role twin
-- ═══════════════════════════════════════════════════════════════════════════
-- No identity check: the caller is the worker itself, trusted directly, not a
-- presenter reading through PostgREST — `is_staff()` would read a null
-- `auth.jwt()` there and always refuse. The worker now passes the day, because
-- it selects days inside their window rather than sessions that are
-- `in_progress` (named difference 1, DEC-151 §6).
create function public.rotate_check_in_code(p_session uuid, p_day uuid default null) returns public.check_in_codes
language sql security definer set search_path = '' as $$
  select public._issue_check_in_code(p_session, p_day)
$$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · revoke_check_in_code — REQ-CHK-007, the day's code
-- ═══════════════════════════════════════════════════════════════════════════
create function public.revoke_check_in_code(p_session uuid, p_day uuid default null) returns public.check_in_codes
language plpgsql security definer set search_path = '' as $$
declare
  m public.members := public.assert_active_member();
  s public.sessions;
  v_day uuid;
  cur public.check_in_codes;
begin
  select * into s from public.sessions where id = p_session;
  if not found or s.org_id <> m.org_id then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (public.is_presenter_of(p_session) or m.org_role in ('admin', 'moderator')) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select d.id into v_day from public.session_days d
   where d.id = coalesce(p_day, public.resolve_session_day(p_session, now()))
     and d.session_id = p_session;
  if v_day is null then
    raise exception 'no_active_code' using errcode = 'P0002';   -- no day, so no code of one
  end if;

  select * into cur from public.check_in_codes
   where session_day_id = v_day and revoked_at is null and valid_until > now()
   order by valid_from desc
   limit 1
   for update;
  if not found then
    raise exception 'no_active_code' using errcode = 'P0002';
  end if;

  update public.check_in_codes set revoked_at = now(), revoked_by = m.id where id = cur.id;

  perform public.write_audit(s.org_id, 'check_in_code.revoked', 'check_in_code', cur.id,
           null, null, null, null, m.id);              -- REQ-CHK-007: actor + timestamp

  return public._issue_check_in_code(p_session, v_day);   -- the replacement, same day, at once
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 · check_in — the integrity keystone (D24), now per day
-- ═══════════════════════════════════════════════════════════════════════════
-- The envelope, not `raise`, for every expected outcome: DEC-015/REQ-CHK-006
-- requires the `check_in_attempts` row to survive a rejection, and a raising
-- function rolls back its own earlier write (DEC-043). Unchanged, and the
-- reason the day is resolved BEFORE the attempt row: the attempt must be
-- stamped with the day it was against.
create function public.check_in(p_session uuid, p_code text, p_day uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  m public.members := public.assert_active_member();
  s public.sessions;
  d public.session_days;
  c public.check_in_codes;
  v_recent int;
  v_code text := upper(btrim(coalesce(p_code, '')));
  v_day uuid;
  ci public.check_ins;
  existing public.check_ins;
  v_conflict uuid;
  v_range tstzrange;
begin
  select * into s from public.sessions where id = p_session;
  if not found or s.org_id <> m.org_id then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if public.is_presenter_of(p_session) then
    return jsonb_build_object('status', 'presenter_cannot_check_in');      -- REQ-CHK-011 / OQ-025
  end if;

  -- ── the day, before anything is judged per day (see this file's header) ──
  if p_day is not null then
    select d2.id into v_day from public.session_days d2
     where d2.id = p_day and d2.session_id = p_session;
    if v_day is null then
      raise exception 'not_found' using errcode = 'P0002';   -- nothing written yet; DEC-043 holds
    end if;
  else
    -- The code's day, and only while THAT day is the one taking attendance —
    -- see this file's header for the leftover-code case that forced the
    -- second condition.
    select c2.session_day_id into v_day
      from public.check_in_codes c2
      join public.session_days d2 on d2.id = c2.session_day_id
     where c2.session_id = p_session and c2.code = v_code
       and c2.revoked_at is null and now() between c2.valid_from and c2.valid_until
       and now() >= d2.starts_at and now() < public.check_in_ceiling(d2.id);
    if v_day is null then
      v_day := public.resolve_session_day(p_session, now());
    end if;
  end if;
  select * into d from public.session_days where id = v_day;

  -- REQ-CHK-005, PER DAY: a second attempt by an already-checked-in member is
  -- a no-op reporting the existing check-in. A member checked into day 1 is
  -- not «already checked in» to day 2.
  select * into existing from public.check_ins
   where session_day_id = v_day and member_id = m.id and removed_at is null;
  if found then
    return jsonb_build_object('status', 'already_checked_in', 'check_in', to_jsonb(existing));
  end if;

  -- REQ-CHK-006 / DEC-015: the attempt row is written BEFORE the limit is
  -- checked, so a request that trips the limit still counts toward it.
  -- ★ DEC-151: the stream is the DAY's (REQ-SES-015: «its own rate-limit
  -- stream»). At one day every attempt of the session is that day's — 0100
  -- backfilled them — so the count is identical.
  select count(*) into v_recent from public.check_in_attempts
   where session_id = p_session and member_id = m.id
     and session_day_id is not distinct from v_day
     and attempted_at > now() - interval '10 minutes';

  insert into public.check_in_attempts (org_id, session_id, session_day_id, member_id, submitted_code, succeeded)
  values (s.org_id, p_session, v_day, m.id, v_code, false);

  if v_recent >= 10 then
    return jsonb_build_object('status', 'rate_limited');
  end if;

  -- DEC-141's floor/ceiling/state family, now the DAY's floor and ceiling.
  -- REQ-CHK-004's «which of not-started/ended, without revealing whether the
  -- code was right» is unchanged.
  if s.state not in ('published', 'in_progress', 'completed') or d.id is null then
    return jsonb_build_object('status', 'not_started');
  elsif now() < d.starts_at then
    return jsonb_build_object('status', 'not_started');
  elsif now() >= public.check_in_ceiling(d.id) then
    return jsonb_build_object('status', 'session_ended');
  end if;

  -- REQ-CHK-015: the day's switch. After the window (a more specific refusal
  -- already applies outside it) and before the walk-in door.
  if not d.check_in_open then
    return jsonb_build_object('status', 'check_in_closed');
  end if;

  -- DEC-065/REQ-CHK-010: the door policy is a SESSION fact — one registration
  -- covers every day (DEC-120). Checked before the code so a refused member
  -- learns nothing about it.
  if not s.allow_walk_ins and not exists (
    select 1 from public.rsvps r where r.session_id = p_session and r.member_id = m.id and r.status = 'confirmed'
  ) then
    return jsonb_build_object('status', 'reservation_required');
  end if;

  select * into c from public.check_in_codes
   where session_day_id = d.id and code = v_code
     and revoked_at is null and now() between valid_from and valid_until;
  if c is null then
    return jsonb_build_object('status', 'invalid_code');
  end if;

  v_range := tstzrange(d.starts_at, d.ends_at, '[)');
  begin
    -- `session_window` is NOT passed: 0100's check_ins_window() derives it from
    -- the day, always. One writer for the column the exclusion constraint reads.
    insert into public.check_ins (org_id, session_id, session_day_id, member_id, method, code_id)
    values (s.org_id, p_session, d.id, m.id, 'code', c.id)
    returning * into ci;
  exception when exclusion_violation then
    -- A savepoint scoped to just this INSERT (PL/pgSQL's own BEGIN/EXCEPTION
    -- block) — everything before it, including the attempt row, stands.
    -- REQ-CHK-013 now compares DAY windows: two days of one session never
    -- overlap, so this can only name a different session.
    select session_id into v_conflict from public.check_ins
     where member_id = m.id and session_window && v_range and removed_at is null
     limit 1;
    return jsonb_build_object('status', 'overlap', 'conflict_session_id', v_conflict);
  end;

  update public.check_in_attempts set succeeded = true
   where id = (
     select id from public.check_in_attempts
      where session_id = p_session and member_id = m.id
        and session_day_id is not distinct from v_day
      order by attempted_at desc
      limit 1
   );

  -- ★ CONTRACT 5, NOT YET SWITCHED — main's text verbatim (DEC-151 §4).
  -- Becomes `perform public.attendance_recorded(ci.id);` in checkin/03.
  perform public.enqueue_job(
    'award_points',
    jsonb_build_object('rule', 'check_in', 'member_id', m.id, 'source', 'check_in',
                        'source_id', ci.id, 'session_id', s.id),
    'pts:check_in:' || ci.id
  );
  return jsonb_build_object('status', 'ok', 'check_in', to_jsonb(ci));
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6 · mark_checked_in_manually — REQ-CHK-008/017, the day an admin names
-- ═══════════════════════════════════════════════════════════════════════════
-- The per-role window is 0086's ruling, applied to the MEETING rather than the
-- session: an admin has the day's floor and no ceiling (REQ-CHK-017's «at any
-- time» — the escape hatch that makes a default-open switch safe); a moderator
-- has the day's floor and ceiling and the session's state family.
--
-- ★ A consequence worth naming: an admin marking a FUTURE day is refused
-- `not_open`, because that day's floor has not passed. That is today's rule
-- applied to the meeting, and it is right — you cannot record attendance at a
-- meeting that has not happened.
create function public.mark_checked_in_manually(p_session uuid, p_member uuid, p_reason text, p_day uuid default null)
returns public.check_ins
language plpgsql security definer set search_path = '' as $$
declare
  m public.members := public.assert_active_member();
  s public.sessions;
  d public.session_days;
  ci public.check_ins;
  existing public.check_ins;
  v_conflict uuid;
  v_range tstzrange;
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

  select * into d from public.session_days
   where id = coalesce(p_day, public.resolve_session_day(p_session, now()))
     and session_id = p_session;
  if p_day is not null and d.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  if m.org_role = 'admin' then
    -- `archived` included, as in 0086: SCR-044 is a reconciliation screen an
    -- admin may visit long after archiving.
    if s.state = 'cancelled' or d.id is null or now() < d.starts_at then
      raise exception 'not_open' using errcode = '23514';
    end if;
  else
    if s.state not in ('published', 'in_progress', 'completed')
       or d.id is null
       or now() < d.starts_at
       or now() >= public.check_in_ceiling(d.id) then
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

  select * into existing from public.check_ins
   where session_day_id = d.id and member_id = p_member and removed_at is null;
  if found then
    return existing;                                                       -- REQ-CHK-005, per day
  end if;

  v_range := tstzrange(d.starts_at, d.ends_at, '[)');
  begin
    insert into public.check_ins (org_id, session_id, session_day_id, member_id, method, manual_reason, marked_by)
    values (s.org_id, p_session, d.id, p_member, 'manual', btrim(p_reason), m.id)
    returning * into ci;
  exception when exclusion_violation then
    select session_id into v_conflict from public.check_ins
     where member_id = p_member and session_window && v_range and removed_at is null
     limit 1;
    raise exception 'overlapping_session:%', v_conflict using errcode = '23P01';
  end;

  perform public.write_audit(s.org_id, 'check_in.manual', 'check_in', ci.id, null,
           jsonb_build_object('member_id', p_member, 'reason', p_reason), p_reason, null, m.id);

  -- ★ CONTRACT 5, NOT YET SWITCHED — 0086's fix, verbatim.
  perform public.enqueue_job(
    'award_points',
    jsonb_build_object('rule', 'check_in', 'member_id', p_member, 'source', 'check_in',
                        'source_id', ci.id, 'session_id', s.id),
    'pts:check_in:' || ci.id
  );

  return ci;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 7 · remove_check_in — REQ-CHK-017, the day an admin names
-- ═══════════════════════════════════════════════════════════════════════════
-- Admin-only (`assert_fresh_admin()`, the freshness re-check 0032's
-- `adjust_points_manually()` uses for a financially-consequential write),
-- mandatory reason, soft-delete because `certificates.check_in_id` is
-- `on delete restrict` with a not-null check for attendance certificates
-- (0055) — a check-in a certificate names can never be deleted at all.
create function public.remove_check_in(p_session uuid, p_member uuid, p_reason text, p_day uuid default null)
returns public.check_ins
language plpgsql security definer set search_path = '' as $$
declare
  admin   public.members := public.assert_fresh_admin();
  v_day   uuid;
  before  public.check_ins;
  target  public.check_ins;
  ledger  public.points_ledger;
  cert    public.certificates;
  rsvp_id uuid;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '23514';
  end if;

  v_day := coalesce(p_day, public.resolve_session_day(p_session, now()));

  select * into before from public.check_ins
   where session_id = p_session and session_day_id = v_day and member_id = p_member
     and org_id = admin.org_id and removed_at is null
   for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';    -- never checked in on this day, or already removed
  end if;

  update public.check_ins
     set removed_at = now(), removed_by = admin.id, removal_reason = btrim(p_reason)
   where id = before.id
   returning * into target;

  -- ★ CONTRACT 5, NOT YET SWITCHED — 0087's text verbatim (DEC-151 §4).
  -- Becomes two lines in checkin/03:
  --   perform public.attendance_removed(target.id);                     -- points, scoring's
  --   perform public.attendance_certificate_sync(p_session, p_member);  -- the certificate, the lead's
  -- The certificate hook is the lead's and not mine because at n > 1 the
  -- judgement is «is session_attendance_complete() still true» — contract 6's
  -- predicate — and removing day 1 must be able to revoke a certificate that
  -- names day 3. The `check_in_id` lookup below cannot express that, which is
  -- exactly why it leaves this function.
  for ledger in
    select * from public.points_ledger l
     where l.source in ('check_in', 'attendee_bonus') and l.source_id = target.id
       and not exists (select 1 from public.points_ledger rv where rv.source = 'reversal' and rv.source_id = l.id)
  loop
    insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id,
                                      reason, rule_key, idempotency_key)
    values (ledger.org_id, ledger.member_id, -ledger.amount, 'reversal', ledger.id,
            ledger.session_id, 'أُلغي تسجيل الحضور', ledger.rule_key, 'reversal:' || ledger.id || ':v1')
    on conflict (idempotency_key) do nothing;
  end loop;

  for cert in
    select * from public.certificates where check_in_id = target.id and state <> 'revoked'
  loop
    perform public.revoke_certificate(cert.id, 'أُلغي تسجيل الحضور');
  end loop;

  select id into rsvp_id from public.rsvps
   where session_id = p_session and member_id = p_member and status = 'confirmed';
  if rsvp_id is not null then
    perform public.award_points('no_show', p_member, 'no_show', rsvp_id, p_session);
  end if;

  perform public.write_audit(admin.org_id, 'check_in.removed', 'check_in', target.id,
                             to_jsonb(before), to_jsonb(target), btrim(p_reason), admin.org_role::text, admin.id);
  return target;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8 · set_check_in_open — REQ-CHK-015/016, the day's switch
-- ═══════════════════════════════════════════════════════════════════════════
create function public.set_check_in_open(p_session uuid, p_open boolean, p_day uuid default null)
returns public.sessions
language plpgsql security definer set search_path = '' as $$
declare
  actor  public.members := public.assert_active_member();
  target public.sessions;
  d      public.session_days;
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

  select * into d from public.session_days
   where id = coalesce(p_day, public.resolve_session_day(p_session, now()))
     and session_id = p_session;
  if d.id is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- REQ-CHK-016: a forged request past the ceiling is refused. Closing is
  -- always allowed, at any time.
  if p_open and now() >= public.check_in_ceiling(d.id) then
    raise exception 'ceiling_passed' using errcode = 'P0001';
  end if;

  if d.check_in_open is distinct from p_open then
    update public.session_days set check_in_open = p_open where id = d.id;
    -- The audit row still names the SESSION — `subject_type`, `subject_id` and
    -- the action are what every audit-screen filter and every 03 §8.2 row read.
    -- The day rides in the payload.
    perform public.write_audit(actor.org_id, 'session.check_in_open_changed', 'session', p_session,
                               jsonb_build_object('check_in_open', not p_open, 'session_day_id', d.id),
                               jsonb_build_object('check_in_open', p_open, 'session_day_id', d.id),
                               null, actor.org_role::text, actor.id);
  end if;

  -- ★ RE-READ. `target` was taken before the day was written, and the shadow
  -- (checkin/01) is recomputed by a trigger AFTER it. Returning the stale
  -- variable would hand the caller the old value — and the caller is
  -- `tests/rls/checkin-window.test.ts`, which reads `check_in_open` off this
  -- row, and `main`'s DAL.
  select * into target from public.sessions where id = p_session;
  return target;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 9 · the old signatures, dropped — wrappers first, the core last
-- ═══════════════════════════════════════════════════════════════════════════
drop function public.rotate_check_in_code(uuid);
drop function public.ensure_check_in_code(uuid);
drop function public.revoke_check_in_code(uuid);
drop function public.check_in(uuid, text);
drop function public.mark_checked_in_manually(uuid, uuid, text);
drop function public.remove_check_in(uuid, uuid, text);
drop function public.set_check_in_open(uuid, boolean);
drop function public._issue_check_in_code(uuid);

-- ═══════════════════════════════════════════════════════════════════════════
-- 10 · the grants — a NEW function defaults to `execute` for `public`
-- ═══════════════════════════════════════════════════════════════════════════
-- Invariant 6 in its function form. Every line below is mandatory: without the
-- revoke, `anon` holds the check-in RPC.

-- ★ The private core, revoked from every client role — the finding in this
-- file's header. Its callers are definer functions, which run as the owner and
-- need no grant.
revoke execute on function public._issue_check_in_code(uuid, uuid) from public, anon, authenticated, service_role;

revoke execute on function public.ensure_check_in_code(uuid, uuid) from public, anon;
grant  execute on function public.ensure_check_in_code(uuid, uuid) to authenticated;

revoke execute on function public.rotate_check_in_code(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.rotate_check_in_code(uuid, uuid) to service_role;

revoke execute on function public.revoke_check_in_code(uuid, uuid) from public, anon;
grant  execute on function public.revoke_check_in_code(uuid, uuid) to authenticated;

revoke execute on function public.check_in(uuid, text, uuid) from public, anon;
grant  execute on function public.check_in(uuid, text, uuid) to authenticated;

revoke execute on function public.mark_checked_in_manually(uuid, uuid, text, uuid) from public, anon;
grant  execute on function public.mark_checked_in_manually(uuid, uuid, text, uuid) to authenticated;

revoke execute on function public.remove_check_in(uuid, uuid, text, uuid) from public, anon;
grant  execute on function public.remove_check_in(uuid, uuid, text, uuid) to authenticated;

revoke execute on function public.set_check_in_open(uuid, boolean, uuid) from public, anon;
grant  execute on function public.set_check_in_open(uuid, boolean, uuid) to authenticated;

comment on function public.check_in(uuid, text, uuid) is
  'DEC-150 contract 4: the day''s check-in. p_day is the caller''s, else the code''s day, else resolve_session_day(). Every envelope status is the one main returns.';
comment on function public.set_check_in_open(uuid, boolean, uuid) is
  'REQ-CHK-015: moves the DAY''s switch under check_in_ceiling(). Returns the session, whose check_in_open is the bool_or shadow (checkin/01).';

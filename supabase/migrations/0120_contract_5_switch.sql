-- wave 9 (DEC-150 contract 5, DEC-151) — the switch. `check_in()`,
-- `mark_checked_in_manually()` and `remove_check_in()` stop deciding what a
-- check-in earns and call the hooks `0102` published.
-- Promoted by the lead from supabase/proposed/checkin/03_contract_5.sql.
--
-- ★ THREE LINES OF BEHAVIOUR CHANGE, AND EVERY ONE OF THEM IS «CALL THIS
-- INSTEAD». `0102` lifted the blocks out of these bodies verbatim, so this
-- file is a diff against `main` and not a rewrite: the task is `award_points`,
-- the key is still `pts:check_in:<check_in id>`, the payload is the same
-- object, the reversal is still one row per unreversed award with the key
-- `reversal:<ledger id>:v1` and the reason «أُلغي تسجيل الحضور», and the
-- no-show symmetry still computes `evaluate_no_shows`' own key. Nothing here
-- decides any of that any more.
--
-- ★ AND THE CERTIFICATE, through the third hook (`0108`). Contract 5 itself is
-- points only; `attendance_certificate_sync(p_session, p_member)` is the lead's
-- and reads contract 6's predicate. It REPLACES a lookup that was wrong the
-- moment a session could have more than one day: `remove_check_in()` used to
-- find the certificate by `check_in_id`, and a certificate names the SESSION,
-- not a day — so removing day 1 must be able to revoke one issued off day 3,
-- which that lookup cannot reach. The hook finds it by session, member and kind.
-- It also closes the other direction (named difference 3): a member marked
-- present the morning after a completed session becomes eligible at that moment,
-- so `check_in()` and `mark_checked_in_manually()` call it too.
--
-- ★ THE RESULT, and it is the assertion worth having: the source of all three
-- functions, comments stripped, names NONE of `points_ledger`, `award_points`,
-- `enqueue_job`, `certificates` or `revoke_certificate`. Everything a check-in
-- is worth is decided elsewhere, by one function per question.
--
-- ★ ONE ORDERING DIFFERENCE, STATED RATHER THAN DISCOVERED. On `main`
-- `remove_check_in()` runs reversal → certificate → no-show; here it runs
-- (reversal → no-show, inside the points hook) → certificate. Neither movement
-- reads what the other writes — the revocation does not consult the ledger and
-- the no-show award does not consult certificates — so the committed result is
-- identical, and the whole thing is still one transaction.
--
-- ★ WHAT DOES NOT MOVE: the soft-delete runs FIRST, before either hook. Both
-- read `removed_at is null`, so a hook called before the update would reverse
-- nothing and revoke nothing — a silent no-op, which is the worst shape a bug
-- of this kind can take.
--
-- ★ `create or replace`, not `create`: the signatures are `0105`'s and do not
-- change, so the grants are preserved and PostgREST sees no new overload.
-- `attendance_recorded()` / `attendance_removed()` are revoked from every
-- client role and granted to `service_role`; these three are `security
-- definer` and run as the owner, so they need no grant of their own.
--
-- Serves:  REQ-CHK-008, REQ-CHK-009, REQ-CHK-017, REQ-PTS-011, REQ-PTS-012,
--          REQ-SES-017, invariant 9 · DEC-150 contract 5, DEC-151
-- Cites:   0102 (attendance_recorded, attendance_removed — called, not copied),
--          0107 (session_attendance_complete — contract 6's predicate, reached
--          only through the hooks; never called from here),
--          0108 (attendance_certificate_sync — called, and it replaces this
--          file's own check_in_id lookup),
--          0105 (the three bodies, re-created with two lines each replaced),
--          0087 (the blocks 0102 and 0108 lifted)
-- Docs:    docs/plan/notes/checkin.md «Wave 9 plan» §5; docs/plan/notes/scoring.md
--
-- 03 §8.2 rows this adds:
--   | `RPC-check_in.calls_attendance_recorded` | A code check-in enqueues exactly one `award_points` job under `pts:check_in:<check_in id>` — through the hook, and the source of all three functions names no points primitive. |
--   | `RPC-mark_checked_in_manually.calls_attendance_recorded` | A manual mark enqueues the same one job under the same key, so REQ-CHK-008's «the same rights as a code check-in» is one call site each rather than two blocks kept in step. |
--   | `RPC-remove_check_in.calls_attendance_removed` | A removal writes one compensating row per unreversed award and the no-show row, through the hook; a second removal of the same check-in is refused and writes no second row. |
--   | `RPC-remove_check_in.certificate_revoked_through_the_hook` | An issued attendance certificate is still revoked when a removal makes attendance incomplete — now through `attendance_certificate_sync()` rather than a `check_in_id` lookup, and still with only the fixed phrase «أُلغي تسجيل الحضور» reaching it. |
--   | `RPC-check_in.certificate_synced` | A check-in on a session that is already `completed` reaches the same hook, so a member recorded after the fact becomes eligible rather than being silently skipped (named difference 3). |
--   | `RPC-checkin_functions.decide_nothing` | ★ The source of `check_in()`, `mark_checked_in_manually()` and `remove_check_in()`, comments stripped, names none of `points_ledger`, `award_points`, `enqueue_job`, `certificates`, `revoke_certificate` — nor any of `REQ-TSK-002`'s three task tables. |

create or replace function public.check_in(p_session uuid, p_code text, p_day uuid default null) returns jsonb
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

  -- ★ CONTRACT 5 (DEC-150, DEC-151). This function decides NOTHING about
  -- what a check-in earns. The task, the job key `pts:check_in:<id>` and the
  -- payload are the hook's (0102) — lifted out of here verbatim, so the switch
  -- is a diff against main rather than a rewrite.
  perform public.attendance_recorded(ci.id);
  -- ★ And the certificate (0108). At one day a member who checks in to a
  -- COMPLETED session becomes eligible at that moment — named difference 3,
  -- «a member marked present the morning after gets their certificate». The
  -- hook decides all of it: it is a no-op unless attendance is complete, the
  -- session is completed or archived, the mode is not `off` and no row of that
  -- kind exists. From a member's own check-in it never revokes anything.
  perform public.attendance_certificate_sync(p_session, m.id);
  return jsonb_build_object('status', 'ok', 'check_in', to_jsonb(ci));
end $$;

create or replace function public.mark_checked_in_manually(p_session uuid, p_member uuid, p_reason text, p_day uuid default null)
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

  -- ★ CONTRACT 5. The same call `check_in()` makes — which is the point:
  -- REQ-CHK-008's «exactly the same rights as a code check-in» stops being a
  -- claim two functions must keep in step and becomes one call site each.
  perform public.attendance_recorded(ci.id);
  perform public.attendance_certificate_sync(p_session, p_member);

  return ci;
end $$;

create or replace function public.remove_check_in(p_session uuid, p_member uuid, p_reason text, p_day uuid default null)
returns public.check_ins
language plpgsql security definer set search_path = '' as $$
declare
  admin   public.members := public.assert_fresh_admin();
  v_day   uuid;
  before  public.check_ins;
  target  public.check_ins;
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

  -- ★ CONTRACT 5 (DEC-150, DEC-151). The compensating reversal and the
  -- no-show symmetry are the hook's (0102), in 0087's own order inside it.
  -- The ledger is append-only with `service_role` revoked (invariant 9), so
  -- nothing here could write that reversal even if it wanted to — and now
  -- nothing here decides that it should.
  perform public.attendance_removed(target.id);

  -- ★ AND THE CERTIFICATE, through the same predicate (0108). The lookup this
  -- replaces was `where check_in_id = target.id`, and that is the thing which
  -- is WRONG at three days: a certificate names the session, not a day, so
  -- removing day 1 must be able to revoke one issued off day 3 — which a
  -- `check_in_id` lookup cannot reach. The hook finds it by session, member and
  -- kind, and revokes only while `session_attendance_complete()` is false.
  --
  -- ORDER: the soft-delete above runs FIRST. Both hooks read
  -- `removed_at is null`, so calling either before the update would reverse
  -- nothing and revoke nothing.
  --
  -- Only the FIXED phrase «أُلغي تسجيل الحضور» reaches the revocation, inside
  -- the hook; the admin's own free-text reason stays on
  -- `check_ins.removal_reason` and in the audit row below — the admin's words
  -- about a colleague are not the member's to read.
  perform public.attendance_certificate_sync(p_session, p_member);

  perform public.write_audit(admin.org_id, 'check_in.removed', 'check_in', target.id,
                             to_jsonb(before), to_jsonb(target), btrim(p_reason), admin.org_role::text, admin.id);
  return target;
end $$;

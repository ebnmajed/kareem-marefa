-- notify (wave 2, M3) — reminders that MOVE, and the RSVP notices M2 deferred.
--
-- Serves:  REQ-NTF-004 (7 d · 1 d · 2 h, org-configurable, rescheduling moves
--          rather than duplicates) · REQ-RAT-007 (the rating prompt, +1 h) ·
--          REQ-RSV-004 (the promotion notice — DEC-045 deferred it to M3) ·
--          REQ-CAL-004, REQ-CAL-006 (calendar upsert on confirm, delete on
--          cancel — the jobs the `TODO(notify, M3)` sites in 0014 asked for)
-- Cites:   08 §4.1 (the job keys ARE the mechanism), §4.2, §4.3, §6.3 ·
--          11 §1.3 (retry classes), §2.2, §2.6 · 0025 (enqueue_job) ·
--          0026 (notify(), the matrix) · DEC-045 (what M2 deferred here)
--
-- ── 03 §8.2 rows (added with this migration) ────────────────────────────────
--   | `RPC-cancel_job.definer_only` | No client role can remove a queued job; a definer RPC and the
--     worker can. |
--   | `RPC-schedule_session_reminders.moves` | Rescheduling a session leaves ONE pending job per
--     (member, offset), at the new time — not a second set (`REQ-NTF-004`). |
--   | `RPC-schedule_session_reminders.past` | An offset whose moment has passed is REMOVED, not
--     left to fire the instant the worker sees it. |
--   | `RPC-schedule_session_reminders.confirmed_only` | A waitlisted member has no reminders; being
--     promoted gives them the full set. |
--   | `POL-rsvps.notice` | Reserving notifies the member, promotion off the waitlist notifies them
--     on both channels (`REQ-RSV-004`), and cancelling removes their reminder keys. |
--
-- ── Why a trigger and not a `create or replace` of reserve_seat() ───────────
-- TEAM.md says a wave-2 track hooks into M2 at its marked call site with a
-- trigger OR a replacement of the RPC. A replacement would mean copying
-- eighty lines of the sessions track's function to add two, and every later
-- edit of theirs would silently lose mine or mine theirs. The trigger also
-- covers the writer 0014's TODO could not: `promote_next_waitlisted()`, which
-- an admin raising capacity reaches through the worker, and any future path.
-- One rule, at the table, for every writer.

-- ═══════════════════════════════════════════════════════════════════════════
-- cancel_job — the other half of the lead's one door (0025).
--
-- 08 §4.1's table has four rows and two of them are removals: "member cancels
-- → jobs removed by key" and "session is cancelled → all reminder keys
-- removed". `enqueue_job()` cannot express either, and `graphile_worker` is
-- granted to no client role and must not be — so removal needs the same
-- treatment enqueueing got: one wrapper, loud when the schema is missing,
-- service_role and definer callers only.
--
-- LEAD: this arguably belongs in 0025 beside `enqueue_job`. It is here because
-- 0025 is yours; move it if you prefer them together.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.cancel_job(p_key text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if to_regnamespace('graphile_worker') is null then
    raise exception 'graphile_worker schema is not installed — run `npx graphile-worker --schema-only -c <DATABASE_URL>` (DEC-046)'
      using errcode = '3F000';
  end if;
  if p_key is null or p_key = '' then
    return;   -- nothing to remove is not an error
  end if;
  perform graphile_worker.remove_job(p_key);
end $$;
revoke execute on function public.cancel_job(text) from public, anon, authenticated;
grant  execute on function public.cancel_job(text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- reminder_key / reminder_message_key — 08 §4.1 and §3.2, in one place.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.reminder_key(p_session uuid, p_offset int, p_member uuid) returns text
language sql immutable parallel safe set search_path = '' as $$
  select 'remind:' || p_session::text || ':' || p_offset::text || ':' || p_member::text
$$;
grant execute on function public.reminder_key(uuid, int, uuid) to service_role;

-- 08 §1.2 defines exactly THREE reminder messages — 7 d, 1 d, 2 h — while
-- `org_settings.reminder_offsets_minutes` is a free `int[]` an admin may set
-- to anything (REQ-NTF-004, "org-configurable"). An org that picks 3 days has
-- no message of its own, so it borrows the nearest one by magnitude: better a
-- subject that reads «بعد أسبوع» above a body carrying the real moment than a
-- reminder that is never sent at all. Flagged for 08 — the honest fix is a
-- fourth, offset-agnostic message, and that is a plan decision, not mine.
create function public.reminder_message_key(p_offset int) returns text
language sql immutable parallel safe set search_path = '' as $$
  select case
    when p_offset >= 4320 then 'MSG-reminder_7d'   -- 3 days and up
    when p_offset >= 720  then 'MSG-reminder_1d'   -- 12 hours and up
    else                       'MSG-reminder_2h'
  end
$$;
grant execute on function public.reminder_message_key(int) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- schedule_session_reminders — JOB-schedule_reminders' body (11 §2.6).
--
-- ★ The key is the whole mechanism. `enqueue_job()` fixes
-- `job_key_mode => 'replace'` (0025), so re-running this after a session moves
-- leaves ONE pending job per (member, offset) at the new time. There is no
-- cancel-and-recreate window in which both or neither exists — which is the
-- concrete reason graphile-worker was chosen over pg-boss (DEC-018).
--
-- An offset whose moment has already passed is REMOVED rather than enqueued.
-- A job with a `run_at` in the past runs the instant a worker sees it, so
-- enqueueing one would send «غدًا» about a session starting in ten minutes;
-- and a session moved LATER must get its past offsets back, which this does
-- because it recomputes every offset every time rather than diffing.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.schedule_session_reminders(p_session uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  s        public.sessions;
  offsets  int[];
  v_offset int;
  r        record;
  v_at     timestamptz;
  v_count  int := 0;
begin
  select * into s from public.sessions where id = p_session;
  if not found then
    raise exception 'not_found: session %', p_session using errcode = 'P0002';
  end if;

  select coalesce(os.reminder_offsets_minutes, '{10080,1440,120}')
    into offsets
    from public.org_settings os where os.org_id = s.org_id;
  offsets := coalesce(offsets, '{10080,1440,120}');

  -- A session with no time, or one nobody can still attend, holds no
  -- reminders: every key is removed rather than left pending.
  for r in select rs.member_id, rs.status from public.rsvps rs where rs.session_id = p_session loop
    foreach v_offset in array offsets loop
      v_at := s.starts_at - make_interval(mins => v_offset);
      if s.starts_at is null
         or s.state not in ('published', 'in_progress')
         or r.status <> 'confirmed'
         or v_at <= now()
      then
        perform public.cancel_job(public.reminder_key(p_session, v_offset, r.member_id));
      else
        perform public.enqueue_job(
          'send_reminder',
          jsonb_build_object('session_id', p_session, 'member_id', r.member_id, 'offset_minutes', v_offset),
          public.reminder_key(p_session, v_offset, r.member_id),
          v_at,
          null,
          3);   -- 11 §1.3, scheduled: 3 attempts. A missed reminder cannot be
                -- retried usefully long after its moment.
        v_count := v_count + 1;
      end if;
    end loop;
  end loop;

  -- 08 §4.2: the nudge to non-responders — in-app only, ONCE, at the -7 d
  -- mark. The restraint is the point; it is what keeps "remind the people who
  -- have not answered" from becoming the reason people mute the platform.
  if s.starts_at is not null and s.state = 'published' and s.starts_at - interval '7 days' > now() then
    perform public.enqueue_job(
      'rsvp_nudge',
      jsonb_build_object('session_id', p_session),
      'nudge:' || p_session::text,
      s.starts_at - interval '7 days',
      null,
      3);
  else
    perform public.cancel_job('nudge:' || p_session::text);
  end if;

  return v_count;
end $$;
revoke execute on function public.schedule_session_reminders(uuid) from public, anon, authenticated;
grant  execute on function public.schedule_session_reminders(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- cancel_member_reminders — one member's keys, across every configured offset.
-- Used when a member cancels their own seat (08 §4.1, row 3).
-- ═══════════════════════════════════════════════════════════════════════════
create function public.cancel_member_reminders(p_session uuid, p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  offsets  int[];
  v_offset int;
begin
  select coalesce(os.reminder_offsets_minutes, '{10080,1440,120}')
    into offsets
    from public.org_settings os
    join public.sessions s on s.org_id = os.org_id
   where s.id = p_session;
  -- Every DEFAULT offset is cancelled too, not only the org's current set: an
  -- admin who changed the schedule after this member reserved left jobs under
  -- the old keys, and those must go as well.
  offsets := array(select distinct unnest(coalesce(offsets, '{}') || array[10080, 1440, 120]));
  foreach v_offset in array offsets loop
    perform public.cancel_job(public.reminder_key(p_session, v_offset, p_member));
  end loop;
end $$;
revoke execute on function public.cancel_member_reminders(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.cancel_member_reminders(uuid, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- schedule_rating_prompt — REQ-RAT-007, 08 §4.3. One job per SESSION, not per
-- member: the prompt filters to members who have not yet rated at SEND time,
-- because most ratings arrive in that first hour and a job enqueued per
-- attendee would have to be cancelled one by one as they came in.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.schedule_rating_prompt(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s     public.sessions;
  delay int;
begin
  select * into s from public.sessions where id = p_session;
  if not found or s.completed_at is null then
    perform public.cancel_job('rate:' || p_session::text);
    return;
  end if;
  select coalesce(os.rating_prompt_delay_minutes, 60) into delay
    from public.org_settings os where os.org_id = s.org_id;

  perform public.enqueue_job(
    'rating_prompt',
    jsonb_build_object('session_id', p_session),
    'rate:' || p_session::text,
    s.completed_at + make_interval(mins => coalesce(delay, 60)),
    null,
    3);
end $$;
revoke execute on function public.schedule_rating_prompt(uuid) from public, anon, authenticated;
grant  execute on function public.schedule_rating_prompt(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- rsvps_notify — the `TODO(notify, M3)` sites of 0014, at the table.
--
-- REQ-RSV-004 is the one that matters: a member PROMOTED off the waitlist who
-- never hears about it holds a seat they do not know about, and it goes to
-- waste. So `MSG-rsvp_promoted` is in 08 §1.7's non-optional set and its
-- calendar event is CREATED, not updated (08 §6.3) — a waitlisted member
-- never had one.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.rsvps_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s        public.sessions;
  promoted boolean;
begin
  select * into s from public.sessions where id = new.session_id;

  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;   -- a waitlist_position shuffle is not news
  end if;

  promoted := tg_op = 'UPDATE' and old.status = 'waitlisted' and new.status = 'confirmed';

  if new.status = 'confirmed' then
    perform public.notify(
      new.org_id, new.member_id, 'my_sessions',
      jsonb_build_object('session_id', new.session_id, 'title', s.title, 'startsAt', s.starts_at, 'rsvp_id', new.id),
      case when promoted then 'MSG-rsvp_promoted' else 'MSG-rsvp_confirmed' end);
    perform public.schedule_session_reminders(new.session_id);
    -- 08 §6.3: enqueued INSIDE the transaction that creates the RSVP, so
    -- there is no window in which the seat is held and the calendar is not
    -- going to hear about it. `cal:{rsvp_id}` is 11 §2.2's key, verbatim.
    perform public.enqueue_job(
      'calendar_upsert', jsonb_build_object('rsvp_id', new.id), 'cal:' || new.id::text, null, null, 8);

  elsif new.status = 'waitlisted' then
    perform public.notify(
      new.org_id, new.member_id, 'my_sessions',
      jsonb_build_object('session_id', new.session_id, 'title', s.title, 'position', new.waitlist_position),
      'MSG-rsvp_waitlisted');

  else   -- cancelled or late_cancelled
    perform public.cancel_member_reminders(new.session_id, new.member_id);
    perform public.cancel_job('cal:' || new.id::text);
    perform public.enqueue_job(
      'calendar_delete', jsonb_build_object('rsvp_id', new.id), 'caldel:' || new.id::text, null, null, 8);
  end if;

  return new;
end $$;

-- AFTER, not BEFORE: `notify()` writes a `notifications` row referencing this
-- session, and the reminder scheduler counts confirmed RSVPs — both want the
-- row as it will be, not as it is being decided.
create trigger rsvps_notify after insert or update of status on public.rsvps
  for each row execute function public.rsvps_notify();

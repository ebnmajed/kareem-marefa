-- notify (wave 9) — one reminder stream per DAY, and a key set that can shrink.
--
-- Serves:  REQ-SES-015 («reminders fire per day») · REQ-NTF-004 (rescheduling
--          MOVES a reminder, it does not duplicate one) · REQ-TSK-005 is NOT
--          touched: nothing here names a task table
-- Cites:   DEC-119 (`MSG-reminder_*` fire per day) · DEC-150 contracts 1, 2, 8 ·
--          DEC-151 (the offset rule, approved) · 08 §4.1, §4.2 · 11 §2.6 ·
--          0034, 0035, 0040 (this function set as it stands) · 0100 (session_days)
--          docs/plan/notes/notify.md «Wave 9 plan» W1, W3
--
-- ── 03 §8.2 rows (added with this migration) ────────────────────────────────
--   | `RPC-schedule_session_reminders.per_day` | A confirmed seat on a three-day session holds one
--     reminder per (day, offset) that the rule below admits, and at ONE day exactly the three jobs
--     under the three keys it holds today. |
--   | `RPC-schedule_session_reminders.offset_after_previous_day` | An offset fires for day `k` only
--     when its moment falls after day `k - 1` has ended: three consecutive evenings get the 2-hour
--     reminder each day and the 1-day and 7-day once (`08` §4.2). |
--   | `RPC-cancel_unlisted_reminders.sweeps` | Every pending reminder of a session that the
--     scheduler did not just enqueue is removed — a day deleted, a day reordered, an offset the org
--     dropped, a seat cancelled. No key outlives the reason for it. |
--   | `RPC-cancel_member_reminders.every_day` | Cancelling a seat removes that member's keys for
--     EVERY day and every offset, including offsets the org has since stopped using. |
--   | `RPC-send_reminder_notification.day_scoped` | The reminder names the DAY's moment and the
--     DAY's place; a reminder for a day that no longer exists sends nothing. |
--
-- ── The rule, and why it is a rule rather than a list of «long» offsets ─────
-- Left alone, a three-day workshop on consecutive evenings would send «بعد
-- أسبوع» three times on one afternoon, because all three moments fall before
-- day one begins. The test is not how big the offset is; it is whether the
-- reminder's moment falls while the member is already at the workshop or has
-- just been told the same thing. So:
--
--   an offset fires for day k  ⇔  k = 1  OR  (day_k.starts_at - offset) > day_(k-1).ends_at
--
-- Three consecutive evenings: the 2-hour reminder each day, the 1-day and the
-- 7-day once. Three weekly meetings: the 2-hour and the 1-day each time, the
-- 7-day once. Three monthly meetings: all three, each time. At ONE day there is
-- no previous day, every offset fires, and the keys are today's.

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · reminder_key — the day's position, and nothing for the first.
--
-- ★ Position 1 carries the key a one-day session has had since M3, so the
-- reminder jobs already pending in production are MOVED by the next schedule
-- rather than joined by a second set under a new name (contract 2).
--
-- The suffix is the POSITION and never the day id: the set of keys then
-- depends on nothing but the number of days, so reordering two days leaves the
-- same set and re-enqueues each with the right payload, where an id suffix
-- would orphan the key of the day that moved out of first place.
--
-- A new parameter is trailing and defaulted and the old signature is dropped in
-- this file, so a three-argument call still resolves and nothing ever sees two
-- overloads (rule 2, `0085`'s lesson).
-- ═══════════════════════════════════════════════════════════════════════════
drop function public.reminder_key(uuid, int, uuid);

create function public.reminder_key(p_session uuid, p_offset int, p_member uuid, p_position int default 1) returns text
language sql immutable parallel safe set search_path = '' as $$
  select 'remind:' || p_session::text || ':' || p_offset::text || ':' || p_member::text
      || case when coalesce(p_position, 1) <= 1 then '' else ':' || p_position::text end
$$;
grant execute on function public.reminder_key(uuid, int, uuid, int) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · cancel_unlisted_reminders — the sweep that lets a key set SHRINK.
--
-- `schedule_session_reminders()` has always recomputed every offset rather
-- than diffing, which is why a session moved later gets its past offsets back.
-- With days the key set can also get smaller — a day deleted, a day reordered,
-- an offset the rule above now suppresses — and nothing in the function can
-- know which keys used to exist.
--
-- The queue knows. This removes every pending reminder of the session that the
-- scheduler did not just enqueue, which is exact, needs no margin and no memory
-- of the past, and retires the guess `cancel_member_reminders()` used to make
-- (it unioned the org's current offsets with the hard-coded defaults and said
-- so in its own comment).
--
-- Removal is through `public.cancel_job()` — the one door `0034` opened — never
-- `graphile_worker.remove_job` directly.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.cancel_unlisted_reminders(p_session uuid, p_keep text[]) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_keys text[];
  v_key  text;
  v_n    int := 0;
begin
  if to_regnamespace('graphile_worker') is null then
    raise exception 'graphile_worker schema is not installed — run `npx graphile-worker --schema-only -c <DATABASE_URL>` (DEC-046)'
      using errcode = '3F000';
  end if;

  -- Collected first, removed after: `cancel_job()` deletes rows from the very
  -- relation a cursor would be walking.
  select array_agg(j.key) into v_keys
    from graphile_worker.jobs j
   where j.key like ('remind:' || p_session::text || ':%')
     and not (j.key = any (coalesce(p_keep, '{}')));

  foreach v_key in array coalesce(v_keys, '{}') loop
    perform public.cancel_job(v_key);
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.cancel_unlisted_reminders(uuid, text[]) from public, anon, authenticated;
grant  execute on function public.cancel_unlisted_reminders(uuid, text[]) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · schedule_session_reminders — JOB-schedule_reminders' body, per day.
--
-- ★ The key is still the whole mechanism. `enqueue_job()` fixes
-- `job_key_mode => 'replace'` (0025), so re-running this after a day moves
-- leaves ONE pending job per (member, offset, day) at the new time. There is no
-- cancel-and-recreate window in which both or neither exists — which is the
-- concrete reason graphile-worker was chosen over pg-boss (DEC-018).
--
-- An offset whose moment has already passed is not enqueued, and the sweep
-- removes it: a job with a `run_at` in the past runs the instant a worker sees
-- it, so enqueueing one would send «غدًا» about a day starting in ten minutes.
-- A day moved LATER gets its past offsets back, because this recomputes every
-- offset of every day every time rather than diffing.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.schedule_session_reminders(p_session uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  s        public.sessions;
  offsets  int[];
  v_offset int;
  d        record;
  r        record;
  v_at     timestamptz;
  v_key    text;
  v_keep   text[] := '{}';
  v_count  int := 0;
  v_live   boolean;
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
  -- reminders: the keep list stays empty and the sweep removes every key.
  v_live := s.starts_at is not null and s.state in ('published', 'in_progress');

  if v_live then
    for d in
      select sd.id, sd.position, sd.starts_at,
             -- The previous day's end, which is the whole of the rule.
             lag(sd.ends_at) over (order by sd.position) as prev_ends_at
        from public.session_days sd
       where sd.session_id = p_session
       order by sd.position
    loop
      for r in
        select rs.member_id from public.rsvps rs
         where rs.session_id = p_session and rs.status = 'confirmed'
      loop
        foreach v_offset in array offsets loop
          v_at := d.starts_at - make_interval(mins => v_offset);
          if v_at > now() and (d.prev_ends_at is null or v_at > d.prev_ends_at) then
            v_key := public.reminder_key(p_session, v_offset, r.member_id, d.position);
            perform public.enqueue_job(
              'send_reminder',
              jsonb_build_object(
                'session_id',     p_session,
                'member_id',      r.member_id,
                'offset_minutes', v_offset,
                'session_day_id', d.id),
              v_key,
              v_at,
              null,
              3);   -- 11 §1.3, scheduled: 3 attempts. A missed reminder cannot
                    -- be retried usefully long after its moment.
            v_keep := v_keep || v_key;
            v_count := v_count + 1;
          end if;
        end loop;
      end loop;
    end loop;
  end if;

  -- Everything this run did not enqueue stops existing: a cancelled seat, a
  -- deleted day, an offset the org dropped, an offset the rule now suppresses.
  perform public.cancel_unlisted_reminders(p_session, v_keep);

  -- 08 §4.2: the nudge to non-responders — in-app only, ONCE, at the -7 d
  -- mark, and ONCE PER SESSION however many days it has. A member is being
  -- asked whether they want the workshop, not whether they want Wednesday.
  -- `s.starts_at` is the first day's start (contract 1), so the moment is
  -- unchanged at every n.
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

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · cancel_member_reminders — one member's keys, every offset, every day.
--
-- The old body walked the org's current offsets unioned with the hard-coded
-- defaults, and admitted in its own comment that an admin who changed the
-- schedule after this member reserved left jobs under keys it could not see.
-- The queue is the honest source: one pattern, every key, whatever offset or
-- day produced it.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.cancel_member_reminders(p_session uuid, p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_keys text[];
  v_key  text;
begin
  if to_regnamespace('graphile_worker') is null then
    raise exception 'graphile_worker schema is not installed — run `npx graphile-worker --schema-only -c <DATABASE_URL>` (DEC-046)'
      using errcode = '3F000';
  end if;

  -- `remind:{session}:{offset}:{member}` with an optional `:{position}`. A
  -- uuid carries no regular-expression metacharacter, so interpolating the two
  -- ids is safe and the anchors make the match exact.
  select array_agg(j.key) into v_keys
    from graphile_worker.jobs j
   where j.key ~ ('^remind:' || p_session::text || ':[0-9]+:' || p_member::text || '(:[0-9]+)?$');

  foreach v_key in array coalesce(v_keys, '{}') loop
    perform public.cancel_job(v_key);
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 · send_reminder_notification — JOB-send_reminder's body, for one DAY.
--
-- The job may outlive its reason. A reminder is scheduled days ahead; in
-- between, the member can cancel, the session can be cancelled, the seat can
-- lapse — and now the DAY can be deleted. The conditions are re-read here, at
-- the moment of sending, and a reminder with nothing to remind anyone of is a
-- silent no-op rather than a message about a meeting that is not happening.
--
-- ★ A trailing, defaulted `p_day`, with the three-argument signature dropped in
-- this file: `main`'s worker sends three arguments and its pending jobs carry
-- no day in their payload, and both resolve to the session's FIRST day — which
-- at one day is the only day (contract 2).
--
-- ★ `venue` is new in the payload and it is a FIX, not a feature: `08` §3.2's
-- three reminder templates have always printed «المكان: {{venue}}» against a
-- payload that never carried one, so every reminder mail since M3 has said
-- «المكان: » and nothing. At several days it is not optional — the room can
-- differ per meeting. Flagged to the lead as a named difference.
-- ═══════════════════════════════════════════════════════════════════════════
drop function public.send_reminder_notification(uuid, uuid, int);

create function public.send_reminder_notification(p_session uuid, p_member uuid, p_offset int, p_day uuid default null)
  returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  s       public.sessions;
  r       public.rsvps;
  d       public.session_days;
  v_days  int;
begin
  select * into s from public.sessions where id = p_session;
  if not found or s.state not in ('published', 'in_progress') or s.starts_at is null then
    return false;
  end if;
  select * into r from public.rsvps where session_id = p_session and member_id = p_member;
  if not found or r.status <> 'confirmed' then
    return false;
  end if;

  if p_day is not null then
    -- ★ A NAMED day that no longer exists sends NOTHING. Falling back to the
    -- first day here would mail «بعد ساعتين» about Wednesday at the moment
    -- Thursday's reminder was due, for a Thursday that was cancelled. The
    -- sweep removes such a key the next time the session is scheduled; this is
    -- the guard for the job that fires in between.
    select * into d from public.session_days where id = p_day and session_id = p_session;
    if d.id is null then
      return false;
    end if;
  else
    -- No day named at all — `main`'s three-argument call, and every reminder
    -- queued before the migration. The session's FIRST day, which at one day
    -- is the only day (contract 2).
    select * into d from public.session_days where session_id = p_session order by position limit 1;
    if d.id is null then
      return false;   -- a session with no day has nothing to remind anyone of
    end if;
  end if;
  select count(*) into v_days from public.session_days where session_id = p_session;

  perform public.notify(
    s.org_id, p_member, 'reminders',
    jsonb_build_object(
      'session_id',     p_session,
      'title',          s.title,
      -- THE DAY's moment and THE DAY's room. At one day both are the session's
      -- own, because contract 1 derives the session's window from its one day.
      'startsAt',       d.starts_at,
      'venue',          public.session_venue_label(d.venue_id, d.custom_venue_name),
      'offset_minutes', p_offset,
      'dayPosition',    d.position,
      'dayCount',       v_days),
    public.reminder_message_key(p_offset));
  return true;
end $$;
revoke execute on function public.send_reminder_notification(uuid, uuid, int, uuid) from public, anon, authenticated;
grant  execute on function public.send_reminder_notification(uuid, uuid, int, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6 · org_settings_reschedule — the removal loop is the sweep's now.
--
-- `0040` cancelled the offsets the org had dropped explicitly, from
-- `old.reminder_offsets_minutes`, because `schedule_session_reminders()` walked
-- only the NEW array and could not see them. The sweep sees every pending key
-- of the session, so the explicit loop is not just redundant — it was also
-- blind to a key under a position suffix, which it would now leave behind.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.org_settings_reschedule() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s record;
begin
  if new.reminder_offsets_minutes is distinct from old.reminder_offsets_minutes then
    for s in select id from public.sessions
              where org_id = new.org_id and state in ('published', 'in_progress')
    loop
      -- Enqueues the new set and sweeps everything else of this session away.
      perform public.schedule_session_reminders(s.id);
    end loop;
  end if;

  if new.rating_prompt_delay_minutes is distinct from old.rating_prompt_delay_minutes then
    -- `rate:{session}` is one key per session — one rating per session, at
    -- every n (DEC-120) — so re-running the scheduler moves it.
    for s in select id from public.sessions
              where org_id = new.org_id and state = 'completed' and completed_at is not null
                and completed_at > now() - interval '7 days'
    loop
      perform public.schedule_rating_prompt(s.id);
    end loop;
  end if;

  return new;
end $$;

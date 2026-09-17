-- notify (wave 9) — CONTRACT 11: a day set that changed is announced ONCE, by
-- the writer that knows the whole of it.
--
-- Serves:  REQ-SES-009 / REQ-NTF-005 (a change tells the member the OLD value
--          and the NEW one) · REQ-SES-015 · REQ-NTF-004 · REQ-CAL-005
-- Cites:   DEC-151 (contract 11, and why this is a call and not a trigger) ·
--          DEC-150 contracts 1, 2 · 08 §1.2, §3.3 · 0036 (sessions_notify) ·
--          0100 (the two triggers that keep the pair in step) ·
--          docs/plan/notes/notify.md «Wave 9 plan» W10
--
-- ── 03 §8.2 rows (added with this migration) ────────────────────────────────
--   | `RPC-session_days_changed.names_the_day` | Moving day 2 of a three-day session — which moves
--     no column of `sessions` — notifies every confirmed and waitlisted member, with the old value,
--     the new one and WHICH day moved. |
--   | `RPC-session_days_changed.once_per_transaction` | However many statements a day-aware writer
--     takes, one member receives ONE notice, built from the whole before and the whole after. |
--   | `RPC-session_days_changed.day_added_or_removed` | A day added to or removed from a published
--     session is announced as a change to the number of days — `MSG-session_changed`, no new key. |
--   | `RPC-session_days_changed.definer_only` | No client role may notify a session's members. |
--   | `POL-sessions.change_notice.days_writer_stands_down` | `sessions_notify()` does not announce a
--     time or venue change made by a day-aware writer; that writer announces it itself, so ONE
--     notice reaches the member at every number of days. |
--
-- ── Why this is a call and not a trigger on `session_days` ─────────────────
-- A row trigger fires MID-WRITE. `schedule_session()` writes its days one row
-- at a time, so when day 2's row fires, day 3's change has not been written
-- yet — and any guard that de-duplicates a multi-row change would send the
-- first row's partial truth and suppress the rest: move days 2 and 3, and the
-- member hears about day 2. The one day-aware writer already holds the whole
-- before and the whole after. DEC-151 ruled it; there is NO trigger on
-- `session_days` that notifies.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0 · the day's place, from either snapshot shape.
--
-- ★ `docs/plan/notes/notify.md` §W10.2 publishes the snapshot as
-- `{ id, position, starts_at, ends_at, venue_label }`. `0106`'s day-aware
-- `schedule_session()` builds `jsonb_agg(to_jsonb(d))` instead — the whole row,
-- which carries `venue_id` and the custom-venue trio and NO `venue_label`.
--
-- Both are honest answers and both name the same day, so this reads either: the
-- label when the caller computed one, the columns when it did not. Without it a
-- day's VENUE moving would compare null against null and be announced to
-- nobody, which is the half of `REQ-SES-009` that sends people to the wrong
-- room.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.session_day_place(p_day jsonb) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(
           p_day ->> 'venue_label',
           public.session_venue_label(nullif(p_day ->> 'venue_id', '')::uuid, p_day ->> 'custom_venue_name'))
$$;
revoke execute on function public.session_day_place(jsonb) from public, anon;
grant  execute on function public.session_day_place(jsonb) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · session_days_changed — contract 11.
--
-- `p_before` and `p_after` are the day set as an array of
-- `{ id, position, starts_at, ends_at, venue_label }` — or of whole
-- `session_days` rows, which `session_day_place()` above reads just as well.
-- Null is the empty set. Days are matched by `id` — never by position, which is
-- a derived rank two different days can hold before and after.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.session_days_changed(p_session uuid, p_before jsonb, p_after jsonb) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s          public.sessions;
  v_before   jsonb := coalesce(p_before, '[]'::jsonb);
  v_after    jsonb := coalesce(p_after,  '[]'::jsonb);
  v_n_before int;
  v_n_after  int;
  v_changes  jsonb := '[]'::jsonb;
  v_seen     text;
  a          jsonb;
  b          jsonb;
  v_day      jsonb;
  r          record;
begin
  -- ONE notice per session per transaction. A day-aware writer calls this once
  -- by contract; the guard is what makes a retry, or a second call site added
  -- later, unable to mail the same room twice.
  v_seen := coalesce(current_setting('kareem.days_notified', true), '');
  if position(p_session::text in v_seen) > 0 then
    return;
  end if;
  perform set_config('kareem.days_notified', v_seen || p_session::text || ',', true);

  select * into s from public.sessions where id = p_session;
  -- Editing a draft misleads nobody, and a cancelled session has already said
  -- everything it needs to. `0036`'s rule, unchanged.
  if not found or s.state not in ('published', 'in_progress') then
    -- The reminder schedule still has to follow the days: a draft that gains a
    -- day holds no reminders, and one published later is scheduled then.
    perform public.schedule_session_reminders(p_session);
    return;
  end if;

  v_n_before := jsonb_array_length(v_before);
  v_n_after  := jsonb_array_length(v_after);

  for a in select value from jsonb_array_elements(v_after) loop
    select value into b from jsonb_array_elements(v_before) e(value) where e.value->>'id' = a->>'id';
    if b is null then
      continue;   -- a day that was added: the count entry below is what says so
    end if;

    -- ★ `day` and `days` are ABSENT while the session has one day, so a
    -- one-day session's payload is the one `sessions_notify()` has written
    -- since M3, key for key. `REQ-SES-018`'s first rule, applied to a notice:
    -- there is no day concept in a session that has one.
    v_day := case when v_n_after > 1
                  then jsonb_build_object('day', (a->>'position')::int, 'days', v_n_after)
                  else '{}'::jsonb end;

    if (b->>'starts_at') is distinct from (a->>'starts_at') then
      v_changes := v_changes || (jsonb_build_object('field', 'starts_at', 'from', b->'starts_at', 'to', a->'starts_at') || v_day);
    end if;
    -- ★ The END is announced too, and only here. `sessions.ends_at` is the LAST
    -- day's end, so at several days a middle day's end moves no column of the
    -- session and nothing else would ever mention it.
    if (b->>'ends_at') is distinct from (a->>'ends_at') then
      v_changes := v_changes || (jsonb_build_object('field', 'ends_at', 'from', b->'ends_at', 'to', a->'ends_at') || v_day);
    end if;
    if public.session_day_place(b) is distinct from public.session_day_place(a) then
      v_changes := v_changes || (jsonb_build_object(
        'field', 'venue',
        'from', public.session_day_place(b),
        'to',   public.session_day_place(a)) || v_day);
    end if;
  end loop;

  -- A day added or removed. `08` §1.2's row reads «time or venue changed» and
  -- the day set is both; `notify()` refuses a key outside the matrix, so this
  -- is `MSG-session_changed` with a field of its own rather than a new
  -- `MSG-*` — which would be a plan change (DEC-151).
  if v_n_before is distinct from v_n_after then
    v_changes := v_changes || jsonb_build_object('field', 'days', 'from', v_n_before, 'to', v_n_after);
  end if;

  if jsonb_array_length(v_changes) > 0 then
    for r in
      select rs.member_id, rs.id as rsvp_id, rs.status from public.rsvps rs
       where rs.session_id = p_session and rs.status in ('confirmed', 'waitlisted')
    loop
      perform public.notify(
        s.org_id, r.member_id, 'my_sessions',
        jsonb_build_object(
          'session_id', p_session,
          'title',      s.title,
          -- The SESSION's stored window and first venue, as `0036` sends them:
          -- the headline is the workshop, and `changes` is what moved.
          'startsAt',   s.starts_at,
          'venue',      public.session_venue_label(s.venue_id, s.custom_venue_name),
          'changes',    v_changes),
        'MSG-session_changed');

      -- REQ-CAL-005: the update reaches the calendar without the member
      -- re-adding anything. One job per RESERVATION at every n — it fans out
      -- over the days, creates the new one and removes the entry of a day that
      -- is gone (`01_calendar_per_day.sql`).
      if r.status = 'confirmed' then
        perform public.enqueue_job(
          'calendar_upsert', jsonb_build_object('rsvp_id', r.rsvp_id), 'cal:' || r.rsvp_id::text, null, null, 8);
      end if;
    end loop;
  end if;

  -- ★ Unconditionally, even when nothing a member would be told about changed:
  -- a day re-created with the same window has a new id, and the sweep has to
  -- run. `schedule_session_reminders()` is idempotent by key.
  perform public.schedule_session_reminders(p_session);
end $$;
revoke execute on function public.session_days_changed(uuid, jsonb, jsonb) from public, anon, authenticated;
grant  execute on function public.session_days_changed(uuid, jsonb, jsonb) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · sessions_notify — one notice, at every number of days.
--
-- `sessions` writes the session FIRST and its days second (`0100`'s trigger B
-- then finds nothing distinct), so this fires exactly once, on that first
-- write, BEFORE `session_days_changed()` runs. Left alone, a day-aware call
-- that moved day 1 and day 2 would send two mails — and a day-aware call on a
-- ONE-DAY session would send two where `main` sends one, which is the
-- byte-identity failure contract 2 exists to prevent.
--
-- ★ So the change branch — and only the change branch — stands down for a
-- writer that has set `kareem.days_writer`. That makes the rule exact and
-- statable: A WRITER THAT SETS `kareem.days_writer` MUST CALL
-- `session_days_changed()` BEFORE IT RETURNS. Publish, cancel and complete are
-- untouched and still fire under the flag.
--
-- Everything else in this function is `0036`'s, unchanged.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.sessions_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r            record;
  changes      jsonb := '[]'::jsonb;
  old_venue    text;
  new_venue    text;
  v_published  boolean;
  v_cancelled  boolean;
  v_completed  boolean;
  v_days       int;
  v_day        jsonb;
begin
  v_published := old.state is distinct from new.state and new.state = 'published';
  v_cancelled := old.state is distinct from new.state and new.state = 'cancelled';
  v_completed := old.state is distinct from new.state and new.state = 'completed';

  -- ── 1. Published (08 §1.2) ───────────────────────────────────────────────
  if v_published then
    for r in
      select m.id from public.members m where m.org_id = new.org_id and m.status = 'active'
    loop
      perform public.notify(
        new.org_id, r.id, 'new_sessions',
        jsonb_build_object(
          'session_id', new.id,
          'title',      new.title,
          'startsAt',   new.starts_at,
          'venue',      public.session_venue_label(new.venue_id, new.custom_venue_name)),
        'MSG-session_published');
    end loop;
    perform public.schedule_session_reminders(new.id);
    return new;
  end if;

  -- ── 2. Cancelled (08 §1.2, REQ-SES-010) ──────────────────────────────────
  if v_cancelled then
    for r in
      select rs.member_id, rs.id as rsvp_id from public.rsvps rs
       where rs.session_id = new.id and rs.status in ('confirmed', 'waitlisted')
    loop
      perform public.notify(
        new.org_id, r.member_id, 'my_sessions',
        jsonb_build_object(
          'session_id', new.id,
          'title',      new.title,
          'startsAt',   old.starts_at,
          'reason',     new.cancellation_reason),
        'MSG-session_cancelled');
      perform public.cancel_member_reminders(new.id, r.member_id);
      perform public.cancel_job('cal:' || r.rsvp_id::text);
      perform public.enqueue_job(
        'calendar_delete', jsonb_build_object('rsvp_id', r.rsvp_id), 'caldel:' || r.rsvp_id::text, null, null, 8);
    end loop;
    perform public.cancel_job('nudge:' || new.id::text);
    perform public.cancel_job('rate:' || new.id::text);
    return new;
  end if;

  -- ── 3. Completed — REQ-RAT-007's clock starts here ───────────────────────
  if v_completed then
    perform public.schedule_rating_prompt(new.id);
    return new;
  end if;

  -- ── 4. Time or venue moved — REQ-SES-009 ─────────────────────────────────
  if new.state not in ('published', 'in_progress') then
    return new;
  end if;

  -- ★ Contract 11. The day-aware writer holds the whole before and after and
  -- announces it itself; announcing here as well would be the second mail.
  if current_setting('kareem.days_writer', true) is not distinct from 'on' then
    return new;
  end if;

  select count(*) into v_days from public.session_days where session_id = new.id;
  -- Absent while the session has one day, so the payload does not move.
  -- `sessions.starts_at` IS the first day's start and the venue IS the first
  -- day's (contract 1), so when there is a day to name it is day one.
  v_day := case when v_days > 1 then jsonb_build_object('day', 1, 'days', v_days) else '{}'::jsonb end;

  if old.starts_at is distinct from new.starts_at then
    changes := changes || (jsonb_build_object('field', 'starts_at', 'from', old.starts_at, 'to', new.starts_at) || v_day);
  end if;
  old_venue := public.session_venue_label(old.venue_id, old.custom_venue_name);
  new_venue := public.session_venue_label(new.venue_id, new.custom_venue_name);
  if old_venue is distinct from new_venue then
    changes := changes || (jsonb_build_object('field', 'venue', 'from', old_venue, 'to', new_venue) || v_day);
  end if;

  if jsonb_array_length(changes) = 0 then
    return new;   -- a title edit is not something to mail a room full of people about
  end if;

  for r in
    select rs.member_id, rs.id as rsvp_id, rs.status from public.rsvps rs
     where rs.session_id = new.id and rs.status in ('confirmed', 'waitlisted')
  loop
    perform public.notify(
      new.org_id, r.member_id, 'my_sessions',
      jsonb_build_object(
        'session_id', new.id,
        'title',      new.title,
        'startsAt',   new.starts_at,
        'venue',      new_venue,
        'changes',    changes),
      'MSG-session_changed');
    if r.status = 'confirmed' then
      perform public.enqueue_job(
        'calendar_upsert', jsonb_build_object('rsvp_id', r.rsvp_id), 'cal:' || r.rsvp_id::text, null, null, 8);
    end if;
  end loop;

  -- ★ REQ-NTF-004: the reminders MOVE. Same keys, new run_at.
  perform public.schedule_session_reminders(new.id);
  return new;
end $$;

-- promoted by the lead at wave-2 sync 4 · notify (wave 2, M3) — the session notices M2 deferred (DEC-045).
--
-- Serves:  REQ-SES-009 / REQ-NTF-005 (a time or venue change tells the member
--          the OLD value and the NEW one) · REQ-SES-010 (cancellation) ·
--          REQ-RAT-007 (the prompt is scheduled when the session completes) ·
--          REQ-NTF-004 (a rescheduled session MOVES its reminders) ·
--          REQ-CAL-005 (a change propagates to every synced calendar)
-- Cites:   08 §1.2, §3.3 (the worked example), §6.3 · 11 §2.2 ·
--          0026 (notify()) · 0003 (the schedulers, cancel_job)
--
-- ── 03 §8.2 rows (added with this migration) ────────────────────────────────
--   | `POL-sessions.change_notice` | Moving a published session notifies confirmed AND waitlisted
--     members with both values, moves their reminders, and enqueues one calendar upsert per
--     confirmed seat. |
--   | `POL-sessions.change_notice.non_optional` | `MSG-session_changed` and `MSG-session_cancelled`
--     reach a member who muted `my_sessions` on both channels (`08` §1.7). |
--   | `POL-sessions.change_notice.unpublished` | Editing a draft notifies nobody: there is nobody
--     holding a seat to mislead. |
--   | `POL-sessions.cancel_notice` | Cancelling removes every reminder key and the nudge, enqueues
--     a calendar delete per seat, and tells confirmed and waitlisted members why. |
--   | `POL-sessions.publish_notice` | Publishing announces the session once, to active members, and
--     never twice for one session. |
--
-- ── The requirement this exists for ─────────────────────────────────────────
-- 08 §3.3: "It states the old value and the new one, side by side. 'Session
-- details have changed, please check the page' makes the member do the
-- diffing, and some of them will not." So the trigger captures both values
-- and ships them in the payload; the worker formats them in the org's zone
-- and numerals and renders only the lines that actually moved.

-- ═══════════════════════════════════════════════════════════════════════════
-- session_venue_label — one place decides what "the venue" reads as, because
-- a session names EITHER a venue row or a free-text place (0010).
-- ═══════════════════════════════════════════════════════════════════════════
create function public.session_venue_label(p_venue uuid, p_custom text) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce((select v.name from public.venues v where v.id = p_venue), p_custom)
$$;
revoke execute on function public.session_venue_label(uuid, text) from public, anon;
grant  execute on function public.session_venue_label(uuid, text) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- sessions_notify — one AFTER UPDATE trigger, three distinct events.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.sessions_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r            record;
  changes      jsonb := '[]'::jsonb;
  old_venue    text;
  new_venue    text;
  v_published  boolean;
  v_cancelled  boolean;
  v_completed  boolean;
begin
  v_published := old.state is distinct from new.state and new.state = 'published';
  v_cancelled := old.state is distinct from new.state and new.state = 'cancelled';
  v_completed := old.state is distinct from new.state and new.state = 'completed';

  -- ── 1. Published (08 §1.2) ───────────────────────────────────────────────
  -- Announced ONCE: the guard is the state EDGE, not the state, so
  -- publish_session()'s walk through the chain (0021) fires this on the one
  -- update that reaches `published` and the clock's later moves fire nothing.
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
  -- Non-optional on both channels: someone who misses «أُلغيت الجلسة» travels
  -- to an empty room. Waitlisted members are told too — they were planning on
  -- the chance of a seat.
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
  -- Only for a session people are holding seats in. Editing a draft misleads
  -- nobody, and a cancelled session already said everything it needs to.
  if new.state not in ('published', 'in_progress') then
    return new;
  end if;

  if old.starts_at is distinct from new.starts_at then
    changes := changes || jsonb_build_object('field', 'starts_at', 'from', old.starts_at, 'to', new.starts_at);
  end if;
  old_venue := public.session_venue_label(old.venue_id, old.custom_venue_name);
  new_venue := public.session_venue_label(new.venue_id, new.custom_venue_name);
  if old_venue is distinct from new_venue then
    changes := changes || jsonb_build_object('field', 'venue', 'from', old_venue, 'to', new_venue);
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
        -- The worker formats these in the org's zone and numerals and drops
        -- any line whose two values are equal (08 §3.3, "only changed lines
        -- render"). Raw values travel, so the formatting rule lives in one
        -- place rather than in every trigger that reports a change.
        'changes',    changes),
      'MSG-session_changed');
    -- REQ-CAL-005: the update reaches the calendar without the member
    -- re-adding anything. Confirmed seats only — a waitlisted member has no
    -- event to move.
    if r.status = 'confirmed' then
      perform public.enqueue_job(
        'calendar_upsert', jsonb_build_object('rsvp_id', r.rsvp_id), 'cal:' || r.rsvp_id::text, null, null, 8);
    end if;
  end loop;

  -- ★ REQ-NTF-004: the reminders MOVE. Same keys, new run_at.
  perform public.schedule_session_reminders(new.id);
  return new;
end $$;

create trigger sessions_notify after update on public.sessions
  for each row execute function public.sessions_notify();

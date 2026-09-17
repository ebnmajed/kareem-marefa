-- notify (wave 9) — one calendar entry per DAY, with a one-day session's row,
-- job keys and provider event untouched.
--
-- Serves:  REQ-SES-015 («a member's calendar gains one entry per day») ·
--          REQ-CAL-004 (one event per member per day — the constraint, not job
--          logic) · REQ-CAL-005, REQ-CAL-006, REQ-CAL-008
-- Cites:   DEC-119 (the `calendar_events` bullet) · DEC-150 contracts 1, 2, 8 ·
--          DEC-151 (the carried `drop constraint`; the legacy insert's day) ·
--          0038 (this function set as it stands) · 0100, 0101 (the foundation) ·
--          08 §6.3 · 11 §2.2 · docs/plan/notes/notify.md «Wave 9 plan» W1, W2, W6
--
-- ── 03 §8.2 rows (added with this migration) ────────────────────────────────
--   | `RPC-record_calendar_sync.per_day` | One row per member per DAY: running it twice for one
--     (member, day) leaves ONE row, and a second day of the same session is a second row rather
--     than a conflict (`REQ-CAL-004`). |
--   | `RPC-record_calendar_sync.legacy_call_gets_first_day` | `main`'s six-argument call resolves to
--     the session's first day, so a one-day session's row after this migration IS the row it has
--     today — same id, same provider event id. |
--   | `RPC-calendar_sync_target.days_and_orphans` | The target carries one entry per day with that
--     day's provider event, and the rows whose day was deleted so the job can remove them; every
--     key `main`'s worker reads keeps its name and its meaning. |
--   | `RPC-record_calendar_event_removed.worker_only` | Only the worker may mark an orphaned row
--     removed; no client role may execute it. |
--   | `RPC-resync_calendars.definer_only` | No client role may fan calendar jobs out across an org. |
--
-- ── Why the constraint drop is in THIS file ─────────────────────────────────
-- `main`'s `record_calendar_sync()` says `on conflict (member_id, session_id)`.
-- Dropping that constraint in a different file from the one that replaces the
-- function gives a window in which every calendar sync in production fails
-- `42P10`, and the owner pushes before merging. So the two are one file, and
-- the `alter table` below is the LEAD's line, carried verbatim (DEC-151) — it
-- is the only DDL this track writes.

-- ═══════════════════════════════════════════════════════════════════════════
-- 0 · LEAD DDL (DEC-151)
-- ═══════════════════════════════════════════════════════════════════════════
alter table public.calendar_events drop constraint calendar_events_member_id_session_id_key;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · calendar_sync_target — the same answer as today, plus the days
--
-- ★ Every top-level key `main`'s worker reads keeps its name and its meaning,
-- because `main`'s worker runs against this schema between the owner's push
-- and the Railway redeploy (contract 2). `provider_event_id` is the FIRST
-- day's, so the old worker updates the event it created rather than making a
-- second one; `session` is the session's stored window and first venue, which
-- contract 1 keeps stored for exactly this reason.
--
-- `days` and `orphans` are new and the old worker ignores them.
--
-- `orphans` is the answer to «a day deleted from a session deletes its provider
-- events»: `0101`'s foreign key is `on delete set null (session_day_id)`, never
-- cascade, so the row outlives its day carrying the only record of the provider
-- event id. A null day therefore means exactly one thing — remove it.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.calendar_sync_target(p_rsvp uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r           public.rsvps;
  s           public.sessions;
  v_first     uuid;
  v_connected boolean;
  v_event_id  text;
begin
  select * into r from public.rsvps where id = p_rsvp;
  if not found then
    return null;
  end if;
  select * into s from public.sessions where id = r.session_id;
  select exists (select 1 from public.calendar_connections c where c.member_id = r.member_id) into v_connected;

  select d.id into v_first
    from public.session_days d where d.session_id = r.session_id order by d.position limit 1;
  select ce.provider_event_id into v_event_id
    from public.calendar_events ce
   where ce.member_id = r.member_id and ce.session_day_id = v_first;

  return jsonb_build_object(
    'rsvp_id',     r.id,
    'org_id',      r.org_id,
    'member_id',   r.member_id,
    'session_id',  r.session_id,
    'rsvp_status', r.status::text,
    'connected',   v_connected,
    'provider_event_id', v_event_id,
    'session', jsonb_build_object(
      'title',       s.title,
      'description', s.abstract,
      'starts_at',   s.starts_at,
      'ends_at',     s.ends_at,
      'time_zone',   s.time_zone,
      'state',       s.state::text,
      'cancelled',   s.state = 'cancelled',
      'location',    public.session_venue_label(s.venue_id, s.custom_venue_name)),
    -- One entry per day, in position order, each with that day's own window,
    -- venue and provider event. At one day this is one entry holding exactly
    -- what `session` above holds.
    'days', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'day_id',            d.id,
               'position',          d.position,
               'starts_at',         d.starts_at,
               'ends_at',           d.ends_at,
               'location',          public.session_venue_label(d.venue_id, d.custom_venue_name),
               'provider_event_id', ce.provider_event_id,
               'state',             ce.state::text) order by d.position), '[]'::jsonb)
        from public.session_days d
        left join public.calendar_events ce
          on ce.session_day_id = d.id and ce.member_id = r.member_id
       where d.session_id = r.session_id),
    -- Rows whose day has been deleted: still in the member's calendar, no
    -- longer anything the session has. The job removes them and marks the row.
    'orphans', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'calendar_event_id', ce.id,
               'provider_event_id', ce.provider_event_id)), '[]'::jsonb)
        from public.calendar_events ce
       where ce.member_id = r.member_id
         and ce.session_id = r.session_id
         and ce.session_day_id is null
         and ce.provider_event_id is not null
         and ce.state <> 'removed'));
end $$;
revoke execute on function public.calendar_sync_target(uuid) from public, anon, authenticated;
grant  execute on function public.calendar_sync_target(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · record_calendar_sync — keyed on the DAY.
--
-- ★ A NEW PARAMETER, TRAILING AND DEFAULTED, AND THE OLD SIGNATURE DROPPED IN
-- THIS FILE (rule 2, `0085`'s lesson). `create or replace` with a seventh
-- parameter would create a SECOND function beside the six-parameter one and
-- `main`'s six-argument call would become ambiguous. Dropped and re-created,
-- the six-argument call still resolves — through the default — and PostgREST
-- never sees two overloads.
--
-- A null day resolves to the session's FIRST day, which is what makes `main`'s
-- worker correct on this schema: at one day that is the only day, and the row
-- it writes is the row that already exists.
-- ═══════════════════════════════════════════════════════════════════════════
drop function public.record_calendar_sync(uuid, uuid, uuid, public.calendar_sync_state, text, text);

create function public.record_calendar_sync(
  p_org      uuid,
  p_member   uuid,
  p_session  uuid,
  p_state    public.calendar_sync_state,
  p_provider_event_id text default null,
  p_error    text default null,
  p_day      uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_day uuid := p_day;
  v_id  uuid;
begin
  if v_day is null then
    select d.id into v_day
      from public.session_days d where d.session_id = p_session order by d.position limit 1;
  end if;

  -- A session with no day at all — it has no window. There is nothing to key
  -- on, and `unique (member_id, session_day_id)` treats nulls as distinct, so
  -- an insert here would add a row on every call. Update what is there and
  -- insert nothing.
  if v_day is null then
    update public.calendar_events
       set provider_event_id = coalesce(p_provider_event_id, provider_event_id),
           state             = p_state,
           last_synced_at    = case when p_state in ('synced', 'removed') then now() else last_synced_at end,
           error             = p_error
     where member_id = p_member and session_id = p_session
     returning id into v_id;
    return v_id;
  end if;

  insert into public.calendar_events
    (org_id, member_id, session_id, session_day_id, provider_event_id, state, last_synced_at, error)
  values (p_org, p_member, p_session, v_day, p_provider_event_id, p_state,
          case when p_state in ('synced', 'removed') then now() end, p_error)
  on conflict (member_id, session_day_id) do update set
    -- A delete that 404s knows no event id; keep the one we had rather than
    -- nulling the only record of what was created.
    provider_event_id = coalesce(excluded.provider_event_id, public.calendar_events.provider_event_id),
    state             = excluded.state,
    last_synced_at    = coalesce(excluded.last_synced_at, public.calendar_events.last_synced_at),
    error             = excluded.error
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.record_calendar_sync(uuid, uuid, uuid, public.calendar_sync_state, text, text, uuid) from public, anon, authenticated;
grant  execute on function public.record_calendar_sync(uuid, uuid, uuid, public.calendar_sync_state, text, text, uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · record_calendar_event_removed — an orphan, by row id.
--
-- An orphaned row has no day, so `record_calendar_sync()` cannot address it:
-- its key is `(member_id, session_day_id)` and the day is gone. This closes
-- the row the delete job just acted on.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.record_calendar_event_removed(p_event uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.calendar_events
     set state = 'removed', error = null, last_synced_at = now()
   where id = p_event;
end $$;
revoke execute on function public.record_calendar_event_removed(uuid) from public, anon, authenticated;
grant  execute on function public.record_calendar_event_removed(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · resync_calendars — the reconciliation for contract 2's window.
--
-- Between the merge and the Railway redeploy, `main`'s worker runs against
-- this schema: it writes ONE provider event per reservation, recorded against
-- day 1 (§2 above), and on a cancellation it removes that one and leaves days
-- 2 and beyond in the member's calendar. Both are what it does today and both
-- are correct at one day; a multi-day session created in that window needs one
-- pass of the new worker to become right.
--
-- `cal:{rsvp_id}` and `caldel:{rsvp_id}` are the keys the jobs already have, so
-- this never creates a second job for a reservation that has one pending.
-- Run once after the redeploy (row L9's order).
-- ═══════════════════════════════════════════════════════════════════════════
create function public.resync_calendars(p_session uuid default null) returns int
language plpgsql security definer set search_path = '' as $$
declare
  r   record;
  v_n int := 0;
begin
  for r in
    select rs.id, rs.status
      from public.rsvps rs
      join public.sessions s on s.id = rs.session_id
     where (p_session is null or rs.session_id = p_session)
       and s.state in ('published', 'in_progress')
       and (rs.status = 'confirmed'
            or exists (select 1 from public.calendar_events ce
                        where ce.member_id = rs.member_id
                          and ce.session_id = rs.session_id
                          and ce.state <> 'removed'))
  loop
    if r.status = 'confirmed' then
      perform public.enqueue_job(
        'calendar_upsert', jsonb_build_object('rsvp_id', r.id), 'cal:' || r.id::text, null, null, 8);
    else
      perform public.enqueue_job(
        'calendar_delete', jsonb_build_object('rsvp_id', r.id), 'caldel:' || r.id::text, null, null, 8);
    end if;
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;
revoke execute on function public.resync_calendars(uuid) from public, anon, authenticated;
grant  execute on function public.resync_calendars(uuid) to service_role;

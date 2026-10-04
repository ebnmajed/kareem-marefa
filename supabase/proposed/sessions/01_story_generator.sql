-- sessions · wave 26, PR D (DEC-248 §5, DEC-251 §4) — the story generator: one frame per trigger, idempotent by key.
--
-- Serves:  REQ-STO-001 (a story from publication, no author) · REQ-STO-004 (a frame within a minute of each of eight
--          triggers, exactly once however often it fires) · REQ-STO-018 (nothing authored; cancelling ends the story)
-- Cites:   0010:17 (session_state) · 0024:78 (the transition guard — published once) · 0022:40, :67 (the clock) ·
--          0089:57 (transition_session) · 0045:45-60 (reserve_seat: the deadline and the priority window) ·
--          0100 (session_days) · 0115:192 (record_photo_upload, the only photos writer since 0174) · 0037:507
--          (photos_read) · 0178:48-55 (the same `when` on photos) · 0189 (materials_added_notify — its moment,
--          RE-STATED here, never edited) · 0116:70 (materials_read's phase gate) · 0198 (story_frames, the lead's)
--
-- ── One writer, never another track's function ──────────────────────────────────────────────────────────────────────
-- Every frame of a generated kind is written by `generate_story_frame()` and by nothing else. The eight triggers reach
-- it through three TRIGGERS on the tables whose writes they are (sessions, photos, materials) and one minutely CLOCK
-- function for the instants no row write marks. No function another track owns is replaced: the clock's two
-- functions, transition_session(), publish_session()/schedule_session(), record_photo_upload(),
-- materials_added_notify(), finalize_material_upload() and reserve_seat() are untouched — a trigger on their table
-- sees every path they write by.
--
-- ── The idempotency is the lead's constraint ────────────────────────────────────────────────────────────────────────
-- `unique (session_id, kind, trigger_key)` on story_frames (0198). The generator inserts `on conflict do nothing`, so a
-- trigger firing twice, the clock running twice in a minute, or a retried job write one row. Nothing here raises on an
-- expected input: these run INSIDE a publish, a clock move, the photo pipeline's record and a material's finalise,
-- where an exception would refuse the very write the story follows.
--
-- ── Coinciding triggers are one frame (DEC-251 §4.3, REQ-STO-004 amended) ───────────────────────────────────────────
-- With no priority window, «registration opens» IS the publication; with the default deadline, «registration closes»
-- IS the start. So `registration_opened` is written only when a priority window puts it after `published_at`, and
-- `registration_closed` only when the deadline is earlier than the first start.
--
-- ── n days, no branch ───────────────────────────────────────────────────────────────────────────────────────────────
-- `starts_soon` and `live` are per DAY (DEC-251 §4.4) and keyed on the day, so a one-day session's one day is simply
-- its only key. The night between two days is `open` (session-status.ts), so day k ≥ 2's `live` is the clock's.
--
-- Additive for `main`, which runs this schema before its code: the three hooks fire on writes main already makes and
-- write rows main never reads; the clock function is called by nothing until the new worker deploys, and its 24-hour
-- look-back then writes what is still inside its 24 hours, at its scheduled instant, so no expiry moves.

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · the one writer
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
create function public.generate_story_frame(
  p_session      uuid,
  p_kind         public.story_frame_kind,
  p_trigger_key  text,
  p_triggered_at timestamptz,
  p_day          uuid default null,
  p_photo        uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org   uuid;
  v_state public.session_state;
  v_id    uuid;
begin
  select s.org_id, s.state into v_org, v_state from public.sessions s where s.id = p_session;
  -- A cancelled story has ended (REQ-STO-018); a session before publication has none (REQ-STO-001).
  if v_org is null or v_state not in ('published', 'in_progress', 'completed', 'archived') then
    return null;
  end if;

  insert into public.story_frames (org_id, session_id, session_day_id, kind, trigger_key, triggered_at, photo_id)
  values (v_org, p_session, p_day, p_kind, p_trigger_key, p_triggered_at, p_photo)
  on conflict (session_id, kind, trigger_key) do nothing
  returning id into v_id;
  return v_id;
end $$;
-- No client role, and not the worker either: only the functions below call it, as its owner.
revoke all on function public.generate_story_frame(uuid, public.story_frame_kind, text, timestamptz, uuid, uuid)
  from public, anon, authenticated, service_role;

-- A day's key text: the instant, UTC, to the second — stable across time zones and sessions.
create function public.story_instant_key(p_at timestamptz) returns text
language sql immutable set search_path = '' as $$
  select to_char(p_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"');
$$;
revoke all on function public.story_instant_key(timestamptz) from public, anon;
grant execute on function public.story_instant_key(timestamptz) to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · triggers 1, 5 (the first day) and 7 — the session's own state
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
create function public.sessions_story_frames() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_day uuid;
begin
  if new.state = 'published' and old.state is distinct from 'published' then
    perform public.generate_story_frame(new.id, 'published', 'published', coalesce(new.published_at, now()));

  elsif new.state = 'in_progress' and old.state = 'published' then
    -- The running day, else the first day not yet ended (an admin's early start), else the first.
    select d.id into v_day
      from public.session_days d
     where d.session_id = new.id
     order by (now() >= d.starts_at and now() < d.ends_at) desc, (d.ends_at > now()) desc, d.starts_at, d.id
     limit 1;
    if v_day is not null then
      perform public.generate_story_frame(new.id, 'live', v_day::text, now(), v_day);
    end if;

  elsif new.state = 'completed' and old.state = 'in_progress' then
    -- Not `archived → completed` (a reopen): the recap is written once, by the constant key and by this guard.
    perform public.generate_story_frame(new.id, 'recap', 'completed', coalesce(new.completed_at, now()));
  end if;
  return null;
end $$;
revoke all on function public.sessions_story_frames() from public, anon, authenticated;

-- `after update of state` only: a row INSERTED already published (the RLS fixture) writes nothing, so no existing
-- suite gains a row it did not ask for. Every product path reaches a state by update.
create trigger sessions_story_frames
  after update of state on public.sessions
  for each row
  when (old.state is distinct from new.state and new.state in ('published', 'in_progress', 'completed'))
  execute function public.sessions_story_frames();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · trigger 6 — a photograph becomes visible (DEC-251 §4.1: every visible album photograph, whoever, any door)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- After 0174 the only writer of photos is record_photo_upload(), after the strip, and `check (exif_stripped)` holds on
-- every row — so an insert that is neither hidden nor removed IS the photograph becoming visible (0178's own reading).
-- The frame copies nothing of the photograph: its caption, uploader and visibility are read through `photo_id`.
create function public.photos_story_frame() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.generate_story_frame(new.session_id, 'photo', new.id::text, new.created_at, new.session_day_id, new.id);
  return null;
end $$;
revoke all on function public.photos_story_frame() from public, anon, authenticated;

create trigger photos_story_frame
  after insert on public.photos
  for each row
  when (new.hidden_at is null and new.removed_at is null)
  execute function public.photos_story_frame();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4 · trigger 8 — materials are added (0189's moment, batched per org-local day)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- «Added» is the moment a member could first open it (0189:12-17): a link at its insert, a file when its first version
-- is accepted, a removed material restored. It must also be member-visible NOW under materials_read's gate (0116:70):
-- a «قبل» material, or the session completed/archived, or its own day ended. An «بعد» material released by completion
-- makes no frame — the recap carries the materials; one released by its day's end makes none either (DEC-251 §4.4).
-- One frame per session per org-local day, as 0189's batch: a deck and two links are one event.
create function public.materials_story_frame() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_state public.session_state;
  v_tz    text;
begin
  if not (
       (tg_op = 'INSERT' and new.external_url is not null)
    or (tg_op = 'UPDATE' and old.current_version_id is null and new.current_version_id is not null)
    or (tg_op = 'UPDATE' and old.removed_at is not null and new.removed_at is null
        and (new.current_version_id is not null or new.external_url is not null))
  ) then
    return null;
  end if;
  if new.session_id is null or new.removed_at is not null then
    return null;
  end if;

  select s.state into v_state from public.sessions s where s.id = new.session_id;
  if v_state is null or v_state not in ('published', 'in_progress', 'completed', 'archived') then
    return null;
  end if;
  if not (
       new.phase = 'before'
    or v_state in ('completed', 'archived')
    or (new.session_day_id is not null
        and exists (select 1 from public.session_days d where d.id = new.session_day_id and d.ends_at <= now()))
  ) then
    return null;
  end if;

  select coalesce(os.time_zone, 'Asia/Riyadh') into v_tz from public.org_settings os where os.org_id = new.org_id;
  perform public.generate_story_frame(
    new.session_id, 'materials',
    'materials:' || to_char(now() at time zone coalesce(v_tz, 'Asia/Riyadh'), 'YYYY-MM-DD'),
    now());
  return null;
end $$;
revoke all on function public.materials_story_frame() from public, anon, authenticated;

create trigger materials_story_frame
  after insert or update of current_version_id, removed_at on public.materials
  for each row execute function public.materials_story_frame();

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 5 · the clock — triggers 2, 3, 4 and day k's live (JOB-generate_story_frames, every minute)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Each instant is written once, when due, and only if it falls in (p_now − 24 h, p_now]: a late or doubled run writes
-- nothing twice, and a first deploy does not back-fill history. `triggered_at` is the SCHEDULED instant, so a run that
-- lands a minute late moves no expiry. Returns how many frames it wrote.
create function public.clock_story_frames(p_now timestamptz default now()) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_written int := 0;
  r         record;
  v_id      uuid;
begin
  -- 2 · registration opens — only when a priority window puts it after the publication (0045:52-60).
  for r in
    select s.id, s.published_at + make_interval(hours => os.priority_rsvp_hours) as at
      from public.sessions s
      join public.org_settings os on os.org_id = s.org_id
     where s.state = 'published'
       and s.published_at is not null
       and os.priority_rsvp_hours > 0
       and exists (select 1 from public.perks p where p.org_id = s.org_id and p.key = 'priority_rsvp' and p.enabled)
       and s.published_at + make_interval(hours => os.priority_rsvp_hours) >  p_now - interval '24 hours'
       and s.published_at + make_interval(hours => os.priority_rsvp_hours) <= p_now
  loop
    v_id := public.generate_story_frame(r.id, 'registration_opened', public.story_instant_key(r.at), r.at);
    if v_id is not null then v_written := v_written + 1; end if;
  end loop;

  -- 3 · registration closes — only when the deadline is earlier than the first start (else it IS the start).
  for r in
    select s.id, s.rsvp_deadline_at as at
      from public.sessions s
     where s.state in ('published', 'in_progress')
       and s.rsvp_deadline_at is not null
       and s.starts_at is not null
       and s.rsvp_deadline_at <  s.starts_at
       and s.rsvp_deadline_at >  p_now - interval '24 hours'
       and s.rsvp_deadline_at <= p_now
  loop
    v_id := public.generate_story_frame(r.id, 'registration_closed', public.story_instant_key(r.at), r.at);
    if v_id is not null then v_written := v_written + 1; end if;
  end loop;

  -- 4 · 24 h before each day starts — never dated before the publication; a rescheduled day keys anew.
  for r in
    select s.id as session_id, d.id as day_id, d.starts_at,
           greatest(d.starts_at - interval '24 hours', s.published_at) as at
      from public.session_days d
      join public.sessions s on s.id = d.session_id
     where s.state in ('published', 'in_progress')
       and s.published_at is not null
       and d.starts_at > p_now
       and d.starts_at - interval '24 hours' <= p_now
       and greatest(d.starts_at - interval '24 hours', s.published_at) > p_now - interval '24 hours'
  loop
    v_id := public.generate_story_frame(r.session_id, 'starts_soon',
              r.day_id::text || ':' || public.story_instant_key(r.starts_at), r.at, r.day_id);
    if v_id is not null then v_written := v_written + 1; end if;
  end loop;

  -- 5 · a day goes live while the session runs — day 1 is normally the state trigger's (the same key, so nothing twice).
  for r in
    select s.id as session_id, d.id as day_id, d.starts_at as at
      from public.session_days d
      join public.sessions s on s.id = d.session_id
     where s.state = 'in_progress'
       and d.starts_at <= p_now
       and d.ends_at   >  p_now
       and d.starts_at >  p_now - interval '24 hours'
  loop
    v_id := public.generate_story_frame(r.session_id, 'live', r.day_id::text, r.at, r.day_id);
    if v_id is not null then v_written := v_written + 1; end if;
  end loop;

  return v_written;
end $$;
revoke all on function public.clock_story_frames(timestamptz) from public, anon, authenticated;
grant  execute on function public.clock_story_frames(timestamptz) to service_role;

-- wave 9 (DEC-119, DEC-150 contract 3, DEC-151) — `schedule_session()` writes a
-- SESSION'S DAY SET, and `publish_session()` names a gap per day.
-- Promoted by the lead from supabase/proposed/sessions/0001_schedule_session_days.sql.
--
-- ★ NULL `p_days` IS MAIN'S CALL AND MUST DO EXACTLY WHAT IT DOES TODAY: one
-- `update public.sessions`, one `session.scheduled` audit row, one
-- `sessions_notify` firing, and `0100`'s trigger A carrying the window onto the
-- session's one day. There is no second code path — three locals derive the
-- window and the place, and at `p_days is null` they collapse to `0085`'s own
-- expressions, because `jsonb_to_recordset(null)` yields no rows and every
-- `coalesce` falls through to the parameter beside it.
--
-- ★ THE 14-PARAMETER SIGNATURE IS DROPPED BEFORE THE 16-PARAMETER ONE IS
-- CREATED. `create or replace` would add a SECOND overload — Postgres
-- identifies a function by name AND argument list — and PostgREST refuses to
-- choose between two (`0085`'s lesson, wave-9 rule 2). Positional callers that
-- pass 13 or 14 arguments keep working through the two new defaults.
--
-- ★ EVERY REFUSAL IS RAISED BEFORE THE FIRST WRITE. So no refusal ever rolls
-- back a write, which is why this keeps `returns public.sessions` and needs no
-- outcome envelope (DEC-043).
--
-- ★ THE DAY SET IS WRITTEN IN ONE STATEMENT, AND THAT IS LOAD-BEARING.
-- `0100`'s trigger B re-derives `sessions` after a day write and updates it
-- ONLY WHERE DISTINCT. Three separate statements — update, delete, insert —
-- pass through intermediate day sets that derive a DIFFERENT window from the
-- final one, so B updates `sessions` mid-diff: `sessions_notify` mails every
-- confirmed member a reschedule notice naming a time that was never the answer,
-- and the deadlines this function just wrote against the FINAL start are left
-- sitting after an intermediate one. Postgres fires AFTER ROW triggers at the
-- END of the statement, and data-modifying CTEs are ONE statement, so every
-- firing of B sees the FINAL day set, finds `sessions` already equal, and
-- writes nothing. This is the same partial-truth hazard `DEC-151` rejected a
-- row trigger for in contract 11.
--
-- ★ MEASURED, not argued. `tests/rls/sessions-schedule-days.test.ts`'s «ONE
-- reschedule notice» case moves day one past day two and drops day two. Against
-- this file it passes: one notice, naming the window that resulted. Against a
-- control with the CTE split into three statements it FAILS — and it fails at
-- `sessions_check1`, because trigger B pulled `starts_at` back to the doomed
-- day's Thursday while `rsvp_deadline_at` already held Saturday. A shape that
-- did not touch a deadline would have failed silently instead, with the notice.
--
-- Serves:  REQ-SES-001, REQ-SES-002, REQ-SES-015, REQ-SES-016, REQ-SES-017,
--          REQ-SES-009, REQ-CHK-010 (DEC-117, DEC-118)
-- Cites:   0021 (schedule_session, publish_session), 0085 (the 14-parameter
--          signature, re-created plus two), 0100 (session_days, triggers A/B/C,
--          the deferrable constraints), 0101 (session_days.check_in_open)
-- Docs:    docs/plan/notes/sessions.md "Wave 9 plan" W9.1
--
-- 03 §8.2 rows this adds:
--   | `RPC-schedule_session.days_null_is_today` | `p_days => null` writes the session once and nothing else: one `session.scheduled` row, one notice, and `0100`'s trigger A carries the window onto its one day. Byte-identical to `0085`. |
--   | `RPC-schedule_session.days_written` | `p_days` replaces the session's day set: entries with an `id` are updated, entries without one inserted, stored days left out deleted. `position` is never written by the caller — `0100` derives it. |
--   | `RPC-schedule_session.days_derive_the_session` | With `p_days`, the session's stored window is the first day's start and the last day's end and its venue is the first day's, written ONCE — `sessions_notify` fires exactly once for the whole change. |
--   | `RPC-schedule_session.days_required` | A `null` `p_days` on a session that already has more than one day is refused `days_required` (23514), by name, rather than left to `0100`'s commit check. |
--   | `RPC-schedule_session.day_has_attendance` | A day left out of `p_days` that holds a check-in — removed or not — is refused `day_has_attendance: <position>` (23514) before anything is written. |
--   | `RPC-schedule_session.days_refusals` | `days_empty`, `days_too_many`, `days_invalid`, `day_window_invalid`, `days_overlap`, `day_repeated` (23514) and `day_not_of_session` (42501) are each raised by name, before the first write. |
--   | `RPC-schedule_session.day_venue_rules` | A day names the org's venue OR the inline trio, never both and never a name without an address, and never another org's or a deactivated venue. |
--   | `RPC-schedule_session.require_all_days` | `p_require_all_days` sets `sessions.require_all_days`; `null` leaves it exactly as it was, as `p_allow_walk_ins` does (DEC-141 correction B). |
--   | `RPC-publish_session.missing_days` | Publishing a session with no day names `days`; a day after the first with no place names `day:<position>:venue`. A one-day session's `missing[]` is unchanged. |

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · schedule_session() — the day set
-- ═══════════════════════════════════════════════════════════════════════════
drop function if exists public.schedule_session(
  uuid, timestamptz, int, timestamptz, uuid, text, text, text, int,
  timestamptz, timestamptz, public.certificate_mode, public.session_language, boolean);

create function public.schedule_session(
  p_session                 uuid,
  p_starts_at               timestamptz,
  p_duration_minutes        int,
  p_ends_at                 timestamptz default null,
  p_venue                   uuid        default null,
  p_custom_venue_name       text        default null,
  p_custom_venue_address    text        default null,
  p_custom_venue_map_url    text        default null,
  p_capacity                int         default null,
  p_rsvp_deadline_at        timestamptz default null,
  p_cancellation_cutoff_at  timestamptz default null,
  p_certificate_mode        public.certificate_mode default 'off',
  p_language                public.session_language default 'ar',
  p_allow_walk_ins          boolean     default null,  -- DEC-141 B: null = unchanged
  p_days                    jsonb       default null,  -- ★ null = main's call, exactly
  p_require_all_days        boolean     default null   -- ★ REQ-SES-017; null = unchanged
) returns public.sessions
language plpgsql security definer set search_path = '' as $$
declare
  actor        public.members := public.assert_fresh_admin();
  target       public.sessions;
  v_venue      public.venues;
  v_tz         text;
  v_name       text := nullif(btrim(coalesce(p_custom_venue_name, '')), '');
  v_addr       text := nullif(btrim(coalesce(p_custom_venue_address, '')), '');
  v_old_walk_ins boolean;
  v_new_walk_ins boolean;
  v_stored     int;
  v_count      int;
  v_kept       uuid[];
  v_position   int;
  -- the chronologically first entry of `p_days`, and the last end
  v_first_starts timestamptz;
  v_first_venue  uuid;
  v_first_name   text;
  v_first_addr   text;
  v_first_map    text;
  v_last_ends    timestamptz;
  -- what actually gets stored on `sessions`
  v_starts     timestamptz;
  v_ends       timestamptz;
  v_place      uuid;
  v_place_name text;
  v_place_addr text;
  v_place_map  text;
  -- contract 11's snapshots
  v_before     jsonb;
  v_after      jsonb;
begin
  select * into target from public.sessions where id = p_session and org_id = actor.org_id;
  if target.id is null then
    raise exception 'session_not_found' using errcode = '42501';
  end if;
  v_old_walk_ins := target.allow_walk_ins;
  v_new_walk_ins := coalesce(p_allow_walk_ins, target.allow_walk_ins);
  -- REQ-SES-009 makes editing a PUBLISHED session legitimate (it notifies and
  -- re-syncs calendars). A finished, archived or cancelled one is history.
  if target.state in ('completed', 'archived', 'cancelled') then
    raise exception 'session_not_schedulable' using errcode = '23514';
  end if;

  select count(*) into v_stored from public.session_days where session_id = target.id;

  -- ★ DEC-151: a caller that does not speak days may not silently strip a
  -- session down to one. The form's own rule keeps `p_days` present whenever
  -- the session has several days; this covers every OTHER caller, and it says
  -- so by name instead of leaving `0100`'s commit check to raise
  -- `session_window_not_derived` two statements later.
  if p_days is null and v_stored > 1 then
    raise exception 'days_required' using errcode = '23514';
  end if;

  -- REQ-SES-007: a custom venue needs at minimum a name and an address, and
  -- is NOT silently added to the org's list — promoting it is a separate act.
  if p_venue is not null and v_name is not null then
    raise exception 'venue_or_custom_venue_not_both' using errcode = '23514';
  end if;
  if p_venue is null and (v_name is null) <> (v_addr is null) then
    raise exception 'custom_venue_needs_name_and_address' using errcode = '23514';
  end if;
  if p_venue is not null then
    select * into v_venue from public.venues where id = p_venue and org_id = actor.org_id and deactivated_at is null;
    if v_venue.id is null then
      raise exception 'venue_not_found' using errcode = '23514';
    end if;
  end if;

  -- ═══ every refusal the day set can earn, BEFORE the first write ═══════════
  if p_days is not null then
    if jsonb_typeof(p_days) <> 'array' then
      raise exception 'days_invalid' using errcode = '23514';
    end if;
    v_count := jsonb_array_length(p_days);
    if v_count = 0 then
      raise exception 'days_empty' using errcode = '23514';
    end if;
    -- A definer function's input is bounded. Thirty evenings is a term, not a
    -- workshop; nothing in the product schedules more (DEC-151 ruling 7).
    if v_count > 30 then
      raise exception 'days_too_many' using errcode = '23514';
    end if;

    -- Force every cast once, so a malformed instant is `days_invalid` and not a
    -- raw 22007 from whichever query happened to touch it first. Nothing is
    -- written yet, so the subtransaction this handler opens costs nothing.
    begin
      perform 1 from jsonb_to_recordset(p_days)
        as x(id uuid, starts_at timestamptz, ends_at timestamptz, venue_id uuid,
             custom_venue_name text, custom_venue_address text, custom_venue_map_url text);
    exception when others then
      raise exception 'days_invalid' using errcode = '23514';
    end;

    if exists (
      select 1 from jsonb_to_recordset(p_days) as x(starts_at timestamptz, ends_at timestamptz)
       where x.starts_at is null or x.ends_at is null or x.ends_at <= x.starts_at
    ) then
      raise exception 'day_window_invalid' using errcode = '23514';
    end if;

    -- Named here so the caller gets a word rather than `0100`'s exclusion
    -- constraint's 23P01. The constraint still decides; this only reads better.
    if exists (
      with dd as (
        select row_number() over () as rn, x.starts_at, x.ends_at
          from jsonb_to_recordset(p_days) as x(starts_at timestamptz, ends_at timestamptz)
      )
      select 1 from dd a join dd b on b.rn > a.rn
       where tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(b.starts_at, b.ends_at, '[)')
    ) then
      raise exception 'days_overlap' using errcode = '23514';
    end if;

    -- An id names a day OF THIS SESSION. An authority failure, so it reads like
    -- `session_not_found` rather than like a malformed field.
    if exists (
      select 1 from jsonb_to_recordset(p_days) as x(id uuid)
       where x.id is not null
         and not exists (select 1 from public.session_days d where d.id = x.id and d.session_id = target.id)
    ) then
      raise exception 'day_not_of_session' using errcode = '42501';
    end if;
    -- The same id twice would update one row and orphan the other's intent.
    if (select count(*) - count(distinct x.id) from jsonb_to_recordset(p_days) as x(id uuid) where x.id is not null) > 0 then
      raise exception 'day_repeated' using errcode = '23514';
    end if;

    -- REQ-SES-007 again, per day: the session-level rules, applied to each.
    if exists (
      select 1 from jsonb_to_recordset(p_days) as x(venue_id uuid, custom_venue_name text)
       where x.venue_id is not null and nullif(btrim(coalesce(x.custom_venue_name, '')), '') is not null
    ) then
      raise exception 'day_venue_or_custom_not_both' using errcode = '23514';
    end if;
    if exists (
      select 1 from jsonb_to_recordset(p_days) as x(venue_id uuid, custom_venue_name text, custom_venue_address text)
       where x.venue_id is null
         and (nullif(btrim(coalesce(x.custom_venue_name, '')), '') is null)
             <> (nullif(btrim(coalesce(x.custom_venue_address, '')), '') is null)
    ) then
      raise exception 'day_custom_venue_needs_name_and_address' using errcode = '23514';
    end if;
    if exists (
      select 1 from jsonb_to_recordset(p_days) as x(venue_id uuid)
       where x.venue_id is not null
         and not exists (select 1 from public.venues v
                          where v.id = x.venue_id and v.org_id = actor.org_id and v.deactivated_at is null)
    ) then
      raise exception 'day_venue_not_found' using errcode = '23514';
    end if;

    select coalesce(array_agg(x.id), '{}'::uuid[]) into v_kept
      from jsonb_to_recordset(p_days) as x(id uuid) where x.id is not null;

    -- ★ A day someone attended is evidence, and evidence is not deleted by a
    -- scheduling change (DEC-151 ruling 5). A REMOVED check-in counts: the row
    -- is soft-deleted (0087) and it still says the day happened. `0100`'s
    -- foreign key would refuse this too, with a 23503; the form asks the admin
    -- before it ever gets here, and this names the day when something else does
    -- not (DEC-121).
    select d.position into v_position
      from public.session_days d
     where d.session_id = target.id
       and not (d.id = any(v_kept))
       and exists (select 1 from public.check_ins c where c.session_day_id = d.id)
     order by d.position
     limit 1;
    if v_position is not null then
      raise exception 'day_has_attendance: %', v_position using errcode = '23514';
    end if;
  end if;

  -- ═══ the derivation — one rule, and today's expressions at `p_days is null` ═
  -- `jsonb_to_recordset(null)` yields NO ROWS, so every aggregate below is null
  -- and every `coalesce` falls through to the parameter beside it. `v_first_*`
  -- is non-null exactly when `p_days` is (an empty array is already refused),
  -- which is what lets the place be chosen without a second code path.
  select x.starts_at, x.venue_id, x.custom_venue_name, x.custom_venue_address, x.custom_venue_map_url
    into v_first_starts, v_first_venue, v_first_name, v_first_addr, v_first_map
    from jsonb_to_recordset(p_days)
      as x(starts_at timestamptz, venue_id uuid, custom_venue_name text,
           custom_venue_address text, custom_venue_map_url text)
   order by x.starts_at
   limit 1;
  select max(x.ends_at) into v_last_ends
    from jsonb_to_recordset(p_days) as x(ends_at timestamptz);

  v_starts := coalesce(v_first_starts, p_starts_at);
  -- REQ-SES-002: `ends_at` is a STORED column derived at scheduling and
  -- independently editable — OQ-001 says the duration pre-fills and is never
  -- authoritative, so an explicit end wins over the arithmetic.
  v_ends   := coalesce(v_last_ends, p_ends_at, p_starts_at + make_interval(mins => p_duration_minutes));
  v_place      := case when p_days is null then p_venue else v_first_venue end;
  v_place_name := case when p_days is null then v_name else nullif(btrim(coalesce(v_first_name, '')), '') end;
  v_place_addr := case when p_days is null then v_addr else nullif(btrim(coalesce(v_first_addr, '')), '') end;
  v_place_map  := nullif(btrim(coalesce(case when p_days is null then p_custom_venue_map_url else v_first_map end, '')), '');

  -- The capacity and the zone follow WHERE IT BEGINS, which is `p_venue` for
  -- main's call and the first day's venue for a day-aware one — the same row
  -- in the one-day case, so this re-select never fires there.
  if v_place is distinct from p_venue then
    select * into v_venue from public.venues where id = v_place and org_id = actor.org_id;
  end if;
  -- OQ-018: the venue's own zone, else the org's. A session happens in a room.
  select coalesce(v_venue.time_zone, os.time_zone, 'Asia/Riyadh') into v_tz
    from public.org_settings os where os.org_id = actor.org_id;

  -- ═══ the writes ══════════════════════════════════════════════════════════
  if p_days is not null then
    -- Contract 1: this writer says so, and `0100`'s trigger A stands down for
    -- the whole transaction — including for the `sessions` update trigger B
    -- would make if anything were left to derive.
    perform set_config('kareem.days_writer', 'on', true);
    -- Moving two days through each other passes through a state that overlaps,
    -- and a fresh day's placeholder `position` can collide with a doomed day's.
    -- Deferred for the write, immediate again before this function returns, so
    -- a violation is still raised INSIDE the call (DEC-151).
    set constraints public.session_days_no_overlap, public.session_days_session_position_key deferred;
    select coalesce(jsonb_agg(to_jsonb(d) order by d.position), '[]'::jsonb) into v_before
      from public.session_days d where d.session_id = target.id;
  end if;

  update public.sessions
     set starts_at              = v_starts,
         duration_minutes       = p_duration_minutes,
         ends_at                = v_ends,
         time_zone              = coalesce(v_tz, target.time_zone),
         venue_id               = v_place,
         custom_venue_name      = case when v_place is null then v_place_name end,
         custom_venue_address   = case when v_place is null then v_place_addr end,
         custom_venue_map_url   = case when v_place is null then v_place_map end,
         capacity               = coalesce(p_capacity, v_venue.capacity, target.capacity),
         rsvp_deadline_at       = coalesce(p_rsvp_deadline_at, v_starts),
         cancellation_cutoff_at = coalesce(p_cancellation_cutoff_at, v_starts),
         certificate_mode       = p_certificate_mode,
         language               = p_language,
         allow_walk_ins         = v_new_walk_ins,                                 -- DEC-118: unchanged unless named
         require_all_days       = coalesce(p_require_all_days, target.require_all_days)  -- REQ-SES-017, same rule
   where id = target.id
   returning * into target;

  if p_days is not null then
    -- ★ ONE STATEMENT. See the header: three would let trigger B mail a
    -- reschedule notice for a window that never existed.
    with payload as (
      select x.id, x.starts_at, x.ends_at, x.venue_id,
             case when x.venue_id is null then nullif(btrim(coalesce(x.custom_venue_name, '')), '') end    as custom_venue_name,
             case when x.venue_id is null then nullif(btrim(coalesce(x.custom_venue_address, '')), '') end as custom_venue_address,
             case when x.venue_id is null then nullif(btrim(coalesce(x.custom_venue_map_url, '')), '') end as custom_venue_map_url
        from jsonb_to_recordset(p_days)
          as x(id uuid, starts_at timestamptz, ends_at timestamptz, venue_id uuid,
               custom_venue_name text, custom_venue_address text, custom_venue_map_url text)
    ),
    moved as (
      update public.session_days d
         set starts_at            = p.starts_at,
             ends_at              = p.ends_at,
             venue_id             = p.venue_id,
             custom_venue_name    = p.custom_venue_name,
             custom_venue_address = p.custom_venue_address,
             custom_venue_map_url = p.custom_venue_map_url
        from payload p
       where d.id = p.id and d.session_id = target.id
      returning d.id
    ),
    -- DEC-121: the content of a deleted day is PROMOTED to the session by
    -- `0100`'s `on delete set null (session_day_id)`, never deleted. A day
    -- holding attendance was refused above, before anything was written.
    gone as (
      delete from public.session_days d
       where d.session_id = target.id and not (d.id = any(v_kept))
      returning d.id
    ),
    -- `position` is DERIVED and is not in this column list: `0100`'s BEFORE
    -- INSERT trigger places the row and trigger B ranks the whole set. A new
    -- day is born with its own switch open (`0101`'s column default) — a
    -- meeting that has not happened yet is not closed by the session's switch.
    fresh as (
      insert into public.session_days
        (org_id, session_id, starts_at, ends_at, venue_id,
         custom_venue_name, custom_venue_address, custom_venue_map_url)
      select target.org_id, target.id, p.starts_at, p.ends_at, p.venue_id,
             p.custom_venue_name, p.custom_venue_address, p.custom_venue_map_url
        from payload p where p.id is null
      returning id
    )
    select count(*) into v_count from (select 1 from moved union all select 1 from gone union all select 1 from fresh) s;

    set constraints public.session_days_no_overlap, public.session_days_session_position_key immediate;

    select coalesce(jsonb_agg(to_jsonb(d) order by d.position), '[]'::jsonb) into v_after
      from public.session_days d where d.session_id = target.id;

    -- ★ CONTRACT 11 (DEC-151). The whole before and the whole after, once,
    -- after the last day write: `notify` decides what a member is told and
    -- which reminder streams move. A row trigger could only ever announce the
    -- first row's partial truth.
    -- TODO(notify, contract 11): call
    --   perform public.session_days_changed(target.id, v_before, v_after);
    -- here, as soon as `notify` promotes it. Until then the snapshots are
    -- taken and discarded, so the call site is one line and cannot drift.

    -- Not left set for the rest of the transaction: the next writer in it —
    -- another RPC in the same test, a future caller — must get trigger A.
    perform set_config('kareem.days_writer', '', true);
  end if;

  perform public.write_audit(actor.org_id, 'session.scheduled', 'session', target.id, null,
                             jsonb_build_object('starts_at', target.starts_at, 'ends_at', target.ends_at,
                                                'venue_id', target.venue_id, 'capacity', target.capacity,
                                                'allow_walk_ins', target.allow_walk_ins),
                             null, 'admin', actor.id);

  -- DEC-117/DEC-118: walk-ins keep their OWN audit action, unchanged from
  -- 0079's set_session_walk_ins() — folding the value into session.scheduled's
  -- payload alone would break anything that reads the log by action. Written
  -- only when the value actually moves, same as 0079's own guard.
  if v_old_walk_ins is distinct from v_new_walk_ins then
    perform public.write_audit(actor.org_id, 'session.walk_ins_changed', 'session', target.id,
                               jsonb_build_object('allow_walk_ins', v_old_walk_ins),
                               jsonb_build_object('allow_walk_ins', v_new_walk_ins),
                               null, 'admin', actor.id);
  end if;
  return target;
end $$;

revoke execute on function public.schedule_session(uuid, timestamptz, int, timestamptz, uuid, text, text, text, int, timestamptz, timestamptz, public.certificate_mode, public.session_language, boolean, jsonb, boolean) from public, anon;
grant  execute on function public.schedule_session(uuid, timestamptz, int, timestamptz, uuid, text, text, text, int, timestamptz, timestamptz, public.certificate_mode, public.session_language, boolean, jsonb, boolean) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · publish_session() — the gap, named per day
-- ═══════════════════════════════════════════════════════════════════════════
-- Same signature, so `create or replace`. The ONE change is two more entries in
-- `missing[]`, and NEITHER can fire for a one-day session: a session with a
-- window has a day (0100's backfill and trigger A), and day one's missing place
-- is already reported as `venue` through the derived column — which is why the
-- per-day scan starts at `position > 1`. A one-day session's refusal message is
-- therefore byte-identical to 0021's.
create or replace function public.publish_session(p_session uuid) returns public.sessions
language plpgsql security definer set search_path = '' as $$
declare
  actor   public.members := public.assert_fresh_admin();
  target  public.sessions;
  chain   public.session_state[] := array['draft', 'submitted', 'in_review', 'approved', 'published']::public.session_state[];
  i       int;
  v_from  public.session_state;
  v_day   int;
  missing text[] := '{}';
begin
  select * into target from public.sessions where id = p_session and org_id = actor.org_id;
  if target.id is null then
    raise exception 'session_not_found' using errcode = '42501';
  end if;
  if target.state = 'published' then
    return target;                                   -- idempotent
  end if;
  if target.state not in ('draft', 'submitted', 'in_review', 'changes_requested', 'approved') then
    raise exception 'session_not_publishable' using errcode = '23514';
  end if;

  -- REQ-SES-001 / SCR-043's "incomplete" state: name what is missing rather
  -- than reporting a constraint. The constraint still decides — this only
  -- reads better than 23514.
  if target.starts_at is null then missing := array_append(missing, 'starts_at'); end if;
  if target.ends_at is null then missing := array_append(missing, 'ends_at'); end if;
  if target.capacity is null then missing := array_append(missing, 'capacity'); end if;
  if target.venue_id is null and target.custom_venue_name is null then missing := array_append(missing, 'venue'); end if;

  -- DEC-119: «at least one day, every day complete». 0100's trigger C refuses
  -- a published session with no day at COMMIT, with `session_without_days`;
  -- this says it here, where SCR-043 can render it.
  if not exists (select 1 from public.session_days where session_id = target.id) then
    missing := array_append(missing, 'days');
  end if;
  select d.position into v_day
    from public.session_days d
   where d.session_id = target.id
     and d.position > 1
     and d.venue_id is null and d.custom_venue_name is null
   order by d.position
   limit 1;
  if v_day is not null then
    missing := array_append(missing, 'day:' || v_day::text || ':venue');
  end if;

  if array_length(missing, 1) is not null then
    raise exception 'publish_incomplete: %', array_to_string(missing, ',') using errcode = '23514';
  end if;

  -- `changes_requested` rejoins the chain at `submitted`, as 02 §6.2 draws it.
  if target.state = 'changes_requested' then
    update public.sessions set state = 'submitted' where id = target.id returning * into target;
    insert into public.session_state_transitions (org_id, session_id, from_state, to_state, actor_id, is_manual, reason)
    values (actor.org_id, target.id, 'changes_requested', 'submitted', actor.id, true, 'publishing');
  end if;

  for i in 1 .. array_length(chain, 1) - 1 loop
    if target.state = chain[i] then
      v_from := target.state;
      update public.sessions
         set state = chain[i + 1],
             published_at = case when chain[i + 1] = 'published' then now() else published_at end
       where id = target.id
       returning * into target;
      insert into public.session_state_transitions (org_id, session_id, from_state, to_state, actor_id, is_manual, reason)
      values (actor.org_id, target.id, v_from, chain[i + 1], actor.id, true,
              case when chain[i + 1] = 'published' then null else 'publishing' end);
    end if;
  end loop;

  perform public.write_audit(actor.org_id, 'session.published', 'session', target.id, null,
                             jsonb_build_object('starts_at', target.starts_at, 'capacity', target.capacity),
                             null, 'admin', actor.id);
  return target;
end $$;

revoke execute on function public.publish_session(uuid) from public, anon;
grant  execute on function public.publish_session(uuid) to authenticated;

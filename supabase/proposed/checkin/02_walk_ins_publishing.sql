-- wave 7 (DEC-117, DEC-118, DEC-141) — walk-ins move from a host-view switch
-- (DEC-065, 0079) to a publishing-time setting: decided when the session is
-- scheduled and published, changed only through the same audited RPC that
-- writes the date and the venue, by an admin. `set_session_walk_ins()`
-- (0079) is retired — DEC-118 is explicit that there is no other door.
--
-- Cross-track hook, flagged for sign-off (docs/plan/notes/checkin.md,
-- correction B): `schedule_session()` is `sessions`'-owned (0021).
--
-- ★ CORRECTION B (the lead's ruling on the plan): `p_allow_walk_ins` defaults
-- to NULL, meaning "leave unchanged" — `coalesce(p_allow_walk_ins,
-- allow_walk_ins)`. A `default false` would silently turn walk-ins off on
-- every reschedule that doesn't pass the field (most of them, until
-- `sessions` threads it through the schedule form's own state — contract 1).
--
-- The OLD 13-parameter signature is DROPPED EXPLICITLY before the
-- 14-parameter one is created. `create or replace` alone would add a SECOND
-- overload, not replace the first — Postgres identifies a function by name
-- AND argument list, and the new parameter changes the list.
--
-- Serves:  REQ-CHK-010 (amended by DEC-117, DEC-118)
-- Cites:   0021 (schedule_session, re-created verbatim plus one parameter),
--          0079 (set_session_walk_ins, dropped)
-- Docs:    docs/plan/notes/checkin.md "Wave 7 plan" §3
--
-- 03 §8.2 rows this adds:
--   | `RPC-schedule_session.walk_ins` | `p_allow_walk_ins = true`/`false` sets `allow_walk_ins`; admin-only, same as every other field this RPC writes. |
--   | `RPC-schedule_session.walk_ins_unchanged` | Rescheduling WITHOUT passing the parameter (the default, `null`) leaves `allow_walk_ins` exactly as it was. |
--   | `RPC-set_session_walk_ins.retired` | The function no longer exists — DEC-118: no door but `schedule_session()`. |

drop function if exists public.set_session_walk_ins(uuid, boolean);

drop function if exists public.schedule_session(uuid, timestamptz, int, timestamptz, uuid, text, text, text, int, timestamptz, timestamptz, public.certificate_mode, public.session_language);

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
  p_allow_walk_ins          boolean     default null   -- DEC-141 correction B: null = unchanged
) returns public.sessions
language plpgsql security definer set search_path = '' as $$
declare
  actor    public.members := public.assert_fresh_admin();
  target   public.sessions;
  v_venue  public.venues;
  v_ends   timestamptz;
  v_tz     text;
  v_name   text := nullif(btrim(coalesce(p_custom_venue_name, '')), '');
  v_addr   text := nullif(btrim(coalesce(p_custom_venue_address, '')), '');
begin
  select * into target from public.sessions where id = p_session and org_id = actor.org_id;
  if target.id is null then
    raise exception 'session_not_found' using errcode = '42501';
  end if;
  if target.state in ('completed', 'archived', 'cancelled') then
    raise exception 'session_not_schedulable' using errcode = '23514';
  end if;

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

  v_ends := coalesce(p_ends_at, p_starts_at + make_interval(mins => p_duration_minutes));

  select coalesce(v_venue.time_zone, os.time_zone, 'Asia/Riyadh') into v_tz
    from public.org_settings os where os.org_id = actor.org_id;

  update public.sessions
     set starts_at              = p_starts_at,
         duration_minutes       = p_duration_minutes,
         ends_at                = v_ends,
         time_zone              = coalesce(v_tz, target.time_zone),
         venue_id               = p_venue,
         custom_venue_name      = case when p_venue is null then v_name end,
         custom_venue_address   = case when p_venue is null then v_addr end,
         custom_venue_map_url   = case when p_venue is null then nullif(btrim(coalesce(p_custom_venue_map_url, '')), '') end,
         capacity               = coalesce(p_capacity, v_venue.capacity, target.capacity),
         rsvp_deadline_at       = coalesce(p_rsvp_deadline_at, p_starts_at),
         cancellation_cutoff_at = coalesce(p_cancellation_cutoff_at, p_starts_at),
         certificate_mode       = p_certificate_mode,
         language               = p_language,
         allow_walk_ins         = coalesce(p_allow_walk_ins, target.allow_walk_ins)   -- DEC-118: unchanged unless named
   where id = target.id
   returning * into target;

  perform public.write_audit(actor.org_id, 'session.scheduled', 'session', target.id, null,
                             jsonb_build_object('starts_at', target.starts_at, 'ends_at', target.ends_at,
                                                'venue_id', target.venue_id, 'capacity', target.capacity,
                                                'allow_walk_ins', target.allow_walk_ins),
                             null, 'admin', actor.id);
  return target;
end $$;

revoke execute on function public.schedule_session(uuid, timestamptz, int, timestamptz, uuid, text, text, text, int, timestamptz, timestamptz, public.certificate_mode, public.session_language, boolean) from public, anon;
grant  execute on function public.schedule_session(uuid, timestamptz, int, timestamptz, uuid, text, text, text, int, timestamptz, timestamptz, public.certificate_mode, public.session_language, boolean) to authenticated;

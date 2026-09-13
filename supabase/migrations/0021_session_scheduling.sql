-- proposed by `sessions` (wave 1, M2) — scheduling and publishing
--
-- Serves:  REQ-SES-001, REQ-SES-002, REQ-SES-003, REQ-SES-006, REQ-SES-007,
--          REQ-SES-011 · OQ-001 (duration pre-fills, never authoritative),
--          OQ-018 (time zone from the venue, else the org)
-- Cites:   02-domain-model.md §4.3, §6.2 (frozen) · 03-permissions-rls.md §1.3, §5.2d
--          0010 (the publish check constraint) · 0005 (assert_fresh_admin)
--
-- 03 §8.2 rows (added at wave-1 sync point 5):
--   | `RPC-schedule_session.admin_only` | A member, a moderator and the session's own presenter
--     are all refused; a presenter cannot set a date even through the RPC. |
--   | `RPC-schedule_session.derives` | `ends_at` is stored, derived from the duration when not
--     given and independently editable when it is; the time zone comes from the venue, else the
--     org; a custom venue needs a name AND an address. |
--   | `RPC-publish_session.gate` | Publishing without a date, an end, a venue or a capacity is
--     refused by the TABLE, not only by the form; the refusal names what is missing. |
--   | `RPC-publish_session.path` | Publishing walks 02 §6.2's chain and writes one transition row
--     per edge, all flagged manual and attributed to the admin. |
--
-- ── What is deliberately NOT here ───────────────────────────────────────────
-- REQ-SES-001 also requires a **ملصق** before publishing. There is no poster
-- column, no `documents` table and no designer: that is M6 (REQ-DSG-002,
-- DEC-012). The other five gates — date, time, duration, venue, capacity —
-- are enforced, by 0010's check constraint rather than by any code path, and
-- the poster gate joins them when M6 lands. Recorded in
-- docs/plan/notes/sessions.md so it is not quietly forgotten.

-- ── schedule_session() ──────────────────────────────────────────────────────
-- Definer, because 0010 grants an admin no write on any scheduling column:
-- `grant update (title, abstract, level, language)` is the whole of it, which
-- is D13/D14 as privileges. So `starts_at`, the venue, the capacity, the
-- deadlines and `certificate_mode` can only move through here, and the 03 §1.3
-- re-read is mandatory because definer bypasses RLS.
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
  p_language                public.session_language default 'ar'
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
  -- REQ-SES-009 makes editing a PUBLISHED session legitimate (it notifies and
  -- re-syncs calendars). A finished, archived or cancelled one is history.
  if target.state in ('completed', 'archived', 'cancelled') then
    raise exception 'session_not_schedulable' using errcode = '23514';
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

  -- REQ-SES-002: `ends_at` is a STORED column derived at scheduling, and
  -- independently editable — OQ-001 says the duration pre-fills and is never
  -- authoritative, so an explicit end wins over the arithmetic.
  v_ends := coalesce(p_ends_at, p_starts_at + make_interval(mins => p_duration_minutes));

  -- OQ-018: the venue's own zone, else the org's. A session happens in a room.
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
         language               = p_language
   where id = target.id
   returning * into target;

  perform public.write_audit(actor.org_id, 'session.scheduled', 'session', target.id, null,
                             jsonb_build_object('starts_at', target.starts_at, 'ends_at', target.ends_at,
                                                'venue_id', target.venue_id, 'capacity', target.capacity),
                             null, 'admin', actor.id);
  return target;
end $$;

revoke execute on function public.schedule_session(uuid, timestamptz, int, timestamptz, uuid, text, text, text, int, timestamptz, timestamptz, public.certificate_mode, public.session_language) from public, anon;
grant  execute on function public.schedule_session(uuid, timestamptz, int, timestamptz, uuid, text, text, text, int, timestamptz, timestamptz, public.certificate_mode, public.session_language) to authenticated;

-- ── publish_session() ───────────────────────────────────────────────────────
-- One click for the admin, 02 §6.2's chain in the record.
--
-- The diagram is FROZEN and has no edge from `draft` to `published`; the path
-- runs draft → submitted → in_review → approved → published. An admin-created
-- session has had no review, so making them press four buttons would be
-- ceremony — but writing one synthetic `draft → published` row would put a
-- transition in the log that the model says cannot happen. So the function
-- walks the chain, writing one row per edge, every one flagged `is_manual`
-- and attributed to the admin, with a reason that says why the intermediate
-- hops exist. Same shape as review_proposal() walking submitted → in_review.
--
-- The publish GATE is not checked here on purpose. 0010's check constraint —
-- "state not in (published, …) or (starts_at is not null and ends_at is not
-- null and capacity is not null and (venue_id is not null or
-- custom_venue_name is not null))" — refuses the update itself, which is what
-- 15-backlog.md means by "blocked by a DATABASE CONSTRAINT, not only by the
-- form". This function only turns that 23514 into a message naming the gap.
create function public.publish_session(p_session uuid) returns public.sessions
language plpgsql security definer set search_path = '' as $$
declare
  actor   public.members := public.assert_fresh_admin();
  target  public.sessions;
  chain   public.session_state[] := array['draft', 'submitted', 'in_review', 'approved', 'published']::public.session_state[];
  i       int;
  v_from  public.session_state;
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

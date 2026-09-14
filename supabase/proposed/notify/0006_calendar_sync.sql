-- notify (wave 2, M3) — the Google Calendar connection and the sync jobs.
--
-- Serves:  REQ-CAL-003 (connect and disconnect; tokens never displayed to
--          anyone) · REQ-CAL-004 (one event per member per session) ·
--          REQ-CAL-005 (a change propagates) · REQ-CAL-006 (removal is
--          idempotent and tolerates a hand-deleted event) · REQ-CAL-007
--          (disconnect deletes the tokens immediately) · REQ-CAL-008 (a
--          failure never blocks the app) · `MSG-calendar_disconnected`
-- Cites:   02 §4.14 · 03 §5.9c (the table nobody may read) · 08 §6.3, §6.4 ·
--          11 §2.2 · A33 · 0026 (notify(), the tables)
--
-- ── 03 §8.2 rows (added with this migration) ────────────────────────────────
--   | `RPC-store_calendar_connection.self` | A member can store only their OWN connection: the
--     function takes no member id and reads `auth_member_id()`. |
--   | `RPC-store_calendar_connection.write_only` | Storing a token does not make it readable — the
--     same member calling `select *` afterwards still gets `42501`. |
--   | `RPC-calendar_tokens_for_job.worker_only` | The ONLY function that returns a token, and no
--     client role may call it (`03` §5.9c, `11` §2.2). |
--   | `RPC-record_calendar_sync.idempotent` | Running it twice for one (member, session) leaves ONE
--     row — `REQ-CAL-004`'s idempotency is the constraint, not job logic. |
--   | `POL-calendar_connections.disconnect_notice` | Deleting the row notifies the member that
--     existing events will no longer update (`MSG-calendar_disconnected`, non-optional). |
--
-- ── Where the tokens live, and who ever sees them ───────────────────────────
-- The OAuth code exchange happens in the callback Route Handler, so the access
-- and refresh tokens pass through the web process ONCE, at connect, and are
-- handed straight to `store_calendar_connection()`. After that there is no
-- read path for any client role: the four granted columns on
-- `calendar_connections` are member_id, provider, connected_at and
-- disconnected_at (0026), and the only function that returns a token is
-- `calendar_tokens_for_job()`, which `authenticated` may not execute.
--
-- 08 §6.3's lifecycle table gives "Connect" no job, which is why this is a
-- definer RPC the web app calls rather than a queued exchange: the
-- authorization code is single-use and short-lived, and a queue would add a
-- window in which it expires before anything redeems it.

-- ═══════════════════════════════════════════════════════════════════════════
-- store_calendar_connection — the member's own, and only their own.
--
-- It takes NO member id. A parameter would be something the caller chooses,
-- and the whole point is that the caller cannot choose whose Google account
-- this row belongs to; `auth_member_id()` is something the JWT proved.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.store_calendar_connection(
  p_access  text,
  p_refresh text,
  p_expires timestamptz,
  p_scope   text
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  m    public.members := public.assert_active_member();
  v_id uuid;
begin
  if p_access is null or btrim(p_access) = '' then
    raise exception 'missing_access_token' using errcode = '22023';
  end if;

  insert into public.calendar_connections (org_id, member_id, provider, access_token_encrypted, refresh_token_encrypted, expires_at, scope, connected_at)
  values (m.org_id, m.id, 'google', p_access, p_refresh, p_expires, p_scope, now())
  on conflict (member_id) do update set
    access_token_encrypted  = excluded.access_token_encrypted,
    -- Google returns a refresh token only on the FIRST consent. Re-connecting
    -- without one must not erase the one we hold, or the next refresh fails
    -- and the member is silently unsynced.
    refresh_token_encrypted = coalesce(excluded.refresh_token_encrypted, public.calendar_connections.refresh_token_encrypted),
    expires_at              = excluded.expires_at,
    scope                   = excluded.scope,
    connected_at            = now(),
    disconnected_at         = null
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.store_calendar_connection(text, text, timestamptz, text) from public, anon;
grant  execute on function public.store_calendar_connection(text, text, timestamptz, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- calendar_tokens_for_job — 03 §5.9c's "only the worker's narrow job
-- interface reads them", written out. This is that interface, and it is the
-- ONLY function in the schema that returns a token value.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.calendar_tokens_for_job(p_member uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select case when c.id is null then null else jsonb_build_object(
    'connection_id', c.id,
    'org_id',        c.org_id,
    'member_id',     c.member_id,
    'provider',      c.provider,
    'access_token',  c.access_token_encrypted,
    'refresh_token', c.refresh_token_encrypted,
    'expires_at',    c.expires_at,
    'scope',         c.scope) end
  from public.calendar_connections c where c.member_id = p_member
$$;
revoke execute on function public.calendar_tokens_for_job(uuid) from public, anon, authenticated;
grant  execute on function public.calendar_tokens_for_job(uuid) to service_role;

create function public.update_calendar_tokens(p_connection uuid, p_access text, p_expires timestamptz) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.calendar_connections
     set access_token_encrypted = p_access, expires_at = p_expires
   where id = p_connection;
end $$;
revoke execute on function public.update_calendar_tokens(uuid, text, timestamptz) from public, anon, authenticated;
grant  execute on function public.update_calendar_tokens(uuid, text, timestamptz) to service_role;

-- JOB-refresh_calendar_tokens' fan-out (11 §2.2, hourly cron). Returns ids
-- only: the job then asks for each one's tokens, so nothing here is a bulk
-- read of credentials.
create function public.calendar_connections_due_refresh(p_within interval default interval '30 minutes')
  returns table (connection_id uuid, member_id uuid)
language sql stable security definer set search_path = '' as $$
  select c.id, c.member_id
    from public.calendar_connections c
   where c.refresh_token_encrypted is not null
     and (c.expires_at is null or c.expires_at <= now() + p_within)
$$;
revoke execute on function public.calendar_connections_due_refresh(interval) from public, anon, authenticated;
grant  execute on function public.calendar_connections_due_refresh(interval) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- calendar_sync_target — everything JOB-calendar_upsert / _delete needs about
-- one RSVP, in one round trip: whose it is, whether they are connected, the
-- session as it stands now, and the provider event id if one exists.
--
-- `connected` is a boolean, not a token. The job asks for tokens separately
-- and only when it is actually going to call Google, so the credential is
-- fetched at the last possible moment and by the one function that may.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.calendar_sync_target(p_rsvp uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.rsvps;
  s public.sessions;
  e public.calendar_events;
  v_connected boolean;
begin
  select * into r from public.rsvps where id = p_rsvp;
  if not found then
    return null;
  end if;
  select * into s from public.sessions where id = r.session_id;
  select exists (select 1 from public.calendar_connections c where c.member_id = r.member_id) into v_connected;
  select * into e from public.calendar_events ce where ce.member_id = r.member_id and ce.session_id = r.session_id;

  return jsonb_build_object(
    'rsvp_id',     r.id,
    'org_id',      r.org_id,
    'member_id',   r.member_id,
    'session_id',  r.session_id,
    'rsvp_status', r.status::text,
    'connected',   v_connected,
    'provider_event_id', e.provider_event_id,
    'session', jsonb_build_object(
      'title',       s.title,
      'description', s.abstract,
      'starts_at',   s.starts_at,
      'ends_at',     s.ends_at,
      'time_zone',   s.time_zone,
      'state',       s.state::text,
      'cancelled',   s.state = 'cancelled',
      'location',    public.session_venue_label(s.venue_id, s.custom_venue_name)));
end $$;
revoke execute on function public.calendar_sync_target(uuid) from public, anon, authenticated;
grant  execute on function public.calendar_sync_target(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- record_calendar_sync — REQ-CAL-004's idempotency is the `unique (member_id,
-- session_id)` constraint (0026), not logic in the job. The job cannot create
-- a second event even if it runs twice, so this upserts against that
-- constraint rather than checking first.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.record_calendar_sync(
  p_org      uuid,
  p_member   uuid,
  p_session  uuid,
  p_state    public.calendar_sync_state,
  p_provider_event_id text default null,
  p_error    text default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.calendar_events (org_id, member_id, session_id, provider_event_id, state, last_synced_at, error)
  values (p_org, p_member, p_session, p_provider_event_id, p_state,
          case when p_state in ('synced', 'removed') then now() end, p_error)
  on conflict (member_id, session_id) do update set
    -- A delete that 404s knows no event id; keep the one we had rather than
    -- nulling the only record of what was created.
    provider_event_id = coalesce(excluded.provider_event_id, public.calendar_events.provider_event_id),
    state             = excluded.state,
    last_synced_at    = coalesce(excluded.last_synced_at, public.calendar_events.last_synced_at),
    error             = excluded.error
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.record_calendar_sync(uuid, uuid, uuid, public.calendar_sync_state, text, text) from public, anon, authenticated;
grant  execute on function public.record_calendar_sync(uuid, uuid, uuid, public.calendar_sync_state, text, text) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- calendar_disconnected — REQ-CAL-007's second half.
--
-- "Existing calendar events are left alone, and the member is told plainly
-- that they will no longer update." The telling is `MSG-calendar_disconnected`
-- (08 §1.6, non-optional); the leaving-alone is the absence of any
-- calendar_delete enqueued here. A disconnect is not a cancellation, and
-- silently emptying someone's calendar because they unlinked an integration
-- would be the worse surprise.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.calendar_disconnected() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.notify(
    old.org_id, old.member_id, 'account',
    jsonb_build_object('provider', old.provider::text),
    'MSG-calendar_disconnected');
  -- The sync rows stop meaning anything the moment the tokens are gone.
  update public.calendar_events set state = 'removed', error = null
   where member_id = old.member_id and state <> 'removed';
  return old;
end $$;

create trigger calendar_disconnected after delete on public.calendar_connections
  for each row execute function public.calendar_disconnected();

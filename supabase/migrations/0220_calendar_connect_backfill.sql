-- 0220 · DEC-279 — connecting a calendar adds the sessions the member had ALREADY reserved.
--
-- Serves:  01 §17 REQ-CAL-003 («real sync»), REQ-CAL-004
-- Cites:   0038 (store_calendar_connection — the body below is its current one, unchanged but for the
--          loop at the end) · 0109 (calendar_upsert per day, key `cal:{rsvp_id}`, resync_calendars()'s same call) · 0025
--          (enqueue_job, the only door to the queue)
--
-- ★ THE DEFECT. A reservation enqueues `calendar_upsert` when it is confirmed; the job finds no connected calendar and
-- does nothing, correctly. Connecting later wrote the tokens and nothing else — so every session a member reserved
-- BEFORE connecting stayed out of their calendar forever, and only reservations made afterwards ever synced. The home's
-- prompt (DEC-276) says «كل جلسة تحجزها تظهر في تقويمك», and REQ-CAL-003 says «real sync».
--
-- ★ THE FIX. After the upsert, one `calendar_upsert` per confirmed reservation of the caller's on a session that is
-- published or in progress and has not ended — the same job, the same key and the same attempts `resync_calendars()`
-- uses, so a job already pending is replaced, never doubled, and the worker's client-chosen event id makes a create that
-- already landed an update (`worker/src/calendar/api.ts`). A re-connect after a disconnect therefore resumes the events
-- the member still has. Nothing else changes: the caller is still the JWT, the tokens are still never returned.

create or replace function public.store_calendar_connection(p_access text, p_refresh text, p_expires timestamptz, p_scope text)
returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  m    public.members := public.assert_active_member();
  v_id uuid;
  r    record;
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

  -- DEC-279: the sessions already reserved, which no job will otherwise ever write.
  for r in
    select rs.id
      from public.rsvps rs
      join public.sessions s on s.id = rs.session_id
     where rs.member_id = m.id
       and rs.org_id = m.org_id
       and rs.status = 'confirmed'
       and s.state in ('published', 'in_progress')
       and exists (select 1 from public.session_days d where d.session_id = s.id and d.ends_at > now())
  loop
    perform public.enqueue_job(
      'calendar_upsert', jsonb_build_object('rsvp_id', r.id), 'cal:' || r.id::text, null, null, 8);
  end loop;

  return v_id;
end $$;
revoke execute on function public.store_calendar_connection(text, text, timestamptz, text) from public, anon;
grant  execute on function public.store_calendar_connection(text, text, timestamptz, text) to authenticated;

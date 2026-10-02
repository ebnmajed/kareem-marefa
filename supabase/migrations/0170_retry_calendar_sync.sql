-- 0170 · wave 20 (DEC-218 §2.3, REQ-UIX-075, REQ-CAL-008) — proposed by `notify`, promoted by the lead.
-- ═══════════════════════════════════════════════════════════════════════════
-- retry_calendar_sync — «أعد المحاولة» on SCR-025 (wave 20, DEC-218 §2.3).
--
-- Serves: REQ-UIX-075 (a failed session, each with «أعد المحاولة»), REQ-CAL-005 («a failed sync is retried and
-- surfaced to the member»), REQ-CAL-008 (a failure never blocks anything else).
--
-- A failed sync is recorded per member per DAY today — `calendar_events.state = 'failed'`, written by
-- `record_calendar_sync()` on every failed attempt of `calendar_upsert` (`0109`). After the job's eighth attempt
-- (`0034`, `11` §1.3) nothing re-tries it, and nothing a member may call can: `enqueue_job()` and
-- `resync_calendars()` are `service_role` only (`0025:68`, `0109:256`). This is the member's one way back.
--
-- ── What it does ────────────────────────────────────────────────────────────
--   · re-derives the caller from the JWT — it takes a calendar_events row id and NO member id;
--   · the row must be the caller's, in the caller's org, and `failed`;
--   · the caller must still hold a connection and a CONFIRMED reservation for the session — a sync for a seat that
--     is gone, or for a calendar that is unlinked, would write nothing a member asked for;
--   · it marks the session's failed days `pending` (so SCR-025's «لم تُضف» list stops listing what is being
--     retried; the job writes `failed` again if Google refuses again), then enqueues `calendar_upsert` under the
--     EXISTING key `cal:{rsvp_id}` — `enqueue_job()` replaces a pending job with that key, so two taps, or a tap
--     while the worker's own retry is pending, leave ONE job.
--
-- ── Returns an outcome, never raises after its write (DEC-043) ──────────────
--   'queued' · 'not_found' (no such row FOR THE CALLER — another member's row and a missing one are the same
--   answer) · 'not_failed' · 'not_connected' · 'not_reserved'.
--
-- ── 03 §8.2 rows ────────────────────────────────────────────────────────────
--   | `RPC-retry_calendar_sync.self` | A member re-queues their OWN failed row: the job is enqueued under
--     `cal:{rsvp_id}` and the session's failed days read `pending`. |
--   | `RPC-retry_calendar_sync.not_others` | Another member's row, and another org's, answer `not_found` and change
--     nothing. |
--   | `RPC-retry_calendar_sync.only_failed` | A row that is not `failed` answers `not_failed`; nothing is enqueued. |
--   | `RPC-retry_calendar_sync.definer_only_callers` | `authenticated` may execute; `anon` and `public` may not. |
-- ═══════════════════════════════════════════════════════════════════════════
create function public.retry_calendar_sync(p_event uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_member uuid := public.auth_member_id();
  v_org    uuid := public.auth_org_id();
  e        public.calendar_events;
  v_rsvp   uuid;
begin
  if v_member is null or v_org is null then
    return 'not_found';
  end if;

  select * into e from public.calendar_events ce
   where ce.id = p_event and ce.member_id = v_member and ce.org_id = v_org;
  if not found then
    return 'not_found';
  end if;
  if e.state <> 'failed' then
    return 'not_failed';
  end if;

  if not exists (select 1 from public.calendar_connections c where c.member_id = v_member and c.org_id = v_org) then
    return 'not_connected';
  end if;

  select r.id into v_rsvp from public.rsvps r
   where r.member_id = v_member and r.session_id = e.session_id and r.org_id = v_org and r.status = 'confirmed';
  if v_rsvp is null then
    return 'not_reserved';
  end if;

  -- One job syncs every day of the reservation (`calendar_sync_target()`), so every failed day of it is retried.
  update public.calendar_events
     set state = 'pending', error = null
   where member_id = v_member and session_id = e.session_id and state = 'failed';

  perform public.enqueue_job(
    'calendar_upsert', jsonb_build_object('rsvp_id', v_rsvp), 'cal:' || v_rsvp::text, null, null, 8);
  return 'queued';
end $$;

revoke execute on function public.retry_calendar_sync(uuid) from public, anon;
grant  execute on function public.retry_calendar_sync(uuid) to authenticated;

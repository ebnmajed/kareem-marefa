-- promoted by the lead at wave-2 sync 3 · notify (wave 2, M3) — the send side of the scheduled jobs.
--
-- Serves:  REQ-NTF-004 (the three reminders, and the nudge to non-responders,
--          distinctly) · REQ-RAT-007 (the rating prompt, filtered at SEND
--          time to members who have not yet rated)
-- Cites:   08 §4.2, §4.3 · 11 §2.6 · 0026 (notify()) · 0003 (the schedulers)
--
-- ── 03 §8.2 rows (added with this migration) ────────────────────────────────
--   | `RPC-send_reminder_notification.still_due` | A reminder for a seat that was cancelled, or for
--     a session that was, sends nothing — the job may outlive the reason for it. |
--   | `RPC-send_rsvp_nudge.non_responders` | Only members with NO rsvp row are nudged, and never a
--     presenter of the session. |
--   | `RPC-send_rating_prompt.unrated` | Filtered at SEND time: a member who rated in the first
--     hour is not prompted (`REQ-RAT-007`). |
--   | `RPC-send_*.definer_only` | All three are the worker's; no client role may fan out a
--     notification to an org. |
--
-- ── Why these are RPCs and not loops in the worker ──────────────────────────
-- Two of the three are fan-outs over a set the database already holds, and
-- the third re-checks two rows. Doing that in TypeScript would mean selecting
-- members and their addresses into the worker to decide who to write to,
-- which is the read `03` §5.9 spends a column grant preventing. The worker
-- holds service_role only through SECURITY DEFINER functions (CLAUDE.md), and
-- this is what that rule is for.

-- ═══════════════════════════════════════════════════════════════════════════
-- send_reminder_notification — JOB-send_reminder's body.
--
-- The job may outlive its reason. A reminder is scheduled days ahead; in
-- between, the member can cancel, the session can be cancelled, the seat can
-- lapse. 0003 removes the key in every path it controls, but a queue is not a
-- source of truth — so the conditions are re-read here, at the moment of
-- sending, and a reminder with nothing to remind anyone of is a silent no-op
-- rather than a message about a session that is not happening.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.send_reminder_notification(p_session uuid, p_member uuid, p_offset int) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  s public.sessions;
  r public.rsvps;
begin
  select * into s from public.sessions where id = p_session;
  if not found or s.state not in ('published', 'in_progress') or s.starts_at is null then
    return false;
  end if;
  select * into r from public.rsvps where session_id = p_session and member_id = p_member;
  if not found or r.status <> 'confirmed' then
    return false;
  end if;

  perform public.notify(
    s.org_id, p_member, 'reminders',
    jsonb_build_object(
      'session_id',     p_session,
      'title',          s.title,
      'startsAt',       s.starts_at,
      'offset_minutes', p_offset),
    public.reminder_message_key(p_offset));
  return true;
end $$;
revoke execute on function public.send_reminder_notification(uuid, uuid, int) from public, anon, authenticated;
grant  execute on function public.send_reminder_notification(uuid, uuid, int) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- send_rsvp_nudge — JOB-rsvp_nudge, 08 §4.2.
--
-- In-app only and ONCE, at the -7 d mark. §6 of the brief asks for reminders
-- to non-responders; once and in-app is the restraint that keeps that from
-- becoming the reason people mute the platform. The channel is not decided
-- here: `MSG-rsvp_nudge` carries `email = false` in the matrix, so notify()
-- would refuse to mail it even if this function asked.
--
-- A non-responder is a member with NO rsvps row at all. Someone who reserved
-- and then cancelled HAS responded, and nudging them to reconsider is the
-- thing the restraint above exists to prevent.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.send_rsvp_nudge(p_session uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  s       public.sessions;
  m       record;
  v_count int := 0;
begin
  select * into s from public.sessions where id = p_session;
  if not found or s.state <> 'published' or s.starts_at is null or s.starts_at <= now() then
    return 0;
  end if;

  for m in
    select mem.id
      from public.members mem
     where mem.org_id = s.org_id
       and mem.status = 'active'
       and not exists (select 1 from public.rsvps r where r.session_id = p_session and r.member_id = mem.id)
       -- A presenter is not a non-responder; they are the reason for the session.
       and not exists (select 1 from public.session_presenters sp where sp.session_id = p_session and sp.member_id = mem.id)
  loop
    perform public.notify(
      s.org_id, m.id, 'new_sessions',
      jsonb_build_object('session_id', p_session, 'title', s.title, 'startsAt', s.starts_at),
      'MSG-rsvp_nudge');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.send_rsvp_nudge(uuid) from public, anon, authenticated;
grant  execute on function public.send_rsvp_nudge(uuid) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- send_rating_prompt — JOB-rating_prompt, REQ-RAT-007, 08 §4.3.
--
-- ★ Filtered at SEND time, not at schedule time. Most ratings arrive in that
-- first hour, so a per-member job queued at completion would spend the hour
-- being cancelled one member at a time; one job for the session, filtered
-- when it runs, is both simpler and correct.
--
-- Checked-in attendees only: D24 makes the check-in the ONLY thing that
-- grants the right to rate, so prompting anyone else is an invitation to a
-- form that will refuse them.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.send_rating_prompt(p_session uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  s       public.sessions;
  m       record;
  v_count int := 0;
begin
  select * into s from public.sessions where id = p_session;
  if not found or s.state <> 'completed' then
    return 0;
  end if;

  for m in
    select ci.member_id
      from public.check_ins ci
     where ci.session_id = p_session
       and not exists (select 1 from public.ratings rt where rt.session_id = p_session and rt.member_id = ci.member_id)
  loop
    perform public.notify(
      s.org_id, m.member_id, 'ratings',
      jsonb_build_object('session_id', p_session, 'title', s.title),
      'MSG-rating_prompt');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.send_rating_prompt(uuid) from public, anon, authenticated;
grant  execute on function public.send_rating_prompt(uuid) to service_role;

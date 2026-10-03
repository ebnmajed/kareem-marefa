-- 0189 · promoted by the lead (wave 22, PR D) from supabase/proposed/notify/materials_added_notify.sql, unchanged below this line.
-- notify (wave 22, PR D, D-N1) — MSG-materials_added is SENT: when a material becomes visible on a session that has
-- already completed, its checked-in attendees are told, once per session per day.
--
-- Serves:  08 §1.4 («Materials added after → checked-in attendees · in-app, email · optional · my_sessions») ·
--          REQ-NTF-002 (the matrix is complete AND used) · REQ-NTF-003 (the preference decides, per channel) ·
--          REQ-MAT-006 · REQ-MAT-010 · REQ-MAT-012
-- Cites:   0026 (notify(), the matrix) · 0133:99 (the key's bindings: session_id, title, url) · 0037 (materials,
--          material_versions) · 0077:54 (finalize_material_upload() sets current_version_id) · 0087 (check_ins.removed_at)
--          · 0088:261 (send_rating_prompt(): «checked-in attendees» as a query) · 0100 (a check-in per day)
--
-- ── What «added» is (notes/notify.md WD.1) ──────────────────────────────────────────────────────────────────────────
-- The moment a member could first OPEN it: a file when `current_version_id` goes from null to a version — after its
-- bytes were sniffed and accepted, never at the pending row (a rejected upload is never retrievable, REQ-MAT-012); a
-- link at its insert. A replacement (one version to another, REQ-MAT-010) is not «added»; nor is a phase flip, which
-- changes nothing a member sees once the session has completed. «After» is the session's `completed` state — the
-- message goes to people who checked in, which only a held session has.
--
-- ── Once per session per day (WD.3) ─────────────────────────────────────────────────────────────────────────────────
-- A deck, a recording and two links added after the session are one event to an attendee. The first material to become
-- visible on a completed session on a given day, in the org's time zone, sends; a later one that day finds an earlier
-- visible addition and sends nothing. The batch is read from `materials` itself — a link's `created_at`, a file's first
-- version's `uploaded_at` — counted only from the later of the day's start and `completed_at`, so a pre-read uploaded
-- before the session never suppresses the first announcement. No table, no column, no worker task.
--
-- ── The writer ──────────────────────────────────────────────────────────────────────────────────────────────────────
-- SECURITY DEFINER with an empty search path: the writes that fire it are a presenter's (finalize_material_upload(),
-- a link under `p8_presenter_write`), and notify() is granted to service_role only. Every send goes through notify(),
-- which applies the member's `my_sessions` preference per channel and enqueues the mail. Nothing here writes
-- `notifications`. A function returning `trigger` cannot be called through the API (definer-exposure).
--
-- Additive for `main`, which runs this schema before its code: the trigger fires on writes `main` already makes and adds
-- notifications through the path every other key uses. `main`'s worker already renders MSG-materials_added (its design,
-- its subject, its link exist since wave 10). Nothing else moves.

create function public.materials_added_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  s           public.sessions;
  v_tz        text;
  v_since     timestamptz;
  v_member    uuid;
begin
  -- Only the moment a member could first open it.
  if not (
       (tg_op = 'INSERT' and new.external_url is not null)
    or (tg_op = 'UPDATE' and old.current_version_id is null and new.current_version_id is not null)
    or (tg_op = 'UPDATE' and old.removed_at is not null and new.removed_at is null
        and (new.current_version_id is not null or new.external_url is not null))
  ) then
    return new;
  end if;
  if new.session_id is null or new.removed_at is not null then
    return new;   -- a proposal's own material, or a removed one
  end if;

  select * into s from public.sessions where id = new.session_id;
  if not found or s.state <> 'completed' then
    return new;
  end if;

  -- The batch: anything else on this session that became visible today (org time) and after the session ended.
  select coalesce(os.time_zone, 'Asia/Riyadh') into v_tz from public.org_settings os where os.org_id = new.org_id;
  v_since := greatest(
    (date_trunc('day', now() at time zone coalesce(v_tz, 'Asia/Riyadh')) at time zone coalesce(v_tz, 'Asia/Riyadh')),
    coalesce(s.completed_at, now()));
  if exists (
    select 1
      from public.materials m
     where m.session_id = new.session_id
       and m.id <> new.id
       and m.removed_at is null
       and (m.external_url is not null or m.current_version_id is not null)
       and coalesce(
             (select min(v.uploaded_at) from public.material_versions v where v.material_id = m.id),
             m.created_at) >= v_since
  ) then
    return new;
  end if;

  -- The checked-in attendees: one row per day on a multi-day session, so distinct; a removed check-in is not attendance.
  for v_member in
    select distinct ci.member_id
      from public.check_ins ci
     where ci.session_id = new.session_id
       and ci.removed_at is null
  loop
    perform public.notify(
      new.org_id, v_member, 'my_sessions',
      jsonb_build_object('session_id', new.session_id, 'title', s.title),
      'MSG-materials_added');
  end loop;

  return new;
end $$;

create trigger materials_added_notify
  after insert or update of current_version_id, removed_at on public.materials
  for each row execute function public.materials_added_notify();

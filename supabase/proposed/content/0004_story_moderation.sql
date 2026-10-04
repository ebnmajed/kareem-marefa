-- content · wave 26, PR D — a frame is reported, taken down, decided and removed (REQ-STO-014, REQ-STO-015,
-- REQ-STO-017, DEC-251 §4.8 – §4.9).
--
-- Serves:  01 §25 REQ-STO-014 · REQ-STO-015 · REQ-STO-017 · REQ-EVT-008 · REQ-EVT-012 · REQ-EVT-014 · REQ-PTS-013 ·
--          REQ-ADM-010 · REQ-ADM-018
-- Cites:   0037 (photo_takedowns) · 0059 (remove_photo, photo.removed, the photo_removed reversal) · 0181
--          (report.resolved) · 0190 (report_photo — the shape copied) · 0198 (story_frames, story_frame_takedowns,
--          reports.story_frame_id) · notes/content.md W26 §6 – §7
--
-- ★ THE RULINGS (DEC-251 §4.8 – §4.9). One report hides the FRAME; a photo frame's photograph stays in the album
-- (REQ-EVT-008 governs the album, and hiding the photograph would reverse its points on one member's word). «أزلني» on a
-- photo frame is the photograph's OWN takedown (the existing `photo_takedowns` insert — not here); on a video frame it is
-- `request_story_frame_takedown()` below. A removal REQUEST is not audited — its row is the record, as a photograph's
-- is; a DECISION is (`report.resolved` by 0181's trigger, `story_frame.removed` / `story_frame.restored` by this file's
-- trigger function). A hidden video sends no notification (STO §F).
--
-- ★ NO FUNCTION HERE WRITES `audit_log` OR `points_ledger` DIRECTLY. A photo frame's removal is `remove_photo()` (0059),
-- whose own triggers write `photo.removed` and the compensating «حُذف المحتوى» row; a video earned nothing, so its
-- removal reverses nothing.
--
-- ★ AN ENVELOPE, NOT A RAISE (DEC-043): every refusal returns before the first write.

-- ─── 0 · what a member may see of a frame right now — the same rule as 0198's member predicate ─────────────────
-- Private to this file's definers (which bypass RLS and so must re-derive it). If 0198's `story_frame_is_visible()`
-- takes a frame id, the lead replaces the body with a call to it at promotion, so the two cannot drift.
create function public._story_frame_member_visible(f public.story_frames) returns boolean
language sql stable security definer set search_path = '' as $$
  select f.org_id = public.auth_org_id()
     and f.state = 'visible'
     and f.hidden_at is null
     and f.removed_at is null
     and f.triggered_at > now() - interval '24 hours'
     and exists (select 1 from public.sessions s where s.id = f.session_id and s.state <> 'cancelled')
     and (f.photo_id is null
          or exists (select 1 from public.photos p where p.id = f.photo_id and p.hidden_at is null and p.removed_at is null))
$$;
revoke all on function public._story_frame_member_visible(public.story_frames) from public, anon, authenticated;

-- ─── 1 · report_story_frame() — a member reports an attendee's frame; it hides at once ─────────────────────────
-- { outcome: 'reported' | 'already_reported' | 'own_frame' | 'not_visible' | 'not_reportable' | 'reason_required', report_id? }
-- 03 §8.2:
--   | `RPC-report_story_frame` | a visible attendee frame ✓ (one `story_frame` report; the frame hidden «reported»; a photo frame's photograph untouched, its points untouched) · own ✗ · generated frame ✗ · expired/hidden ✗ · twice ✗ · another org ✗ · reason < 3 ✗ |
create function public.report_story_frame(p_frame uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_active_member();
  f     public.story_frames;
  why   text := btrim(coalesce(p_reason, ''));
  rid   uuid;
begin
  select * into f from public.story_frames where id = p_frame and org_id = actor.org_id for update;
  if not found or not public._story_frame_member_visible(f) then
    return jsonb_build_object('outcome', 'not_visible');
  end if;
  if f.kind not in ('photo', 'video') then
    return jsonb_build_object('outcome', 'not_reportable');   -- a generated frame is the session's own data
  end if;
  if coalesce(f.author_id, (select uploader_id from public.photos where id = f.photo_id)) = actor.id then
    return jsonb_build_object('outcome', 'own_frame');
  end if;
  if char_length(why) < 3 or char_length(why) > 1000 then
    return jsonb_build_object('outcome', 'reason_required');
  end if;
  if exists (select 1 from public.reports where target = 'story_frame' and story_frame_id = p_frame and reporter_id = actor.id) then
    return jsonb_build_object('outcome', 'already_reported');
  end if;

  -- ── nothing above this line writes ─────────────────────────────────────────
  insert into public.reports (org_id, target, story_frame_id, reporter_id, reason)
  values (actor.org_id, 'story_frame', p_frame, actor.id, why)
  returning id into rid;
  update public.story_frames set hidden_at = now(), hidden_reason = 'reported' where id = p_frame and hidden_at is null;
  return jsonb_build_object('outcome', 'reported', 'report_id', rid);
end $$;
revoke execute on function public.report_story_frame(uuid, text) from public, anon;
grant  execute on function public.report_story_frame(uuid, text) to authenticated;

-- The same rules on a direct insert under `reports_insert_self` (0010). The lead attaches it:
--   create trigger reports_story_frame_guard before insert on public.reports
--     for each row when (new.target::text = 'story_frame') execute function public.reports_story_frame_guard();
create function public.reports_story_frame_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare f public.story_frames;
begin
  select * into f from public.story_frames where id = new.story_frame_id and org_id = new.org_id;
  if not found or f.kind not in ('photo', 'video') or f.state <> 'visible' or f.removed_at is not null then
    raise exception 'not_visible' using errcode = '23514';
  end if;
  if coalesce(f.author_id, (select uploader_id from public.photos where id = f.photo_id)) = new.reporter_id then
    raise exception 'own_frame' using errcode = '23514';
  end if;
  if exists (select 1 from public.reports where target = 'story_frame' and story_frame_id = new.story_frame_id and reporter_id = new.reporter_id) then
    raise exception 'already_reported' using errcode = '23505';
  end if;
  return new;
end $$;
revoke execute on function public.reports_story_frame_guard() from public, anon, authenticated;

-- ─── 2 · request_story_frame_takedown() — «أزلني» on a VIDEO frame ─────────────────────────────────────────────
-- { outcome: 'hidden' | 'already_requested' | 'not_visible' | 'use_photo_takedown' }
-- 03 §8.2:
--   | `RPC-request_story_frame_takedown` | a visible video frame ✓ (one takedown row; the frame hidden «takedown_requested» for everyone at once; no notification, no audit row) · a photo frame → `use_photo_takedown` (the photograph's own door) · twice → one row |
create function public.request_story_frame_takedown(p_frame uuid)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_active_member();
  f     public.story_frames;
begin
  select * into f from public.story_frames where id = p_frame and org_id = actor.org_id for update;
  if not found or not public._story_frame_member_visible(f) then
    return jsonb_build_object('outcome', 'not_visible');
  end if;
  if f.kind = 'photo' then
    return jsonb_build_object('outcome', 'use_photo_takedown', 'photo_id', f.photo_id);
  end if;
  if f.kind <> 'video' then
    return jsonb_build_object('outcome', 'not_visible');
  end if;
  if exists (select 1 from public.story_frame_takedowns where frame_id = p_frame and requester_id = actor.id and resolved_at is null) then
    return jsonb_build_object('outcome', 'already_requested');
  end if;

  -- ── nothing above this line writes ─────────────────────────────────────────
  insert into public.story_frame_takedowns (org_id, frame_id, requester_id) values (actor.org_id, p_frame, actor.id);
  update public.story_frames set hidden_at = now(), hidden_reason = 'takedown_requested' where id = p_frame and hidden_at is null;
  return jsonb_build_object('outcome', 'hidden');
end $$;
revoke execute on function public.request_story_frame_takedown(uuid) from public, anon;
grant  execute on function public.request_story_frame_takedown(uuid) to authenticated;

-- ─── 3 · remove_story_frame() — staff, from SCR-044's strip or the queue ───────────────────────────────────────
-- { outcome: 'removed' | 'already_removed' | 'not_found' | 'not_authorized' | 'reason_required' | 'not_removable' }
-- 03 §8.2:
--   | `RPC-remove_story_frame` | admin ✓ · moderator ✓ · member ✗ · another org ✗ · no reason ✗ · a photo frame → remove_photo() (photo.removed, one photo_removed row, the frame gone by its join, the album with it) · a video frame → removed_at, its reports and takedowns closed, `story_frame.removed`, a purge enqueued, NO ledger row · twice → already_removed |
create function public.remove_story_frame(p_frame uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_active_member();
  f     public.story_frames;
  why   text := btrim(coalesce(p_reason, ''));
begin
  if actor.org_role not in ('admin', 'moderator') then
    return jsonb_build_object('outcome', 'not_authorized');
  end if;
  select * into f from public.story_frames where id = p_frame and org_id = actor.org_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if f.kind not in ('photo', 'video') then
    return jsonb_build_object('outcome', 'not_removable');
  end if;
  if f.removed_at is not null
     or (f.kind = 'photo' and exists (select 1 from public.photos where id = f.photo_id and removed_at is not null)) then
    return jsonb_build_object('outcome', 'already_removed');
  end if;
  if char_length(why) < 3 then
    return jsonb_build_object('outcome', 'reason_required');
  end if;

  -- ── nothing above this line writes ─────────────────────────────────────────
  update public.reports
     set status = 'resolved', resolution = 'removed', resolved_by = actor.id, resolved_at = now()
   where org_id = actor.org_id and target = 'story_frame' and story_frame_id = p_frame and status = 'open';

  if f.kind = 'photo' then
    -- The photograph's own removal: photo.removed (0059), the compensating «حُذف المحتوى» row (0059), its takedowns and
    -- photo reports closed. The frame disappears by its join; its objects stay unreadable, as every removed photo's do.
    perform public.remove_photo(f.photo_id, why);
  else
    update public.story_frames
       set removed_at = now(), removed_by = actor.id, removal_reason = left(why, 300),
           hidden_at = coalesce(hidden_at, now()), hidden_reason = coalesce(hidden_reason, 'removed')
     where id = p_frame;
    update public.story_frame_takedowns
       set resolved_at = now(), resolution = 'removed', resolved_by = actor.id
     where frame_id = p_frame and resolved_at is null;
  end if;
  return jsonb_build_object('outcome', 'removed', 'kind', f.kind::text);
end $$;
revoke execute on function public.remove_story_frame(uuid, text) from public, anon;
grant  execute on function public.remove_story_frame(uuid, text) to authenticated;

-- ─── 4 · decide_story_frame() — staff restore or dismiss a hidden frame from the queue ─────────────────────────
-- { outcome: 'restored' | 'dismissed' | 'removed' | 'not_found' | 'not_authorized' | 'reason_required' | 'invalid' | 'already_removed' }
-- 'removed' delegates to remove_story_frame(). 'restored' and 'dismissed' both clear the FRAME's hide (never a
-- photograph's — the photograph's own decisions stay the photo queue's) and close the frame's open reports and
-- takedowns with that resolution; 0181's trigger audits each report's resolution.
-- 03 §8.2:
--   | `RPC-decide_story_frame` | staff ✓ · member ✗ · restored/dismissed → hidden_at cleared, open reports and takedowns closed · removed → remove_story_frame() |
create function public.decide_story_frame(p_frame uuid, p_outcome public.moderation_action, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_active_member();
  f     public.story_frames;
begin
  if actor.org_role not in ('admin', 'moderator') then
    return jsonb_build_object('outcome', 'not_authorized');
  end if;
  if p_outcome is null then
    return jsonb_build_object('outcome', 'invalid');
  end if;
  if p_outcome = 'removed' then
    return public.remove_story_frame(p_frame, p_reason);
  end if;
  select * into f from public.story_frames where id = p_frame and org_id = actor.org_id for update;
  if not found or f.kind not in ('photo', 'video') then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if f.removed_at is not null then
    return jsonb_build_object('outcome', 'already_removed');
  end if;

  -- ── nothing above this line writes ─────────────────────────────────────────
  update public.reports
     set status = case when p_outcome = 'dismissed' then 'dismissed'::public.report_status else 'resolved'::public.report_status end,
         resolution = p_outcome, resolved_by = actor.id, resolved_at = now()
   where org_id = actor.org_id and target = 'story_frame' and story_frame_id = p_frame and status = 'open';
  update public.story_frame_takedowns
     set resolved_at = now(), resolution = p_outcome, resolved_by = actor.id
   where frame_id = p_frame and resolved_at is null;
  update public.story_frames set hidden_at = null, hidden_reason = null where id = p_frame and hidden_at is not null;
  return jsonb_build_object('outcome', p_outcome::text);
end $$;
revoke execute on function public.decide_story_frame(uuid, public.moderation_action, text) from public, anon;
grant  execute on function public.decide_story_frame(uuid, public.moderation_action, text) to authenticated;

-- ─── 5 · the trigger functions the lead attaches in 0198 ───────────────────────────────────────────────────────
--   create trigger story_frames_audit after update of removed_at, hidden_at on public.story_frames
--     for each row execute function public.story_frames_audit();
--   create trigger story_frames_purge after delete or update of removed_at on public.story_frames
--     for each row execute function public.story_frames_purge();
--
-- story_frame.removed — a staff removal of a video frame (a photo frame's removal is photo.removed, 0059).
-- story_frame.restored — staff clearing a hide (a decision; a hide itself is a request, not audited).
create function public.story_frames_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.removed_at is null and new.removed_at is not null then
    perform public.write_audit(new.org_id, 'story_frame.removed', 'story_frame', new.id, null,
      jsonb_build_object('removed_by', new.removed_by, 'kind', new.kind::text, 'session_id', new.session_id), new.removal_reason);
  elsif old.hidden_at is not null and new.hidden_at is null and new.removed_at is null then
    perform public.write_audit(new.org_id, 'story_frame.restored', 'story_frame', new.id,
      jsonb_build_object('hidden_reason', old.hidden_reason), null);
  end if;
  return null;
end $$;
revoke all on function public.story_frames_audit() from public, anon, authenticated;

-- A video's objects go with its frame — deleted (a session's or org's cascade) or removed by staff. `purge_story_video`
-- deletes everything under the frame's prefix; `delete_org` covers the bucket for an org's deletion as well.
create function public.story_frames_purge() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r public.story_frames := case when tg_op = 'DELETE' then old else new end;
begin
  if r.kind <> 'video' then
    return null;
  end if;
  if tg_op = 'UPDATE' and not (old.removed_at is null and new.removed_at is not null) then
    return null;
  end if;
  perform public.enqueue_job(
    'purge_story_video',
    jsonb_build_object('frame_id', r.id, 'org_id', r.org_id, 'session_id', r.session_id),
    'story_purge:' || r.id::text
  );
  return null;
end $$;
revoke all on function public.story_frames_purge() from public, anon, authenticated;

-- 0183 · promoted by the lead (wave 22, DEC-232 §4.5) from supabase/proposed/content/0001_resolve_report.sql, unchanged below this line.
-- content · wave 22, PR C — one decision on reported content, in one transaction.
--
-- Serves:  01 §20 REQ-ADM-010, REQ-ADM-023 · §12 REQ-EVT-008, REQ-EVT-014 · REQ-UIX-103, REQ-UIX-104
-- Cites:   DEC-231 §4.2, DEC-232 §4.5 · 0010 (reports), 0059 (comments_audit_staff_actions, remove_photo),
--          0032 (_reverse_comment_points) · docs/plan/notes/content.md W22.5
--
-- ★ WHY. `admin-moderation.ts` removed a comment and then marked its report in two separate writes from the DAL —
-- a failure between them left a removed comment under an open report. It also resolved only the ONE report it was
-- handed (a second member's report on the same comment stayed in the queue), and removing a comment its author had
-- already deleted re-stamped `deleted_at`, so `comments_guard()` rewrote `deleted_by` from the author to the moderator.
-- This function does all of it in one transaction, and the decision is about the CONTENT: every open report on the
-- same comment or photo closes with it, with the same outcome and actor.
--
-- ★ IT NEVER WRITES `audit_log`. One writer per fact: `report.resolved` is the lead's trigger on `reports`
-- (DEC-231 §4), and `comment.removed` / `photo.removed` are 0059's triggers. `remove_photo()` resolving a photo's
-- reports fires the same `report.resolved` trigger, which is the point.
--
-- ★ AN ENVELOPE, NOT A RAISE (DEC-043). Every refusal returns before the first write. The one call that can still
-- raise, `remove_photo()`, does so only on the three refusals already checked here, and before its own first write.
--
-- Envelope: { outcome: 'removed' | 'dismissed' | 'already_resolved' | 'not_found' | 'not_authorized'
--                      | 'reason_required' | 'invalid', target?, resolved? }
create function public.resolve_report(p_report uuid, p_outcome public.moderation_action, p_reason text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_active_member();
  rep   public.reports;
  why   text := nullif(btrim(coalesce(p_reason, '')), '');
  n     int;
begin
  if actor.org_role not in ('admin', 'moderator') then
    return jsonb_build_object('outcome', 'not_authorized');
  end if;
  if p_outcome is null or p_outcome not in ('removed', 'dismissed') then
    return jsonb_build_object('outcome', 'invalid');
  end if;

  select * into rep from public.reports where id = p_report and org_id = actor.org_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if rep.status <> 'open' then
    return jsonb_build_object('outcome', 'already_resolved', 'resolution', rep.resolution::text);
  end if;

  if p_outcome = 'removed' then
    -- A reason is owed only for content still visible: an author's own delete needs none and is never re-stamped.
    if (rep.target = 'comment' and exists (select 1 from public.comments where id = rep.comment_id and deleted_at is null))
       or rep.target = 'photo' then
      if why is null or char_length(why) < 3 then
        return jsonb_build_object('outcome', 'reason_required');
      end if;
    end if;
  end if;

  -- Every open report on the same content, counted (and locked) before anything is written.
  select count(*) into n from (
    select 1 from public.reports
     where org_id = actor.org_id and status = 'open' and target = rep.target
       and (case when rep.target = 'comment' then comment_id = rep.comment_id else photo_id = rep.photo_id end)
     for update
  ) open_reports;

  -- ── nothing above this line writes ─────────────────────────────────────────
  if p_outcome = 'removed' then
    if rep.target = 'comment' then
      update public.comments
         set deleted_at = now(), removal_reason = why
       where id = rep.comment_id and deleted_at is null;
    else
      perform public.remove_photo(rep.photo_id, why);   -- also closes the photo's open takedowns and reports
    end if;
  end if;

  update public.reports
     set status = 'resolved', resolution = p_outcome, resolved_by = actor.id, resolved_at = now()
   where org_id = actor.org_id and status = 'open' and target = rep.target
     and (case when rep.target = 'comment' then comment_id = rep.comment_id else photo_id = rep.photo_id end);

  return jsonb_build_object('outcome', p_outcome::text, 'target', rep.target::text, 'resolved', n);
end $$;
revoke execute on function public.resolve_report(uuid, public.moderation_action, text) from public, anon;
grant  execute on function public.resolve_report(uuid, public.moderation_action, text) to authenticated;

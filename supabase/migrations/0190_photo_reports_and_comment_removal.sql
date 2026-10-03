-- 0190 · wave 22, PR D (REQ-EVT-008, REQ-EVT-014) — promoted by the lead from content's supabase/proposed/content/0002_report_photo.sql
-- and 0003_remove_comment.sql, unchanged below their markers, plus the guard trigger 0002 names, created here by the lead.

-- ═══ 0002_report_photo.sql ═══
-- content · wave 22, PR D — a member reports a photograph (REQ-EVT-008, F1).
--
-- Serves:  01 §12 REQ-EVT-008 · REQ-UIX-104 (the report lands on SCR-051's «بلاغات الصور»)
-- Cites:   0010 (reports, reports_insert_self, reports_notify), 0037 (photos), notes/content.md W22-D
--
-- ★ WHY A FUNCTION. «Any member can report a comment or photo» was half built: nothing filed a photo report. The door
-- is one definer function that says what it did, and refuses what a report must never be:
--   · a photograph that is not VISIBLE (hidden by a takedown, or removed) — there is nothing left to report;
--   · the reporter's OWN photograph;
--   · a second report by the same member on the same photograph (any earlier one, open or closed — the comment
--     report's rule, `hasReportedComment()`).
-- A filed report writes no audit row (it is not a console mutation); `reports_notify()` tells staff as it does for a
-- comment. Reported items stay visible pending review — nothing here hides anything.
--
-- ★ AN ENVELOPE, NOT A RAISE: every refusal returns before the one insert.
-- { outcome: 'reported' | 'already_reported' | 'own_photo' | 'not_visible' | 'reason_required', report_id? }
create function public.report_photo(p_photo uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_active_member();
  ph    public.photos;
  why   text := btrim(coalesce(p_reason, ''));
  rid   uuid;
begin
  select * into ph from public.photos where id = p_photo and org_id = actor.org_id;
  if not found or ph.hidden_at is not null or ph.removed_at is not null then
    return jsonb_build_object('outcome', 'not_visible');
  end if;
  if ph.uploader_id = actor.id then
    return jsonb_build_object('outcome', 'own_photo');
  end if;
  if char_length(why) < 3 or char_length(why) > 1000 then
    return jsonb_build_object('outcome', 'reason_required');
  end if;
  if exists (select 1 from public.reports where target = 'photo' and photo_id = p_photo and reporter_id = actor.id) then
    return jsonb_build_object('outcome', 'already_reported');
  end if;

  insert into public.reports (org_id, target, photo_id, reporter_id, reason)
  values (actor.org_id, 'photo', p_photo, actor.id, why)
  returning id into rid;
  return jsonb_build_object('outcome', 'reported', 'report_id', rid);
end $$;
revoke execute on function public.report_photo(uuid, text) from public, anon;
grant  execute on function public.report_photo(uuid, text) to authenticated;

-- ★ THE SAME RULES ON A DIRECT INSERT — `reports_insert_self` (0010) still admits one that skips the function. This is
-- the guard's function; the `before insert` trigger on `reports` is the lead's to create (a trigger is the lead's):
--
--   create trigger reports_photo_guard before insert on public.reports
--     for each row when (new.target = 'photo') execute function public.reports_photo_guard();
--
-- It raises — a refused insert has written nothing, so DEC-043's rule is not in play. Definer, because the reporter
-- cannot read a hidden photo through RLS and the check must see it to refuse it.
create function public.reports_photo_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare ph public.photos;
begin
  select * into ph from public.photos where id = new.photo_id and org_id = new.org_id;
  if not found or ph.hidden_at is not null or ph.removed_at is not null then
    raise exception 'not_visible' using errcode = '23514';
  end if;
  if ph.uploader_id = new.reporter_id then
    raise exception 'own_photo' using errcode = '23514';
  end if;
  if exists (select 1 from public.reports where target = 'photo' and photo_id = new.photo_id and reporter_id = new.reporter_id) then
    raise exception 'already_reported' using errcode = '23505';
  end if;
  return new;
end $$;
revoke execute on function public.reports_photo_guard() from public, anon, authenticated;

-- ═══ the guard, attached (the lead) — a direct insert under reports_insert_self can no longer skip report_photo()'s rules ═══
create trigger reports_photo_guard before insert on public.reports
  for each row when (new.target = 'photo') execute function public.reports_photo_guard();

-- ═══ 0003_remove_comment.sql ═══
-- content · wave 22, PR D — staff remove a comment on the event page, with a reason (REQ-EVT-014, F6).
--
-- Serves:  01 §12 REQ-EVT-014, REQ-EVT-008 · REQ-ADM-010, REQ-ADM-023
-- Cites:   0010 (comments, comments_guard), 0032 (_reverse_comment_points), 0059 (comments_audit_staff_actions),
--          0181 (report.resolved), 0183 (resolve_report — the same shape), notes/content.md W22-D
--
-- ★ WHY. The event page's «إزالة» was a plain `deleted_at` update from the DAL: no reason (REQ-EVT-014 «audited with
-- actor and reason») and every report on the comment left open in SCR-050's queue. This is one transaction: the reason
-- required, the comment removed if still visible (an author's own delete is never re-stamped, so `deleted_by` stays
-- the author's), and every open report on it resolved `removed` by the actor.
--
-- ★ IT NEVER WRITES `audit_log`: `comment.removed` (with the reason) is 0059's trigger, `report.resolved` is 0181's,
-- the reversal is 0032's. ★ AN ENVELOPE, NOT A RAISE: every refusal returns before the first write (DEC-043).
-- { outcome: 'removed' | 'already_removed' | 'not_found' | 'not_authorized' | 'reason_required', resolved? }
create function public.remove_comment(p_comment uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_active_member();
  c     public.comments;
  why   text := btrim(coalesce(p_reason, ''));
  n     int;
begin
  if actor.org_role not in ('admin', 'moderator') then
    return jsonb_build_object('outcome', 'not_authorized');
  end if;
  select * into c from public.comments where id = p_comment and org_id = actor.org_id for update;
  if not found then
    return jsonb_build_object('outcome', 'not_found');
  end if;
  if c.deleted_at is null and char_length(why) < 3 then
    return jsonb_build_object('outcome', 'reason_required');
  end if;

  -- ── nothing above this line writes ─────────────────────────────────────────
  if c.deleted_at is null then
    update public.comments set deleted_at = now(), removal_reason = left(why, 300) where id = p_comment;
  end if;
  update public.reports
     set status = 'resolved', resolution = 'removed', resolved_by = actor.id, resolved_at = now()
   where org_id = actor.org_id and target = 'comment' and comment_id = p_comment and status = 'open';
  get diagnostics n = row_count;

  return jsonb_build_object('outcome', case when c.deleted_at is null then 'removed' else 'already_removed' end, 'resolved', n);
end $$;
revoke execute on function public.remove_comment(uuid, text) from public, anon;
grant  execute on function public.remove_comment(uuid, text) to authenticated;

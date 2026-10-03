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

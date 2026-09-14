-- promoted by the lead at wave-2 sync 3 · scoring/0005_manual_adjustment_and_reversal.sql — the admin manual
-- adjustment RPC (05 §7, REQ-PTS-009, D41) and reversal-on-removal for
-- comments (05 §2.4, REQ-PTS-013, OQ-014). STORY-PTS-004, STORY-PTS-005.
--
-- photo_removed's reversal is deferred: `photos` is an M5 (`content`)
-- table that does not exist yet. The same shape applies the day it does —
-- noted here rather than faked.
--
-- 03 §8.2 rows this adds:
--   RPC-adjust_points_manually.admin_only — a moderator and a stale admin
--     are refused; a fresh admin succeeds; a caller-error (empty reason,
--     zero amount, another org's member) raises before anything is written.
--   RPC-adjust_points_manually.audited — the ledger row and the audit_log
--     row commit in the same transaction.
--   POL-comments.reversal_hook — a moderator's removal of a comment writes
--     a compensating reversal row for whatever the original comment award
--     was (nothing, if it was capped or cooled down), and separately
--     evaluates the off-by-default comment_removed penalty.

-- ═══════════════════════════════════════════════════════════════════════════
-- adjust_points_manually — D41, REQ-PTS-009. Mandatory Arabic reason,
-- member-visible. Never deduplicated (05 §7): the idempotency key carries a
-- fresh uuid, not a deterministic hash of the inputs, because two
-- deliberate adjustments of the same amount for the same reason are two
-- real events, not a retry of one.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.adjust_points_manually(p_member uuid, p_amount int, p_reason text)
returns public.points_ledger
language plpgsql security definer set search_path = '' as $$
declare
  admin  public.members := public.assert_fresh_admin();
  target public.members;
  row    public.points_ledger;
  key    text;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '23514';
  end if;
  if p_amount = 0 then
    raise exception 'amount_required' using errcode = '23514';
  end if;

  select * into target from public.members where id = p_member and org_id = admin.org_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  key := 'manual:' || gen_random_uuid() || ':v1';

  insert into public.points_ledger (org_id, member_id, amount, source, reason, actor_id, idempotency_key)
  values (admin.org_id, p_member, p_amount, 'manual_adjustment', btrim(p_reason), admin.id, key)
  returning * into row;

  perform public.write_audit(admin.org_id, 'points.manual_adjustment', 'points_ledger', row.id,
           null, jsonb_build_object('member_id', p_member, 'amount', p_amount), p_reason, null, admin.id);

  return row;
end $$;
revoke execute on function public.adjust_points_manually(uuid, int, text) from public, anon;
grant  execute on function public.adjust_points_manually(uuid, int, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- comments — reversal on removal. Two independent movements (05 §2.4):
-- a compensating row undoing whatever the original `comment` award was
-- (zero rows if it earned nothing — a capped sixth comment has nothing to
-- reverse), and a separate, off-by-default `comment_removed` penalty.
-- Without the first, deleting a comment after earning its points is free
-- points; without the second being separate, an org that wants no
-- penalties still could not avoid one.
-- ═══════════════════════════════════════════════════════════════════════════
create function public._reverse_comment_points() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  original public.points_ledger;
  key      text;
begin
  if new.deleted_at is not null and old.deleted_at is null then
    select * into original from public.points_ledger
     where source = 'comment' and source_id = new.id
     limit 1;
    if found then
      key := 'reversal:' || original.id || ':v1';
      insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id,
                                        reason, rule_key, idempotency_key)
      values (original.org_id, original.member_id, -original.amount, 'reversal', original.id,
              original.session_id, 'حُذف المحتوى', 'comment', key)
      on conflict (idempotency_key) do nothing;
    end if;

    perform public.award_points('comment_removed', new.author_id, 'content_removed', new.id, new.session_id);
  end if;
  return new;
end $$;
create trigger comments_reverse_points after update on public.comments
  for each row execute function public._reverse_comment_points();

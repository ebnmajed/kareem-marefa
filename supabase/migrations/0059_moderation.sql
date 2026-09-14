-- promoted by the lead at wave-3 sync 3 · console (wave 3, M7) — SCR-050/051/052's moderation queues. Closes two
-- gaps `event`'s and `content`'s own notes already flagged as belonging to
-- whoever builds the moderation UI (that's this migration):
--
--   · `content`'s note on `photo_takedowns_guard()` (docs/plan/notes/
--     content.md §1.4): "`resolution = 'removed'`/`'dismissed'` do nothing
--     at the schema level yet … the removal audit row and 05 §2.4's
--     compensating ledger entry are REQ-EVT-014's and belong to
--     STORY-EVT-006's RPC, not this schema pass."
--   · `scoring`'s note on `_reverse_comment_points()` (migration `0032`'s
--     own header): "photo_removed's reversal is deferred: `photos` is an
--     M5 (`content`) table that does not exist yet. The same shape applies
--     the day it does — noted here rather than faked."
--
-- Serves:  01 §20 REQ-ADM-010, §12 REQ-EVT-008/012/014, §14 REQ-PTS-013
-- Cites:   03 §5.6 (comments/photos/photo_takedowns/reports), 0032
--          (_reverse_comment_points, the shape this mirrors),
--          0051 (photos_audit_staff_actions, the shape this extends),
--          DEC-005 (the takedown queue is distinct from the report queue)
--
-- Neither `comments` nor `photos` had a place to hold a removal reason —
-- REQ-EVT-014's "audited with actor AND REASON" needed a column neither
-- table has. Additive `alter table`, the same forward-reference pattern
-- `0037` used for `reports.photo_id`'s own FK.
alter table public.comments add column removal_reason text;
alter table public.photos   add column removal_reason text;
grant update (removal_reason) on public.comments to authenticated;
grant update (removal_reason) on public.photos   to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- comments — an audit row on every removal/restoration, mirroring
-- `photos_audit_staff_actions` (`0051`) exactly. `moderateComment()`
-- (event's `src/lib/dal/comments.ts`) writes `deleted_at` directly, so a
-- table trigger is what makes "audited" hold regardless of which write
-- path sets it, the same reasoning `0051`'s own header gives.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.comments_audit_staff_actions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.deleted_at is null and new.deleted_at is not null then
    perform public.write_audit(new.org_id, 'comment.removed', 'comment', new.id,
                                null, jsonb_build_object('deleted_by', new.deleted_by), new.removal_reason);
  end if;
  if old.deleted_at is not null and new.deleted_at is null then
    perform public.write_audit(new.org_id, 'comment.restored', 'comment', new.id, null, null);
  end if;
  return new;
end $$;
create trigger comments_audit_staff_actions after update of deleted_at on public.comments
  for each row execute function public.comments_audit_staff_actions();

-- ═══════════════════════════════════════════════════════════════════════════
-- photos — the removal path REQ-EVT-014/REQ-PTS-013 need. `remove_photo()`
-- is the one door: sets `removed_at`/`removed_by`/`removal_reason`, and
-- also hides the photo (`hidden_at`) so `photos_read`'s own policy — which
-- checks `hidden_at`, not `removed_at` — actually refuses a non-staff
-- reader, not only the DAL's own `.is("removed_at", null)` filter
-- (`getPhotosPageData`, defence in depth, never the boundary — CLAUDE.md).
-- Resolves whatever open takedown or report brought the photo here, so a
-- moderator does not have to close three things by hand for one decision.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.remove_photo(p_photo uuid, p_reason text) returns public.photos
language plpgsql security definer set search_path = '' as $$
declare
  actor public.members := public.assert_active_member();
  row   public.photos;
begin
  if actor.org_role not in ('admin', 'moderator') then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '23514';
  end if;

  select * into row from public.photos where id = p_photo and org_id = actor.org_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if row.removed_at is not null then
    return row;                                         -- idempotent no-op
  end if;

  update public.photos
     set removed_at = now(), removed_by = actor.id, removal_reason = btrim(p_reason),
         hidden_at = coalesce(hidden_at, now()), hidden_reason = coalesce(hidden_reason, btrim(p_reason))
   where id = p_photo
   returning * into row;

  update public.photo_takedowns
     set resolved_at = now(), resolution = 'removed', resolved_by = actor.id
   where photo_id = p_photo and resolved_at is null;

  update public.reports
     set status = 'resolved', resolution = 'removed', resolved_by = actor.id, resolved_at = now()
   where target = 'photo' and photo_id = p_photo and status = 'open';

  return row;
end $$;
revoke execute on function public.remove_photo from public, anon;
grant  execute on function public.remove_photo to authenticated;

-- `photos_audit_staff_actions` (`0051`) already fires on this same
-- `removed_at` transition; extended in place (`create or replace`, the
-- DEC-047 pattern for hooking into an earlier wave's function) to pass the
-- new `removal_reason` through. The `restored` branch is untouched byte
-- for byte, and no new audit branch is added for `hidden_at` alone — that
-- would also fire on every ordinary takedown request (`photo_takedowns_
-- hide()`, unrelated to this track), which is not this migration's to
-- change and not something to risk against content's own existing tests.
create or replace function public.photos_audit_staff_actions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.hidden_at is not null and new.hidden_at is null then
    perform public.write_audit(new.org_id, 'photo.restored', 'photo', new.id, jsonb_build_object('hidden_reason', old.hidden_reason), null);
  end if;
  if old.removed_at is null and new.removed_at is not null then
    perform public.write_audit(new.org_id, 'photo.removed', 'photo', new.id, null, jsonb_build_object('removed_by', new.removed_by), new.removal_reason);
  end if;
  return new;
end $$;

-- Photo point reversal (`REQ-PTS-013`) — `_reverse_comment_points()`
-- (`0032`) applied to `photos`, the "same shape" its own header deferred.
create function public._reverse_photo_points() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  original public.points_ledger;
  key      text;
begin
  if new.removed_at is not null and old.removed_at is null then
    select * into original from public.points_ledger
     where source = 'photo' and source_id = new.id
     limit 1;
    if found then
      key := 'reversal:' || original.id || ':v1';
      insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id,
                                        reason, rule_key, idempotency_key)
      values (original.org_id, original.member_id, -original.amount, 'reversal', original.id,
              original.session_id, 'حُذف المحتوى', 'photo', key)
      on conflict (idempotency_key) do nothing;
    end if;

    perform public.award_points('photo_removed', new.uploader_id, 'content_removed', new.id, new.session_id);
  end if;
  return new;
end $$;
create trigger photos_reverse_points after update on public.photos
  for each row execute function public._reverse_photo_points();

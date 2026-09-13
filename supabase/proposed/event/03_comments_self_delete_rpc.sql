-- supabase/proposed/event/03_comments_self_delete_rpc.sql
-- REQ-EVT-005: "Delete own comment at any time" — as opposed to the 15-minute
-- EDIT window. Migration 0010's only self-service update path,
-- `comments_update_own`, gates every update it allows (both a body edit AND
-- a soft-delete) behind the SAME `created_at > now() - comment_edit_window`
-- clause, because a soft-delete is just another UPDATE on the same table.
-- Confirmed against the live policy text (pg_policy.polqual) rather than
-- assumed: an author's own comment older than the org's edit window cannot
-- be self-deleted at all today — only a moderator/admin (via p6_staff_update,
-- which carries no time gate) can remove it. That is a real requirement gap,
-- not a hypothetical.
--
-- Splitting the existing policy in two was considered and rejected: Postgres
-- combines multiple permissive UPDATE policies with OR at both the USING and
-- WITH CHECK stage, and a WITH CHECK cannot see the pre-update row to tell
-- "this update only touches deleted_at" from "this update touches body" —
-- that distinction needs OLD, which only a trigger has. Loosening the time
-- gate at the trigger level would also let a body edit through the same
-- widened door after the window, which is a different requirement
-- (REQ-EVT-005's 15-minute edit limit) that this file must not weaken, and
-- tests/rls/m2-schema.test.ts (outside this teammate's globs) already pins
-- the current "edit after 16 minutes → silently 0 rows" behaviour.
--
-- So: one small, additive, SECURITY DEFINER RPC that does exactly one thing
-- — set deleted_at/deleted_by on the caller's own, not-yet-deleted comment,
-- with no time check — and nothing else. src/lib/dal/comments.ts calls this
-- for a member's own delete; a moderator/admin's removal still goes through
-- the existing p6_staff_update policy directly, unchanged.
--
-- Serves: REQ-EVT-005
-- 03 §8.2 row this proves (tests/rls/event-comments.test.ts):
--   POL-comments.delete.self_anytime — an author deletes their own comment
--   past the edit window; cannot delete another member's; a second call is
--   a no-op, not an error.

create function public.delete_own_comment(p_comment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_author    uuid;
  v_org       uuid;
  v_deleted   timestamptz;
begin
  select c.author_id, c.org_id, c.deleted_at into v_author, v_org, v_deleted
    from public.comments c where c.id = p_comment;

  if v_author is null or v_org is distinct from public.auth_org_id() then
    raise exception 'not_found' using errcode = '42501';
  end if;
  if v_author <> public.auth_member_id() then
    raise exception 'not_author' using errcode = '42501';
  end if;
  if v_deleted is not null then
    return; -- already deleted: idempotent no-op, not an error
  end if;

  update public.comments
     set deleted_at = now(), deleted_by = public.auth_member_id()
   where id = p_comment;
end $$;

revoke execute on function public.delete_own_comment from public, anon;
grant  execute on function public.delete_own_comment to authenticated;

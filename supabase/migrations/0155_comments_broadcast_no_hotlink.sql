-- 0155 — the discussion's realtime payload stops carrying Google's image URL.
--
-- REQ-PRF-008 · DEC-099 · DEC-180. `DEC-099` (2026-09-15) retired the Google
-- hotlink: a browser fetching `lh3.googleusercontent.com` discloses its viewer's
-- IP and `Referer` to Google on every render. It named `0089` as the migration
-- that would do it; `0089` became wave 7's check-in window, and nothing did.
-- `comments_broadcast()` (0016) put `members.avatar_url` — the Google source
-- `provision_member()` writes on every sign-in (0005:124) — on the wire for
-- every comment, and `comment-item.tsx` drew it.
--
-- The key stays, as null, so `main`'s client (which reads `authorAvatarUrl`)
-- renders initials rather than breaking in the push-to-merge gap. Our stored
-- copy of the picture arrives with wave 14's avatar work through one resolver
-- (contract 4), not through this payload.
--
-- `create or replace` with the same signature, owner, `security definer` and
-- `search_path` as 0016 — its execute grant and its trigger are unchanged.
-- Test: tests/rls/comments-no-hotlink.test.ts (red on 0154, green here).

create or replace function public.comments_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row     record := coalesce(new, old);
  v_author  record;
begin
  select m.display_name into v_author from public.members m where m.id = v_row.author_id;
  perform realtime.send(
    jsonb_build_object(
      'id', v_row.id,
      'sessionId', v_row.session_id,
      'parentId', v_row.parent_id,
      'authorId', v_row.author_id,
      'authorDisplayName', v_author.display_name,
      'authorAvatarUrl', null,
      'body', v_row.body,
      'mentions', to_jsonb(v_row.mentions),
      'createdAt', v_row.created_at,
      'editedAt', v_row.edited_at,
      'deletedAt', v_row.deleted_at
    ),
    tg_op,
    'session:' || v_row.session_id::text
  );
  return v_row;
end $$;

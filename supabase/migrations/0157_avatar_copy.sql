-- 0157 · wave 14 (DEC-099, DEC-180, DEC-181, DEC-182) — the schema under our
-- stored copy of a member's Google photo. Never a hotlink.
--
-- `DEC-099` (the owner, 2026-09-15; kept when asked again on 2026-09-27):
-- Google's photo is offered once, «نستخدم صورتك من Google؟», and on yes it is
-- COPIED into the platform's storage. Here are the columns, the bucket and the
-- read policy `platform`'s plan named (W14.1). The behaviour — `set_avatar_import()`,
-- `my_avatar()`, the job's service_role functions, the source-changed trigger,
-- anonymisation — is `platform`'s, promoted from `proposed/platform/` from 0158.
--
--   members.avatar_import   null = not answered (the prompt shows). In NO client
--                           grant: read through `my_avatar()`, written through
--                           `set_avatar_import()`.
--   members.avatar_version  epoch-ms of our copy; null = initials. Non-null
--                           implies accepted and both objects stored; the writers
--                           hold that. It never repeats, so a cached URL is never
--                           reused for a different picture.
--   bucket `avatars`        private, WebP only, 256 KB. Path (the one builder,
--                           packages/storage-paths/src/avatar.ts):
--                           {org_id}/members/{member_id}/{version}/{96|192}.webp.
--                           No original is kept.
--   avatars_storage_read    same org, and ONLY the current version: clearing
--                           `avatar_version` (a decline, anonymisation) makes the
--                           object unreadable in the same statement, before the
--                           job deletes it («removal is immediate», REQ-PRF-008).
--                           No write policy: only the worker writes (invariant 7).
--
-- Additive for `main`, which runs this schema before it runs the code:
-- `avatar_version` is APPENDED to the column grant, LAST in `members_member_view`
-- (a trailing column is what `create or replace view` allows), and as one more
-- key in `me()`. `main` selects named columns and ignores an unknown key.
-- `comments_broadcast()` (0155, the lead's) gains `authorAvatarVersion`;
-- `authorAvatarUrl` stays null.
--
-- ★ Kept on purpose: 0004:243's `^https://` check on `members.avatar_url`.
-- `DEC-099` said it would be superseded; it is not. The source is
-- member-controllable through `auth.updateUser` → `provision_member()`, so the
-- check and the job's host allowlist are the SSRF control (DEC-182). Also kept,
-- until after the merge (`main` selects them): `avatar_url` in the grant, the view
-- and `me()`.
--
-- Serves:  REQ-PRF-008 (the import half), REQ-PRF-009, REQ-PRF-011, REQ-NFR-014
--
-- 03 §8.2 rows this adds (tests/rls/avatar-copy.test.ts):
--   | `POL-avatars_storage_read.same_org` | a member of the org reads the current version ✓ |
--   | `POL-avatars_storage_read.other_org_refused` | another org's member ✗ |
--   | `POL-avatars_storage_read.stale_version_refused` | an older version's object ✗ |
--   | `POL-avatars_storage_read.cleared_refused` | version cleared (declined, anonymised) → ✗ at once |
--   | `COL-members.avatar_import.no_grant` | a client select of avatar_import is refused (42501) |

create type public.avatar_import_answer as enum ('accepted', 'declined');

alter table public.members
  add column avatar_import  public.avatar_import_answer,
  add column avatar_version bigint check (avatar_version is null or avatar_version > 0);

comment on column public.members.avatar_import is
  'DEC-099/DEC-180: the answer to «نستخدم صورتك من Google؟»; null = unanswered. No client grant.';
comment on column public.members.avatar_version is
  'DEC-099/DEC-180: epoch-ms of our stored copy; null = initials. Never a URL.';

grant select (avatar_version) on public.members to authenticated;

create or replace view public.members_member_view
with (security_invoker = true) as
  select id, org_id, display_name, avatar_url, company_id, job_title, bio, org_role, created_at, avatar_version
    from public.members
   where status = 'active';

create or replace function public.me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id, 'org_id', m.org_id, 'email', m.email, 'display_name', m.display_name,
    'avatar_url', m.avatar_url, 'company_id', m.company_id, 'job_title', m.job_title,
    'bio', m.bio, 'org_role', m.org_role, 'status', m.status,
    'leaderboard_opt_out', m.leaderboard_opt_out, 'created_at', m.created_at,
    'avatar_version', m.avatar_version
  )
  from public.members m
  where m.auth_user_id = auth.uid()
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', false, 262144, array['image/webp']);

create policy "avatars_storage_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and (storage.foldername(name))[2] = 'members'
    and exists (
      select 1 from public.members m
       where m.id::text = (storage.foldername(name))[3]
         and m.org_id = public.auth_org_id()
         and m.avatar_version::text = (storage.foldername(name))[4]
    )
  );

create or replace function public.comments_broadcast() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_row     record := coalesce(new, old);
  v_author  record;
begin
  select m.display_name, m.avatar_version into v_author from public.members m where m.id = v_row.author_id;
  perform realtime.send(
    jsonb_build_object(
      'id', v_row.id,
      'sessionId', v_row.session_id,
      'parentId', v_row.parent_id,
      'authorId', v_row.author_id,
      'authorDisplayName', v_author.display_name,
      'authorAvatarUrl', null,
      'authorAvatarVersion', v_author.avatar_version,
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

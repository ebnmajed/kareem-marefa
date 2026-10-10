-- 0222 · the lead's — wave 29, PR B (DEC-280 §2 – §4, §8; DEC-281; REQ-PRF-017 … REQ-PRF-019). The upload's schema.
--
-- `platform`'s plan named what it needs (docs/plan/notes/platform.md, W29.1); this file writes the tables, the bucket
-- and the policy, and NO function — `platform`'s definer functions follow as their own migration, proven against this.
--
-- ★ `avatar_uploads` — one row per member: which staged file is current (a second upload replaces the first), a
--   refusal the sheet can read, and a pending upload a pick or a removal can cancel. No bytes, no URL, no name.
--   RLS ON, NO POLICY AND NO GRANT — read and written only through definer functions: the survey register's
--   documented shape (invariant 5, `03` §5.6f), the eighth such table (DEC-281).
-- ★ `avatar-staging` — private; 1 MiB; JPEG and PNG by declared type only (the worker sniffs on content after the
--   bytes land, REQ-PRF-017). A member may INSERT under their own org and member prefix and do nothing else — no read
--   back, no delete: the worker reads and deletes. Path (the one builder, packages/storage-paths/src/avatar.ts):
--   {org}/members/{member}/{upload_id}.
-- ★ ADDITIVE: `main`'s app and worker on this schema do nothing different — nothing reads either.
--
-- 03 §8.2 rows (tests/rls/avatar-upload.test.ts):
--   | `POL-avatar_staging_insert.own_prefix` | a member writes under {own org}/members/{self}/ ✓ |
--   | `POL-avatar_staging_insert.other_member_refused` · `.other_org_refused` | another prefix ✗ |
--   | `POL-avatar_staging.no_read_back` · `.no_delete` | a member's select or delete of a staged object, their own included ✗ |
--   | `TBL-avatar_uploads.no_client_access` | select, insert, update by `authenticated` → 42501 |

create type public.avatar_upload_state as enum ('pending', 'done', 'refused', 'failed', 'cancelled');

create table public.avatar_uploads (
  member_id  uuid primary key references public.members (id) on delete cascade,
  org_id     uuid not null references public.orgs (id) on delete cascade,
  upload_id  uuid not null,
  state      public.avatar_upload_state not null,
  updated_at timestamptz not null default now()
);
comment on table public.avatar_uploads is
  'DEC-280/281: the member''s current avatar upload — which staged file, and its outcome. No policy and no grant: definer functions only.';
create index avatar_uploads_org_idx on public.avatar_uploads (org_id);

alter table public.avatar_uploads enable row level security;
revoke all on public.avatar_uploads from public, anon, authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatar-staging', 'avatar-staging', false, 1048576, array['image/jpeg', 'image/png']);

create policy "avatar_staging_insert" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatar-staging'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and (storage.foldername(name))[2] = 'members'
    and (storage.foldername(name))[3] = public.auth_member_id()::text
  );

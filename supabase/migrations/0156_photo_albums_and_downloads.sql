-- 0156 · wave 14 (DEC-180, DEC-181, DEC-182) — photographs are downloaded
-- through an audit, the album is built by a job, and a removed photograph stops
-- being readable.
--
-- Four things, all additive:
--
-- 1. ★ `photos_storage_read` (0037:646) admitted a REMOVED photograph to any
--    member of its org: it checked `hidden_at` and never `removed_at`, so an
--    object an admin had taken down stayed signable by anyone holding its path.
--    Found by `content`'s wave-14 plan (item 7). The policy gains
--    `and p.removed_at is null` — nothing else in it changes.
--
-- 2. `photo_albums` — one row per session, the album's state read the same
--    after a reload (`REQ-ADM-021`: «notifies when it is ready»; a notification
--    is not a state). `content`'s plan, P4. The definers below and `content`'s
--    service_role functions (`proposed/content/`, from 0158) are its only
--    writers; the one client policy lets staff read their org's rows.
--
-- 3. The private bucket `photo-albums` and its read policy: staff of the org,
--    and only the CURRENT, READY, UNEXPIRED build (segment 5 of the path is the
--    album's `build_id`), so a stale, superseded or expired zip is unreadable to
--    every client role with its path in hand. Only the worker writes.
--    Path: {org_id}/sessions/{session_id}/albums/{build_id}/part-{n}.zip.
--
-- 4. Contract 1's three audit definers, on 0152's shape — the app cannot write
--    `audit_log` (append-only, invariant 9) and `write_audit()` is service_role's
--    (0005). Each re-derives the caller's right from the rows, raises
--    `42501 not_authorized` before any write for every refusal (no existence
--    oracle), and names the actor, the session and what was taken
--    (`REQ-ADM-021`). Audit actions are `DEC-180`'s: `photo.downloaded`,
--    `photo_album.requested`, `photo_album.downloaded`.
--
--    record_photo_download(photo)       → anyone in the org, only while the
--                                         photo is neither hidden nor removed —
--                                         ★ staff too (DEC-182 Q3): a hidden
--                                         photo is one someone asked to be
--                                         removed from (REQ-EVT-012)
--    request_photo_album(session)       → is_staff(); zero visible photos is
--                                         `album_empty` (P0002); upserts the row
--                                         with a new build_id, audits, enqueues
--                                         JOB-zip_session_photos (11 §2.4:
--                                         key zipphotos:{session}, queue convert,
--                                         3 attempts) and returns at once
--    record_photo_album_download(s, n)  → is_staff(); the album ready, unexpired,
--                                         and part n in range
--
-- File names are ASCII with Western digits (DEC-095, 0152's precedent; DEC-182
-- Q6), dated by the session's start in the session's own zone.
--
-- Serves:  REQ-ADM-021, REQ-EVT-011, REQ-EVT-012, REQ-EVT-016
-- Cites:   0005 (write_audit), 0025 (enqueue_job), 0037 (photos), 0152 (the pattern)
--
-- 03 §8.2 rows this adds (tests/rls/photo-downloads.test.ts):
--   | `POL-photos_storage_read.removed` | a removed photo's object: member ✗ · staff ✗ |
--   | `POL-photo_albums_read_staff` | admin ✓ · moderator ✓ · member ✗ · another org's admin ✗ |
--   | `POL-photo_albums_storage_read` | staff, ready + current build ✓ · member ✗ · stale ✗ · superseded build ✗ · expired ✗ |
--   | `RPC-record_photo_download` | member ✓ · staff ✓ · hidden ✗ (staff too) · removed ✗ · another org ✗ · one audit row per admitted call |
--   | `RPC-request_photo_album` | admin ✓ · moderator ✓ · member ✗ · presenter ✗ · no visible photos → P0002 · enqueues one job · audits |
--   | `RPC-record_photo_album_download` | staff, ready ✓ · member ✗ · queued/building/failed/stale ✗ · expired ✗ · part out of range ✗ |

-- ─── 1 · a removed photograph is no longer readable ─────────────────────────

alter policy "photos_storage_read" on storage.objects
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and exists (
      select 1 from public.photos p
       where p.id = nullif(regexp_replace(storage.filename(name), '\.[a-zA-Z0-9]+$', ''), '')::uuid
         and p.removed_at is null
         and (p.hidden_at is null or public.is_staff())
    )
  );

-- ─── 2 · the album's state ───────────────────────────────────────────────────

create type public.photo_album_status as enum ('queued', 'building', 'ready', 'failed', 'stale');

create table public.photo_albums (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  session_id    uuid not null unique references public.sessions(id) on delete cascade,
  build_id      uuid not null default gen_random_uuid(),
  status        public.photo_album_status not null default 'queued',
  requested_by  uuid not null references public.members(id),
  requested_at  timestamptz not null default now(),
  built_at      timestamptz,
  expires_at    timestamptz,
  photo_count   int check (photo_count >= 0),
  byte_size     bigint check (byte_size > 0),
  parts         jsonb not null default '[]'::jsonb check (jsonb_typeof(parts) = 'array'),
  error         text,
  check (status <> 'ready' or (built_at is not null and expires_at is not null and jsonb_array_length(parts) > 0))
);
create index photo_albums_org_idx on public.photo_albums (org_id);

alter table public.photo_albums enable row level security;
revoke all on public.photo_albums from anon, authenticated, service_role;

create policy "photo_albums_read_staff" on public.photo_albums for select to authenticated
  using (org_id = public.auth_org_id() and public.is_staff());
grant select on public.photo_albums to authenticated;

comment on table public.photo_albums is
  'REQ-ADM-021 (DEC-180, DEC-182): one album per session, built by JOB-zip_session_photos. Written only by definers.';

-- ─── 3 · the bucket and its read policy ─────────────────────────────────────

insert into storage.buckets (id, name, public, allowed_mime_types)
values ('photo-albums', 'photo-albums', false, array['application/zip']);

create policy "photo_albums_storage_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'photo-albums'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and public.is_staff()
    and exists (
      select 1 from public.photo_albums a
       where a.org_id = public.auth_org_id()
         and a.session_id::text = (storage.foldername(name))[3]
         and a.build_id::text   = (storage.foldername(name))[5]
         and a.status = 'ready'
         and a.expires_at > now()
    )
  );

-- ─── 4 · the three audit definers ───────────────────────────────────────────

-- The session's start date in its own zone, for a file name.
create function public.photo_file_date(p_session uuid) returns text
language sql stable security definer set search_path = '' as $$
  select coalesce(to_char(s.starts_at at time zone coalesce(s.time_zone, 'Asia/Riyadh'), 'YYYYMMDD'), 'undated')
    from public.sessions s where s.id = p_session
$$;
revoke all on function public.photo_file_date(uuid) from public, anon, authenticated;

create function public.record_photo_download(p_photo uuid)
returns table (storage_path text, file_name text)
language plpgsql security definer set search_path = '' as $$
declare
  v_org     uuid;
  v_session uuid;
  v_day     uuid;
  v_path    text;
  v_ext     text;
begin
  select p.org_id, p.session_id, p.session_day_id, p.storage_path
    into v_org, v_session, v_day, v_path
    from public.photos p
   where p.id = p_photo
     and p.org_id = public.auth_org_id()
     and p.hidden_at is null
     and p.removed_at is null;

  if not found or v_path is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_ext := coalesce(nullif(lower(substring(v_path from '\.([a-zA-Z0-9]+)$')), ''), 'jpg');

  perform public.write_audit(
    v_org, 'photo.downloaded', 'photo', p_photo,
    null,
    jsonb_strip_nulls(jsonb_build_object('session_id', v_session, 'session_day_id', v_day)),
    null, null, public.auth_member_id()
  );

  return query select v_path,
    'photo-' || public.photo_file_date(v_session) || '-' || left(replace(p_photo::text, '-', ''), 8) || '.' || v_ext;
end $$;

revoke all on function public.record_photo_download(uuid) from public, anon;
grant execute on function public.record_photo_download(uuid) to authenticated;

create function public.request_photo_album(p_session uuid)
returns table (album_id uuid, build_id uuid)
language plpgsql security definer set search_path = '' as $$
declare
  v_org     uuid := public.auth_org_id();
  v_visible int;
  v_album   uuid;
  v_build   uuid := gen_random_uuid();
begin
  if not public.is_staff()
     or not exists (select 1 from public.sessions s where s.id = p_session and s.org_id = v_org) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select count(*) into v_visible
    from public.photos p
   where p.session_id = p_session and p.org_id = v_org
     and p.hidden_at is null and p.removed_at is null;

  if v_visible = 0 then
    raise exception 'album_empty' using errcode = 'P0002';
  end if;

  insert into public.photo_albums as a (org_id, session_id, build_id, status, requested_by, requested_at)
  values (v_org, p_session, v_build, 'queued', public.auth_member_id(), now())
  on conflict (session_id) do update
     set build_id     = excluded.build_id,
         status       = 'queued',
         requested_by = excluded.requested_by,
         requested_at = excluded.requested_at,
         built_at     = null,
         expires_at   = null,
         photo_count  = null,
         byte_size    = null,
         parts        = '[]'::jsonb,
         error        = null
  returning a.id into v_album;

  perform public.write_audit(
    v_org, 'photo_album.requested', 'photo_album', v_album,
    null,
    jsonb_build_object('session_id', p_session, 'build_id', v_build, 'visible_count', v_visible),
    null, null, public.auth_member_id()
  );

  perform public.enqueue_job(
    'zip_session_photos',
    jsonb_build_object('album_id', v_album, 'build_id', v_build, 'session_id', p_session, 'org_id', v_org),
    'zipphotos:' || p_session::text, null, 'convert', 3
  );

  return query select v_album, v_build;
end $$;

revoke all on function public.request_photo_album(uuid) from public, anon;
grant execute on function public.request_photo_album(uuid) to authenticated;

create function public.record_photo_album_download(p_session uuid, p_part int default 1)
returns table (storage_path text, file_name text)
language plpgsql security definer set search_path = '' as $$
declare
  v_org   uuid := public.auth_org_id();
  a       public.photo_albums%rowtype;
  v_parts int;
  v_path  text;
  v_name  text;
begin
  if not public.is_staff() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select * into a from public.photo_albums
   where session_id = p_session and org_id = v_org;

  if not found or a.status <> 'ready' or a.expires_at <= now() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_parts := jsonb_array_length(a.parts);
  if p_part is null or p_part < 1 or p_part > v_parts then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_path := a.parts -> (p_part - 1) ->> 'path';
  if v_path is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  v_name := 'photos-' || public.photo_file_date(p_session)
         || case when v_parts > 1 then '-part-' || p_part || '-of-' || v_parts else '' end
         || '.zip';

  perform public.write_audit(
    v_org, 'photo_album.downloaded', 'photo_album', a.id,
    null,
    jsonb_build_object('session_id', p_session, 'build_id', a.build_id, 'part', p_part,
                       'parts', v_parts, 'photo_count', a.photo_count),
    null, null, public.auth_member_id()
  );

  return query select v_path, v_name;
end $$;

revoke all on function public.record_photo_album_download(uuid, int) from public, anon;
grant execute on function public.record_photo_album_download(uuid, int) to authenticated;

-- 0159 · promoted by the lead from supabase/proposed/content/0158_photo_album_build.sql (910388c) — renumbered: platform's SQL took 0158.
-- proposed by `content` (wave 14, DEC-180, DEC-182) — the album's build, on the
-- lead's 0156 (`photo_albums`, the `photo-albums` bucket, the three audit
-- definers). The lead numbers and promotes it, from 0158.
--
-- JOB-zip_session_photos (11 §2.4) is the only caller of the three functions
-- below; the trigger is the one piece of this file that runs on anyone else's
-- path — a member's takedown — and it is written for that.
--
-- ★ THE VISIBLE SET IS READ FROM ROWS, NEVER FROM THE BUCKET. The browser's raw
-- upload sits at a photo's path until `process_photo` strips it, with no row
-- (0050), so «the stripped objects are the only ones that exist» (11 §2.4) is
-- true of rows and false of the bucket. `begin_photo_album_build()` hands the job
-- the rows; the job checks each object's SHA-256 against the row it came from.
--
-- ★ A HIDE ALWAYS REACHES THE ZIP (REQ-EVT-012). Two paths, and every
-- interleaving of them ends with the photograph out of any readable album:
--   · during a build: `record_photo_album_built()` takes the album row's lock
--     FIRST, then re-checks every photograph it was handed — one hidden since
--     `begin` returns 'stale', the row stays `building`, and the job's retry
--     rebuilds without it;
--   · after a build: `photo_albums_stale` marks the ready album `stale`, and
--     0156's definer and bucket policy both refuse anything not `ready`.
-- The trigger's own update waits on the same row lock, so a hide that commits
-- while a build is being recorded lands after it and marks it stale.
--
-- Serves:  REQ-ADM-021, REQ-EVT-011, REQ-EVT-012
-- Cites:   0156 (photo_albums, request_photo_album — which writes build_id and
--          enqueues the job), 0025 (enqueue_job), 0026 (notify), 0037
--          (photo_takedowns_hide — the member's path into the trigger), 0059
--          (remove_photo — the staff path)
--
-- 03 §8.2 rows this adds (tests/rls/photos-album-build.test.ts):
--   | `RPC-begin_photo_album_build` | service_role only · returns the visible set, never a hidden or removed photograph · a superseded build gets no rows |
--   | `RPC-record_photo_album_built` | ready + notify + the expiry enqueued · 'stale' when a photograph was hidden mid-build, the row still building · 'superseded' for a replaced build · a part outside its build's prefix refused |
--   | `RPC-fail_photo_album` | the current build only, failed with its error |
--   | `TRG-photo_albums_stale` | a member's takedown, a staff removal and a delete each make a ready album stale; the takedown still succeeds |

-- ── begin: the visible set, as the job will zip it ──────────────────────────
create function public.begin_photo_album_build(p_build uuid)
returns table (photo_id uuid, storage_path text, byte_size bigint, sha256 text)
language plpgsql security definer set search_path = '' as $$
declare
  a public.photo_albums%rowtype;
begin
  select * into a from public.photo_albums where build_id = p_build for update;
  -- A newer request replaced this build (0156 writes a new build_id), or it
  -- already finished: the job has nothing to do.
  if not found or a.status not in ('queued', 'building') then
    return;
  end if;

  update public.photo_albums set status = 'building' where id = a.id;

  -- `(created_at, id)` orders the entries' NAMES in the zip — never a «last
  -- row» read, so rows written together cannot collide.
  return query
    select p.id, p.storage_path, p.byte_size, p.sha256
      from public.photos p
     where p.session_id = a.session_id
       and p.org_id = a.org_id
       and p.hidden_at is null
       and p.removed_at is null
     order by p.created_at, p.id;
end $$;
revoke all on function public.begin_photo_album_build(uuid) from public, anon, authenticated;
grant execute on function public.begin_photo_album_build(uuid) to service_role;

-- ── built: ready, or the reason it is not ────────────────────────────────────
create function public.record_photo_album_built(p_build uuid, p_parts jsonb, p_photo_ids uuid[])
returns text
language plpgsql security definer set search_path = '' as $$
declare
  a        public.photo_albums%rowtype;
  v_prefix text;
  v_count  int := coalesce(cardinality(p_photo_ids), 0);
  v_bytes  bigint;
  v_parts  int;
  v_expire timestamptz;
begin
  -- The lock comes FIRST: see the header.
  select * into a from public.photo_albums where build_id = p_build for update;
  if not found or a.status not in ('queued', 'building') then
    return 'superseded';
  end if;

  if exists (
    select 1 from unnest(p_photo_ids) as x(id)
     where not exists (
       select 1 from public.photos p
        where p.id = x.id and p.session_id = a.session_id
          and p.hidden_at is null and p.removed_at is null))
  then
    return 'stale';
  end if;

  -- Every part must lie under THIS build's prefix — the one the bucket's read
  -- policy (0156) admits — so a path the definer later hands out is one the
  -- policy agrees with. packages/storage-paths' photoAlbumPartPath() builds it.
  v_prefix := a.org_id::text || '/sessions/' || a.session_id::text || '/albums/' || p_build::text || '/';
  if p_parts is null or jsonb_typeof(p_parts) <> 'array' or jsonb_array_length(p_parts) = 0
     or exists (
       select 1 from jsonb_array_elements(p_parts) e
        where jsonb_typeof(e) <> 'object'
           or left(coalesce(e ->> 'path', ''), length(v_prefix)) <> v_prefix
           or coalesce((e ->> 'byteSize')::bigint, 0) <= 0)
  then
    raise exception 'invalid_parts' using errcode = '22023';
  end if;

  v_parts := jsonb_array_length(p_parts);
  select sum((e ->> 'byteSize')::bigint) into v_bytes from jsonb_array_elements(p_parts) e;

  update public.photo_albums
     set status      = 'ready',
         built_at    = now(),
         expires_at  = now() + interval '7 days',
         photo_count = v_count,
         byte_size   = v_bytes,
         parts       = p_parts,
         error       = null
   where id = a.id
   returning expires_at into v_expire;

  -- «Ready» is said once, in the inbox (DEC-182, Q8: in-app only); the slot
  -- says it on every render until it expires.
  perform public.notify(
    a.org_id, a.requested_by, 'admin_queue',
    jsonb_build_object('session_id', a.session_id, 'photo_count', v_count, 'parts', v_parts),
    'MSG-photo_album_ready'
  );

  -- The job's own `expire` mode deletes this build's objects when it lapses
  -- (DEC-182, Q7). A rebuild moves it under the same key.
  perform public.enqueue_job(
    'zip_session_photos',
    jsonb_build_object('mode', 'expire', 'album_id', a.id, 'build_id', p_build, 'session_id', a.session_id, 'org_id', a.org_id),
    'zipphotos-expire:' || a.session_id::text, v_expire, 'convert', 3
  );

  return 'ready';
end $$;
revoke all on function public.record_photo_album_built(uuid, jsonb, uuid[]) from public, anon, authenticated;
grant execute on function public.record_photo_album_built(uuid, jsonb, uuid[]) to service_role;

-- ── failed: on the job's LAST attempt only ───────────────────────────────────
create function public.fail_photo_album(p_build uuid, p_error text)
returns void
language sql security definer set search_path = '' as $$
  update public.photo_albums
     set status = 'failed', error = left(coalesce(p_error, 'unknown'), 500)
   where build_id = p_build and status in ('queued', 'building');
$$;
revoke all on function public.fail_photo_album(uuid, text) from public, anon, authenticated;
grant execute on function public.fail_photo_album(uuid, text) to service_role;

-- ── stale: a photograph leaves the visible set after the zip was built ───────
-- SECURITY DEFINER because a member reaches it through `photo_takedowns_hide()`
-- and no client role may write `photo_albums`. ★ IT NEVER RAISES: it sits on
-- REQ-EVT-012's «instant» hide, and a failure here must not undo the hide. A
-- failure would leave one ready album still holding the photograph, so it
-- warns, naming the session, rather than failing silently.
create function public.photo_albums_stale() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_session uuid;
begin
  v_session := case when tg_op = 'DELETE' then old.session_id else new.session_id end;
  begin
    update public.photo_albums set status = 'stale'
     where session_id = v_session and status = 'ready';
  exception when others then
    raise warning 'photo_albums_stale: session % — % (%)', v_session, sqlerrm, sqlstate;
  end;
  return null;
end $$;
revoke all on function public.photo_albums_stale() from public, anon, authenticated;

create trigger photo_albums_stale_on_hide
  after update of hidden_at, removed_at on public.photos
  for each row
  when ((old.hidden_at is null and new.hidden_at is not null) or (old.removed_at is null and new.removed_at is not null))
  execute function public.photo_albums_stale();

create trigger photo_albums_stale_on_delete
  after delete on public.photos
  for each row execute function public.photo_albums_stale();

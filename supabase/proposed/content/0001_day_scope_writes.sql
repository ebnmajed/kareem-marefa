-- content, wave 9 (DEC-119, DEC-120, DEC-121, DEC-150) — T1: the write paths and the re-scope
-- door for the three content types. Tables are the lead's (0100/0101 already added the nullable
-- `session_day_id` columns, their composite FKs and `on delete set null`); this file is
-- behaviour only — functions, and the grants that follow them.
--
-- `initiateMaterialUpload`/`createTask` are PLAIN CLIENT INSERTS today (p8_presenter_write is the
-- entire authority on both tables) — sending an optional `session_day_id` alongside everything
-- else they already send needs no SQL change at all; the composite FK (0100) is what refuses a
-- day that is not this row's own session's (23503). Nothing in this file touches that path.
--
-- RE-SCOPE IS A DOOR, NOT A WIDER GRANT. DEC-121 names "staff (admin OR moderator) and the
-- presenter" for materials/tasks and "staff alone" for photos — wider, in the materials/tasks
-- case, than the existing `materials_update_admin`/`session_tasks_update_presenter` policies
-- (admin-only), which already grant direct column-level write on `title`/`phase`/`allow_download`/
-- etc. Adding `session_day_id` to those column grants would hand a moderator write on those other
-- columns too, which nothing asked for — so each type gets its own SECURITY DEFINER door that
-- re-derives exactly the authority DEC-121 names and touches nothing else.
--
-- Serves:  REQ-SES-018, REQ-MAT-006 (the rescope half), REQ-TSK-001…005, REQ-EVT-009…011
-- Cites:   0100/0101 (session_days, the composite FKs, resolve_session_day/check_in_ceiling —
--          neither reused here, see the header above record_photo_upload below), 0037 (materials,
--          session_tasks, photos, their existing policies and column grants), 0050
--          (initiate_photo_processing, record_photo_upload), 0052 (materials_audit_phase_change —
--          the precedent for auditing a visibility-moving change)
-- Docs:    docs/plan/notes/content.md, "Wave 9 plan"; DEC-151 (sync 1: audit a material's rescope,
--          drop-then-create record_photo_upload, the nearest-edge photo fallback)
--
-- 03 §8.2 rows this adds:
--   | `RPC-rescope_material.authority` | Staff, or the session's own presenter, may move a material between the session and one of its own days; anyone else is refused `42501`. A proposal's own material (no session) is refused `not_found`. |
--   | `RPC-rescope_material.day_of_own_session` | A day naming another session is refused `day_not_of_session` (`23503`) before the update is attempted. |
--   | `RPC-rescope_material.audited` | Every successful call writes one `material.rescoped` audit row naming the old and new `session_day_id` — REQ-MAT-006's visibility fix (0052 already audits a phase change for the same reason). |
--   | `RPC-rescope_task.authority` | Staff, or the session's own presenter, may move a task; anyone else is refused `42501`. No audit row — REQ-TSK-002 makes a task's scope carry no visibility rule for one to protect. |
--   | `RPC-rescope_photo.authority` | Staff alone may move a photo; a presenter who is not staff is refused `42501` — a photo has no presenter-write concept (`photos_insert_checked_in`, 03 §5.6c). No audit row. |
--   | `RPC-record_photo_upload.day_from_upload_moment` | With more than one day, the photo is scoped to the day whose window contains `p_uploaded_at`, falling back to the day whose nearer edge (start or end) is closest to it. With at most one day, `session_day_id` stays null (DEC-121: a one-day session's content is session-scoped, which is what makes "adding a second day re-scopes nothing" true). |
--   | `RPC-initiate_photo_processing.enqueues_uploaded_at` | The enqueued `process_photo` payload carries `uploaded_at`, the instant of THIS call — not the worker's own, later clock. |

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · re-scope — materials
-- ═══════════════════════════════════════════════════════════════════════════
create function public.rescope_material(p_material_id uuid, p_day_id uuid default null) returns public.materials
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id     uuid;
  v_session_id uuid;
  v_old_day    uuid;
  v_row        public.materials;
begin
  select m.org_id, m.session_id, m.session_day_id into v_org_id, v_session_id, v_old_day
    from public.materials m where m.id = p_material_id and m.removed_at is null;
  if v_org_id is null or v_org_id is distinct from public.auth_org_id() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if v_session_id is null then
    raise exception 'not_found' using errcode = 'P0002';   -- a proposal's own material has no days at all
  end if;
  if not (public.is_staff() or public.is_presenter_of(v_session_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_day_id is not null and not exists (
    select 1 from public.session_days d where d.id = p_day_id and d.session_id = v_session_id
  ) then
    -- A named, readable refusal ahead of the composite FK's own bare 23503 (DEC-151).
    raise exception 'day_not_of_session' using errcode = '23503';
  end if;
  if p_day_id is not distinct from v_old_day then
    select * into v_row from public.materials where id = p_material_id;
    return v_row;
  end if;

  update public.materials set session_day_id = p_day_id, updated_at = now()
   where id = p_material_id
  returning * into v_row;

  -- REQ-MAT-006: a rescope moves WHEN the material becomes visible (T3), exactly the reason 0052
  -- audits a phase change — so this is audited the same way, inline, since (unlike phase/
  -- allow_download) this column has exactly one write door.
  perform public.write_audit(
    v_org_id, 'material.rescoped', 'material', p_material_id,
    jsonb_build_object('session_day_id', v_old_day), jsonb_build_object('session_day_id', p_day_id)
  );

  return v_row;
end $$;
revoke all on function public.rescope_material(uuid, uuid) from public, anon;
grant execute on function public.rescope_material(uuid, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · re-scope — tasks
-- ═══════════════════════════════════════════════════════════════════════════
create function public.rescope_task(p_task_id uuid, p_day_id uuid default null) returns public.session_tasks
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id     uuid;
  v_session_id uuid;
  v_row        public.session_tasks;
begin
  select t.org_id, t.session_id into v_org_id, v_session_id
    from public.session_tasks t where t.id = p_task_id;
  if v_org_id is null or v_org_id is distinct from public.auth_org_id() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (public.is_staff() or public.is_presenter_of(v_session_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_day_id is not null and not exists (
    select 1 from public.session_days d where d.id = p_day_id and d.session_id = v_session_id
  ) then
    raise exception 'day_not_of_session' using errcode = '23503';
  end if;

  update public.session_tasks set session_day_id = p_day_id, updated_at = now()
   where id = p_task_id
  returning * into v_row;

  return v_row;
end $$;
revoke all on function public.rescope_task(uuid, uuid) from public, anon;
grant execute on function public.rescope_task(uuid, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · re-scope — photos (staff alone; REQ-EVT-009 gives a photo no presenter-write concept)
-- ═══════════════════════════════════════════════════════════════════════════
create function public.rescope_photo(p_photo_id uuid, p_day_id uuid default null) returns public.photos
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id     uuid;
  v_session_id uuid;
  v_row        public.photos;
begin
  select p.org_id, p.session_id into v_org_id, v_session_id
    from public.photos p where p.id = p_photo_id;
  if v_org_id is null or v_org_id is distinct from public.auth_org_id() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not public.is_staff() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_day_id is not null and not exists (
    select 1 from public.session_days d where d.id = p_day_id and d.session_id = v_session_id
  ) then
    raise exception 'day_not_of_session' using errcode = '23503';
  end if;

  update public.photos set session_day_id = p_day_id
   where id = p_photo_id
  returning * into v_row;

  return v_row;
end $$;
revoke all on function public.rescope_photo(uuid, uuid) from public, anon;
grant execute on function public.rescope_photo(uuid, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · photos — which day an upload belongs to
--
-- NOT `resolve_session_day()` (0100/0101): that resolver answers "which room is taking attendance
-- right now" for check-in — capped by `check_in_ceiling()`, biased toward "the latest day begun".
-- A photo's moment is not an attendance question. DEC-121 asks for "the day whose window contains
-- the upload time, falling back to the nearest day" — nearest by whichever edge (start or end) is
-- closest in time, approved at sync 1 (DEC-151). One ORDER BY does both steps at once: a day whose
-- window contains `p_at` sorts first (only one can, since days never overlap); failing that, the
-- day with the smallest edge distance wins.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.resolve_photo_day(p_session uuid, p_at timestamptz) returns uuid
language sql stable security definer set search_path = '' as $$
  select d.id
    from public.session_days d
   where d.session_id = p_session
   order by
     (d.starts_at <= p_at and p_at < d.ends_at) desc,
     least(abs(extract(epoch from d.starts_at - p_at)), abs(extract(epoch from d.ends_at - p_at))) asc
   limit 1
$$;
-- Callable by no client role, the same reasoning as resolve_session_day (0100): it takes a bare
-- session id, and every caller is a definer function that runs as the owner and needs no grant.
revoke execute on function public.resolve_photo_day(uuid, timestamptz) from public, anon, authenticated, service_role;
comment on function public.resolve_photo_day(uuid, timestamptz) is
  'DEC-121/DEC-151: the day an upload moment belongs to when the session has more than one — in its window, else the day whose nearer edge is closest. Never called at n <= 1; record_photo_upload() leaves the column null there.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 · record_photo_upload() — the ONLY door that ever creates a `photos` row (0037's
--     `check (exif_stripped)` says so structurally). A trailing, defaulted 10th parameter is
--     additive (DEC-150 rule 2) ONLY once the nine-parameter overload is gone — `create or
--     replace` with a different argument list creates a SECOND function instead of replacing the
--     first, and main's worker's nine-positional-argument call becomes ambiguous ("function is
--     not unique") the moment both exist (DEC-151, 0085's lesson). Drop, then create, in this one
--     file, so PostgREST/`pg` never sees two candidates.
-- ═══════════════════════════════════════════════════════════════════════════
drop function public.record_photo_upload(uuid, uuid, uuid, uuid, text, bigint, text, int, int);

create function public.record_photo_upload(
  p_photo_id     uuid,
  p_org_id       uuid,
  p_session_id   uuid,
  p_uploader_id  uuid,
  p_storage_path text,
  p_byte_size    bigint,
  p_sha256       text,
  p_width        int default null,
  p_height       int default null,
  -- Additive: the CURRENTLY deployed worker calls this with nine positional arguments and keeps
  -- working, defaulting to now() — indistinguishable from today's behaviour (the worker's own
  -- clock) until the wave-9 worker build passes the real upload moment explicitly.
  p_uploaded_at  timestamptz default now()
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_limit_mb  int;
  v_row       public.photos;
  v_day_count int;
  v_day_id    uuid;
begin
  select limit_image_mb into v_limit_mb from public.org_settings where org_id = p_org_id;
  if v_limit_mb is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  -- DEC-043: the strip and the re-upload already happened outside this transaction — refusing
  -- here is a decision the worker acts on (deletes the object), never a raised exception unwinding
  -- a write that was never made.
  if p_byte_size > v_limit_mb::bigint * 1024 * 1024 then
    return jsonb_build_object('status', 'file_too_large', 'limit_mb', v_limit_mb);
  end if;

  select count(*) into v_day_count from public.session_days where session_id = p_session_id;

  -- DEC-121: "a one-day session's content is session-scoped (null), not day-1-scoped" — adding a
  -- second day later must re-scope nothing, which only holds if this stays null while n <= 1.
  if v_day_count > 1 then
    v_day_id := public.resolve_photo_day(p_session_id, p_uploaded_at);
  end if;

  insert into public.photos
    (id, org_id, session_id, session_day_id, uploader_id, storage_path, width, height, byte_size, sha256, exif_stripped)
  values
    (p_photo_id, p_org_id, p_session_id, v_day_id, p_uploader_id, p_storage_path, p_width, p_height, p_byte_size, p_sha256, true)
  on conflict (id) do nothing
  returning * into v_row;

  if v_row.id is null then
    select * into v_row from public.photos where id = p_photo_id;
  end if;

  return jsonb_build_object('status', 'ok', 'photo', to_jsonb(v_row));
end $$;
revoke all on function public.record_photo_upload(uuid, uuid, uuid, uuid, text, bigint, text, int, int, timestamptz) from public, anon, authenticated;
grant execute on function public.record_photo_upload(uuid, uuid, uuid, uuid, text, bigint, text, int, int, timestamptz) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6 · initiate_photo_processing() — captures the upload moment for record_photo_upload() to use.
--     Same signature, so `create or replace` really does replace it (no overload risk here).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.initiate_photo_processing(
  p_photo_id           uuid,
  p_session_id         uuid,
  p_storage_path       text,
  p_declared_kind      text,
  p_declared_byte_size bigint
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id   uuid := public.auth_org_id();
  v_member   uuid := public.auth_member_id();
  v_limit_mb int;
begin
  if not (public.has_checked_in(p_session_id) or public.is_presenter_of(p_session_id) or public.is_staff()) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select limit_image_mb into v_limit_mb from public.org_settings where org_id = v_org_id;
  if v_limit_mb is null then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if p_declared_byte_size > v_limit_mb::bigint * 1024 * 1024 then
    raise exception 'file_too_large: byte_size % exceeds the % MB limit', p_declared_byte_size, v_limit_mb
      using errcode = '23514';
  end if;

  perform public.enqueue_job(
    'process_photo',
    jsonb_build_object(
      'photo_id', p_photo_id, 'org_id', v_org_id, 'session_id', p_session_id,
      'uploader_id', v_member, 'storage_path', p_storage_path, 'declared_kind', p_declared_kind,
      -- REQ-SES-018/DEC-121: the instant the browser's own PUT succeeded, not the worker's later
      -- clock — this call happens synchronously right after that PUT (see this function's own
      -- header comment, 0050).
      'uploaded_at', now()
    ),
    'photo:' || p_photo_id::text
  );
end $$;
revoke all on function public.initiate_photo_processing(uuid, uuid, text, text, bigint) from public, anon;
grant execute on function public.initiate_photo_processing(uuid, uuid, text, text, bigint) to authenticated;

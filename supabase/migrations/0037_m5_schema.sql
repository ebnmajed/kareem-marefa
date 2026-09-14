-- promoted by the lead at wave-2 sync 5 · content (wave 2, M5) — materials, tasks, photos, discovery. Tables,
-- constraints, RLS, grants, storage buckets — no RPCs (same discipline 0010
-- set for M2: RPCs come later, proposed and promoted separately).
--
-- Serves:  02 §3, §4.2 (tags/session_tags), §4.6 (materials, tasks), §4.7
--          (photos, photo_takedowns, the reports.photo_id FK), §4.15
--          (bookmarks, search), §7 (org_id coverage)
--          03 §5.5, §5.6c/d (policies copied verbatim where already written),
--          §6 (storage bucket policies)
--          REQ-MAT-001…012, REQ-TSK-001…005, REQ-EVT-009…014 (schema half),
--          REQ-DSC-001…007
-- Cites:   DEC-005 (photo safeguards), DEC-006 (Keynote download-only),
--          DEC-009 (no SVG uploads), DEC-040/046 (wave-2 contracts —
--          proposed SQL, promoted by the lead)
--
-- docs/plan/notes/content.md §1 has the full reasoning. Two things worth
-- repeating here because they are easy to miss on a read-through:
--
--   1. `tags`/`session_tags`/`bookmarks` do not exist before this file —
--      02 §4.2 lists tags next to categories/venues, but neither 0004 nor
--      0010 created it. REQ-DSC-002/006 are this track's, so it is created
--      here, not assumed to exist.
--   2. `sessions.search_vector` is an ALTER TABLE on a table this track does
--      not own the app code for — additive schema DDL, the same forward-
--      reference pattern 0010 used for `reports.photo_id` ("M5 adds the
--      reference"). REQ-DSC-003/004 cannot exist without it.
--
-- CI's bare Postgres container has no `storage` schema — this is the FIRST
-- migration to touch storage.objects/storage.buckets. The lead needs the
-- shim in docs/plan/notes/content.md §1.7 before this file applies in CI.

-- ── Enums (02 §3, the M5 subset) ────────────────────────────────────────────
create type public.material_kind  as enum ('pdf', 'powerpoint', 'keynote', 'image', 'audio', 'video_link', 'external_link');
create type public.material_phase as enum ('before', 'after');
create type public.render_status  as enum ('pending', 'rendering', 'ready', 'failed', 'not_applicable');
create type public.task_kind      as enum ('read_material', 'form', 'checklist', 'external');

create extension if not exists pg_trgm with schema extensions;

-- ═══════════════════════════════════════════════════════════════════════════
-- materials / material_versions / material_pages — 02 §4.6.
-- current_version_id → material_versions is a forward reference resolved by
-- ALTER TABLE once material_versions exists (same trick as reports.photo_id).
-- ═══════════════════════════════════════════════════════════════════════════
create table public.materials (
  id                         uuid primary key default gen_random_uuid(),
  org_id                     uuid not null references public.orgs(id) on delete cascade,
  session_id                 uuid not null references public.sessions(id) on delete cascade,   -- REQ-MAT-001: no standalone uploads
  kind                       public.material_kind not null,
  title                      text not null check (char_length(btrim(title)) between 1 and 200),
  phase                      public.material_phase not null default 'after',
  allow_download             boolean not null default true,
  external_url               text check (external_url is null or external_url ~ '^https://'),
  current_version_id         uuid,                                            -- FK added below, once material_versions exists
  render_status              public.render_status not null default 'pending',
  font_substitution_warning  text,
  added_by                   uuid not null references public.members(id),
  removed_at                 timestamptz,
  removed_by                 uuid references public.members(id),
  removal_reason             text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  check ((kind in ('video_link', 'external_link')) = (external_url is not null)),
  check (kind <> 'keynote' or render_status = 'not_applicable')                -- DEC-006
);
create index materials_org_session_idx on public.materials (org_id, session_id);
create index materials_org_phase_idx   on public.materials (org_id, phase) where removed_at is null;

create table public.material_versions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  material_id   uuid not null references public.materials(id) on delete cascade,
  version       int not null check (version > 0),
  storage_path  text not null,
  byte_size     bigint not null check (byte_size > 0),
  sniffed_mime  text not null,                                                 -- the SNIFFED type, never the declared one (REQ-MAT-012)
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by   uuid not null references public.members(id),
  uploaded_at   timestamptz not null default now(),
  unique (material_id, version)
);
create index material_versions_org_material_idx on public.material_versions (org_id, material_id);

alter table public.materials
  add constraint materials_current_version_id_fkey
  foreign key (current_version_id) references public.material_versions(id);

create table public.material_pages (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.orgs(id) on delete cascade,
  material_version_id   uuid not null references public.material_versions(id) on delete cascade,
  page_number           int not null check (page_number > 0),
  image_path            text not null,
  thumbnail_path        text not null,
  width                 int,
  height                int,
  unique (material_version_id, page_number)
);
create index material_pages_org_version_idx on public.material_pages (org_id, material_version_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- session_tasks / task_completions / task_form_responses — 02 §4.6.
-- REQ-TSK-002: no table here is ever consulted by the check-in path, and no
-- task action exists in the scoring catalogue — both are true by omission:
-- nothing under checkin/ or scoring/ references session_tasks anywhere.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.session_tasks (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.orgs(id) on delete cascade,
  session_id     uuid not null references public.sessions(id) on delete cascade,
  kind           public.task_kind not null,
  title          text not null check (char_length(btrim(title)) between 1 and 200),
  description    text check (description is null or char_length(description) <= 2000),
  material_id    uuid references public.materials(id) on delete set null,      -- for kind = 'read_material'
  form_schema    jsonb,                                                        -- for kind = 'form'
  external_url   text check (external_url is null or external_url ~ '^https://'),
  sort_order     int not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check ((kind = 'read_material') = (material_id is not null)),
  check ((kind = 'form') = (form_schema is not null)),
  check ((kind = 'external') = (external_url is not null))
);
create index session_tasks_org_session_idx on public.session_tasks (org_id, session_id, sort_order);

create table public.task_completions (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  task_id       uuid not null references public.session_tasks(id) on delete cascade,
  member_id     uuid not null references public.members(id) on delete cascade,
  completed_at  timestamptz not null default now(),
  unique (task_id, member_id)
);
create index task_completions_org_task_idx on public.task_completions (org_id, task_id);

create table public.task_form_responses (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  task_id      uuid not null references public.session_tasks(id) on delete cascade,
  member_id    uuid not null references public.members(id) on delete cascade,
  response     jsonb not null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (task_id, member_id)
);
create index task_form_responses_org_task_idx on public.task_form_responses (org_id, task_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- photos / photo_takedowns — 02 §4.7, DEC-005.
-- exif_stripped's check is REQ-EVT-011 made structural: a row cannot exist
-- for an unstripped image, even if a future code path forgets to strip it.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.photos (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  session_id    uuid not null references public.sessions(id) on delete cascade,
  uploader_id   uuid not null references public.members(id),
  storage_path  text not null,
  width         int,
  height        int,
  byte_size     bigint not null check (byte_size > 0),
  sha256        text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  exif_stripped boolean not null default false,
  hidden_at     timestamptz,
  hidden_reason text,
  removed_at    timestamptz,
  removed_by    uuid references public.members(id),
  created_at    timestamptz not null default now(),
  check (exif_stripped)                                                        -- REQ-EVT-011
);
create index photos_org_session_idx on public.photos (org_id, session_id);

create table public.photo_takedowns (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  photo_id      uuid not null references public.photos(id) on delete cascade,
  requester_id  uuid not null references public.members(id),
  requested_at  timestamptz not null default now(),
  resolved_at   timestamptz,
  resolution    public.moderation_action,
  resolved_by   uuid references public.members(id),
  check ((resolved_at is null) = (resolution is null))
);
create index photo_takedowns_org_photo_idx on public.photo_takedowns (org_id, photo_id);

-- 0010 left `reports.photo_id` bare with "-- M5 adds the reference".
alter table public.reports
  add constraint reports_photo_id_fkey foreign key (photo_id) references public.photos(id) on delete cascade;
create index reports_org_photo_idx on public.reports (org_id, photo_id) where photo_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- tags / session_tags — 02 §4.2. Did not exist before this file (docs/plan/
-- notes/content.md §0.1) — REQ-DSC-002 is this track's, not wave 0's.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.tags (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  label       text not null check (char_length(btrim(label)) between 1 and 60),
  normalised  text not null check (char_length(normalised) between 1 and 60),
  created_at  timestamptz not null default now(),
  unique (org_id, normalised)
);

create table public.session_tags (
  org_id      uuid not null references public.orgs(id) on delete cascade,
  session_id  uuid not null references public.sessions(id) on delete cascade,
  tag_id      uuid not null references public.tags(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (session_id, tag_id)
);
create index session_tags_org_tag_idx on public.session_tags (org_id, tag_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- bookmarks — 02 §4.15. Never referenced by the scoring engine (REQ-DSC-006).
-- ═══════════════════════════════════════════════════════════════════════════
create table public.bookmarks (
  org_id      uuid not null references public.orgs(id) on delete cascade,
  member_id   uuid not null references public.members(id) on delete cascade,
  session_id  uuid not null references public.sessions(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (member_id, session_id)
);
create index bookmarks_org_member_idx on public.bookmarks (org_id, member_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- Search — 02 §4.15. Postgres ships no Arabic FTS dictionary; ar_normalize()
-- is ours, feeding `simple`. Copied from 02's own sketch, not re-derived.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.ar_normalize(txt text) returns text
language sql immutable strict parallel safe set search_path = '' as $$
  select regexp_replace(
           translate(
             regexp_replace(txt, '[ً-ْٰـ]', '', 'g'),  -- tashkeel + tatweel
             'أإآٱىة', 'اااايه'                                             -- alef, yaa, taa-marbuta
           ),
           '\s+', ' ', 'g')
$$;

alter table public.sessions add column search_vector tsvector
  generated always as (
    setweight(to_tsvector('simple', public.ar_normalize(coalesce(title, ''))), 'A') ||
    setweight(to_tsvector('simple', public.ar_normalize(coalesce(abstract, ''))), 'B')
  ) stored;
create index sessions_search_vector_idx on public.sessions using gin (search_vector);
create index sessions_title_trgm_idx on public.sessions using gin (public.ar_normalize(title) extensions.gin_trgm_ops);

-- ═══════════════════════════════════════════════════════════════════════════
-- Triggers — the same reason comments_guard exists: a using/with check
-- clause cannot see the OLD row, another table, or "who may touch this
-- column right now".
-- ═══════════════════════════════════════════════════════════════════════════

-- REQ-MAT-008: session_id/kind/added_by are immutable. Removal itself is
-- NOT done through this trigger plus a plain client UPDATE — see
-- remove_material() below and docs/plan/notes/content.md §1.4a for why: a
-- documented PostgreSQL RLS behavior makes that combination structurally
-- impossible (an UPDATE's resulting row must ALSO satisfy the table's
-- SELECT policy, and materials_read's `removed_at is null` conjunct is
-- unconditional, so no UPDATE can ever set it and remain visible to the
-- very statement that set it — the "new row violates row-level security
-- policy" error fires even under `using (true) with check (true)`).
create function public.materials_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.session_id is distinct from old.session_id
     or new.kind is distinct from old.kind
     or new.added_by is distinct from old.added_by then
    raise exception 'immutable_columns' using errcode = '42501';
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger materials_guard before update on public.materials
  for each row execute function public.materials_guard();

-- REQ-MAT-008: a presenter removes their own material only before the
-- session completes; an admin's removal is not time-boxed; every removal is
-- audited with actor and reason. SECURITY DEFINER — not for authority (the
-- checks below are the same ones the old trigger did) but because ONLY the
-- table owner's own UPDATE can set removed_at and remain visible to itself
-- afterward (see materials_guard's comment above). Mirrors why
-- delete_own_comment() exists for comments' own, different RLS limitation.
create function public.remove_material(p_material_id uuid, p_reason text) returns public.materials
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id uuid;
  v_session_id uuid;
  v_is_admin boolean := public.is_org_admin();
  v_session_closed boolean;
  v_row public.materials;
begin
  select m.org_id, m.session_id into v_org_id, v_session_id
    from public.materials m
   where m.id = p_material_id and m.removed_at is null;
  if v_org_id is null or v_org_id is distinct from public.auth_org_id() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (v_is_admin or public.is_presenter_of(v_session_id)) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise exception 'reason_required' using errcode = '23514';
  end if;
  select (s.state in ('completed', 'archived')) into v_session_closed
    from public.sessions s where s.id = v_session_id;
  if v_session_closed and not v_is_admin then
    raise exception 'session_completed' using errcode = '23514';
  end if;

  update public.materials
     set removed_at = now(), removed_by = public.auth_member_id(), removal_reason = p_reason
   where id = p_material_id
  returning * into v_row;

  perform public.write_audit(v_row.org_id, 'material.removed', 'material', v_row.id, null, to_jsonb(v_row), p_reason);
  return v_row;
end $$;
revoke all on function public.remove_material(uuid, text) from public, anon;
grant execute on function public.remove_material(uuid, text) to authenticated;
-- Caller note (docs/plan/notes/content.md §1.4a): call this as
-- `select r.* from public.remove_material($1, $2) r`, never as
-- `select (public.remove_material($1, $2)).*` — the latter risks Postgres
-- evaluating a composite-returning function TWICE (once for the value, once
-- for the `.*` expansion), which for a function with side effects means the
-- second call runs against an already-removed row and raises `not_found`.

-- REQ-EVT-012: inserting a takedown hides the photo in the SAME transaction,
-- before any human — moderator included — sees the request.
create function public.photo_takedowns_hide() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.photos
     set hidden_at = now(), hidden_reason = 'takedown_requested'
   where id = new.photo_id and hidden_at is null;
  return new;
end $$;
create trigger photo_takedowns_hide after insert on public.photo_takedowns
  for each row execute function public.photo_takedowns_hide();

-- Resolving a takedown: resolved_by is stamped server-side; 'restored'
-- unhides the photo. 'removed'/'dismissed' write no further schema-level
-- effect yet — the removal audit row and the compensating ledger entry
-- (REQ-EVT-014, 05 §2.4) are STORY-EVT-006's RPC, not this schema pass.
create function public.photo_takedowns_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.resolved_at is distinct from old.resolved_at and new.resolved_at is not null then
    new.resolved_by := public.auth_member_id();
    if new.resolution = 'restored' then
      update public.photos set hidden_at = null, hidden_reason = null where id = new.photo_id;
    end if;
  end if;
  return new;
end $$;
create trigger photo_takedowns_guard before update on public.photo_takedowns
  for each row execute function public.photo_takedowns_guard();

create trigger session_tasks_updated_at before update on public.session_tasks
  for each row execute function public.set_updated_at();
create trigger task_form_responses_updated_at before update on public.task_form_responses
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS — every table, no exceptions. §5.5a / §5.5b / §5.6c are copied
-- verbatim from 03 (already-written prose, not yet implemented anywhere).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── materials ────────────────────────────────────────────────────────────
alter table public.materials enable row level security;
revoke all on public.materials from anon, authenticated, service_role;

create policy "materials_read" on public.materials for select to authenticated       -- 03 §5.5a, verbatim
  using (org_id = public.auth_org_id()
         and removed_at is null
         and (phase = 'before'
              or exists (select 1 from public.sessions s
                          where s.id = materials.session_id
                            and s.state in ('completed', 'archived'))
              or public.is_presenter_of(session_id)
              or public.is_staff()));

create policy "p8_presenter_write" on public.materials for insert to authenticated
  with check (org_id = public.auth_org_id()
              and (public.is_presenter_of(session_id) or public.is_org_admin()));

create policy "materials_update_presenter" on public.materials for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_presenter_of(session_id))
  with check  (org_id = public.auth_org_id() and public.is_presenter_of(session_id));

create policy "materials_update_admin" on public.materials for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());

create policy "materials_delete_admin" on public.materials for delete to authenticated
  using (org_id = public.auth_org_id() and public.is_org_admin());

grant select, insert, delete on public.materials to authenticated;
-- removed_at/removed_by/removal_reason are NOT granted here — a plain client
-- UPDATE setting removed_at can never satisfy materials_read afterward (see
-- materials_guard's comment), so removal goes only through remove_material().
grant update (title, phase, allow_download) on public.materials to authenticated;

-- ── material_versions ────────────────────────────────────────────────────
alter table public.material_versions enable row level security;
revoke all on public.material_versions from anon, authenticated, service_role;

create policy "material_versions_read" on public.material_versions for select to authenticated
  using (org_id = public.auth_org_id() and exists (
    select 1 from public.materials m
      join public.sessions s on s.id = m.session_id
     where m.id = material_versions.material_id
       and m.removed_at is null
       and (m.phase = 'before' or s.state in ('completed', 'archived')
            or public.is_presenter_of(m.session_id) or public.is_staff())
  ));

create policy "material_versions_insert" on public.material_versions for insert to authenticated
  with check (org_id = public.auth_org_id() and exists (
    select 1 from public.materials m where m.id = material_versions.material_id
      and (public.is_presenter_of(m.session_id) or public.is_org_admin())
  ));

grant select, insert on public.material_versions to authenticated;   -- append-only in practice — no update/delete

-- ── material_pages ───────────────────────────────────────────────────────
alter table public.material_pages enable row level security;
revoke all on public.material_pages from anon, authenticated, service_role;

create policy "material_pages_read" on public.material_pages for select to authenticated
  using (org_id = public.auth_org_id() and exists (
    select 1 from public.material_versions mv
      join public.materials m on m.id = mv.material_id
      join public.sessions  s on s.id = m.session_id
     where mv.id = material_pages.material_version_id
       and m.removed_at is null
       and (m.phase = 'before' or s.state in ('completed', 'archived')
            or public.is_presenter_of(m.session_id) or public.is_staff())
  ));

grant select on public.material_pages to authenticated;   -- written by the render job only (a future SECURITY DEFINER RPC — never a raw grant)

-- ── session_tasks ────────────────────────────────────────────────────────
alter table public.session_tasks enable row level security;
revoke all on public.session_tasks from anon, authenticated, service_role;

create policy "p1_org_read" on public.session_tasks for select to authenticated
  using (org_id = public.auth_org_id());

create policy "p8_presenter_write" on public.session_tasks for insert to authenticated
  with check (org_id = public.auth_org_id() and (public.is_presenter_of(session_id) or public.is_org_admin()));

create policy "session_tasks_update_presenter" on public.session_tasks for update to authenticated
  using       (org_id = public.auth_org_id() and (public.is_presenter_of(session_id) or public.is_org_admin()))
  with check  (org_id = public.auth_org_id() and (public.is_presenter_of(session_id) or public.is_org_admin()));

create policy "session_tasks_delete_presenter" on public.session_tasks for delete to authenticated
  using (org_id = public.auth_org_id() and (public.is_presenter_of(session_id) or public.is_org_admin()));

grant select, insert, delete on public.session_tasks to authenticated;
grant update (kind, title, description, material_id, form_schema, external_url, sort_order) on public.session_tasks to authenticated;

-- ── task_completions ─────────────────────────────────────────────────────
alter table public.task_completions enable row level security;
revoke all on public.task_completions from anon, authenticated, service_role;

create policy "task_completions_read" on public.task_completions for select to authenticated
  using (org_id = public.auth_org_id()
         and (member_id = public.auth_member_id()
              or exists (select 1 from public.session_tasks t
                          where t.id = task_completions.task_id and public.is_presenter_of(t.session_id))));

create policy "p3_self_insert" on public.task_completions for insert to authenticated
  with check (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "p3_self_update" on public.task_completions for update to authenticated
  using       (org_id = public.auth_org_id() and member_id = public.auth_member_id())
  with check  (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "p3_self_delete" on public.task_completions for delete to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());

grant select, insert, update, delete on public.task_completions to authenticated;

-- ── task_form_responses ──────────────────────────────────────────────────
alter table public.task_form_responses enable row level security;
revoke all on public.task_form_responses from anon, authenticated, service_role;

create policy "responses_read" on public.task_form_responses for select to authenticated  -- 03 §5.5b, verbatim
  using (org_id = public.auth_org_id()
         and (member_id = public.auth_member_id()
              or public.is_org_admin()
              or exists (select 1 from public.session_tasks t
                          where t.id = task_form_responses.task_id
                            and public.is_presenter_of(t.session_id))));

create policy "p3_self_insert" on public.task_form_responses for insert to authenticated
  with check (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "p3_self_update" on public.task_form_responses for update to authenticated
  using       (org_id = public.auth_org_id() and member_id = public.auth_member_id())
  with check  (org_id = public.auth_org_id() and member_id = public.auth_member_id());

grant select, insert on public.task_form_responses to authenticated;
grant update (response, updated_at) on public.task_form_responses to authenticated;

-- ── photos ───────────────────────────────────────────────────────────────
alter table public.photos enable row level security;
revoke all on public.photos from anon, authenticated, service_role;

create policy "photos_read" on public.photos for select to authenticated
  using (org_id = public.auth_org_id() and (hidden_at is null or public.is_staff()));

create policy "photos_insert_checked_in" on public.photos for insert to authenticated   -- 03 §5.6c, verbatim
  with check (org_id = public.auth_org_id()
              and uploader_id = public.auth_member_id()
              and exif_stripped
              and (public.has_checked_in(session_id)
                   or public.is_presenter_of(session_id)
                   or public.is_staff()));

create policy "p6_staff_update" on public.photos for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_staff())
  with check  (org_id = public.auth_org_id() and public.is_staff());

grant select, insert on public.photos to authenticated;
grant update (hidden_at, hidden_reason, removed_at, removed_by) on public.photos to authenticated;

-- ── photo_takedowns ──────────────────────────────────────────────────────
alter table public.photo_takedowns enable row level security;
revoke all on public.photo_takedowns from anon, authenticated, service_role;

create policy "photo_takedowns_read" on public.photo_takedowns for select to authenticated
  using (org_id = public.auth_org_id() and (public.is_staff() or requester_id = public.auth_member_id()));

create policy "photo_takedowns_insert_self" on public.photo_takedowns for insert to authenticated
  with check (org_id = public.auth_org_id() and requester_id = public.auth_member_id()
              and exists (select 1 from public.photos p where p.id = photo_takedowns.photo_id and p.org_id = public.auth_org_id()));

create policy "p6_staff_update" on public.photo_takedowns for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_staff())
  with check  (org_id = public.auth_org_id() and public.is_staff());

grant select, insert on public.photo_takedowns to authenticated;
grant update (resolved_at, resolution, resolved_by) on public.photo_takedowns to authenticated;

-- ── tags ─────────────────────────────────────────────────────────────────
alter table public.tags enable row level security;
revoke all on public.tags from anon, authenticated, service_role;

create policy "p1_org_read" on public.tags for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p2_admin_insert" on public.tags for insert to authenticated
  with check (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_update" on public.tags for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_delete" on public.tags for delete to authenticated
  using (org_id = public.auth_org_id() and public.is_org_admin());

grant select, insert, update, delete on public.tags to authenticated;

-- ── session_tags ─────────────────────────────────────────────────────────
alter table public.session_tags enable row level security;
revoke all on public.session_tags from anon, authenticated, service_role;

create policy "p1_org_read" on public.session_tags for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p8_presenter_write" on public.session_tags for insert to authenticated
  with check (org_id = public.auth_org_id() and (public.is_presenter_of(session_id) or public.is_org_admin()));
create policy "session_tags_delete_presenter" on public.session_tags for delete to authenticated
  using (org_id = public.auth_org_id() and (public.is_presenter_of(session_id) or public.is_org_admin()));

grant select, insert, delete on public.session_tags to authenticated;

-- ── bookmarks ────────────────────────────────────────────────────────────
alter table public.bookmarks enable row level security;
revoke all on public.bookmarks from anon, authenticated, service_role;

create policy "p7_self_read" on public.bookmarks for select to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "p3_self_insert" on public.bookmarks for insert to authenticated
  with check (org_id = public.auth_org_id() and member_id = public.auth_member_id());
create policy "p3_self_delete" on public.bookmarks for delete to authenticated
  using (org_id = public.auth_org_id() and member_id = public.auth_member_id());

grant select, insert, delete on public.bookmarks to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Storage — six private buckets, 03 §6. None public; every read is a
-- server-generated signed URL. materials/material-pages join back to
-- Postgres to repeat the phase gate (docs/plan/notes/content.md §1.5) —
-- the org-prefix check alone is the FLOOR 03 §6 documents, not a ceiling.
-- ═══════════════════════════════════════════════════════════════════════════
insert into storage.buckets (id, name, public)
values ('materials', 'materials', false),
       ('material-pages', 'material-pages', false),
       ('photos', 'photos', false),
       ('design-assets', 'design-assets', false),
       ('exports', 'exports', false),
       ('fonts', 'fonts', false)
on conflict (id) do nothing;

grant select, insert on storage.objects to authenticated;   -- one grant; each policy below scopes itself to its own bucket_id, so a bucket with no policy stays default-deny

-- materials/{org_id}/sessions/{session_id}/materials/{version_id}/{filename}
create policy "materials_storage_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and exists (
      select 1 from public.material_versions mv
        join public.materials m on m.id = mv.material_id
        join public.sessions  s on s.id = m.session_id
       where mv.id = nullif((storage.foldername(name))[5], '')::uuid
         and m.removed_at is null
         and (m.phase = 'before' or s.state in ('completed', 'archived')
              or public.is_presenter_of(m.session_id) or public.is_staff())
         and (m.allow_download or public.is_presenter_of(m.session_id) or public.is_staff())   -- REQ-MAT-005
    )
  );

create policy "materials_storage_write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and (storage.foldername(name))[2] = 'sessions'
    and (public.is_presenter_of(nullif((storage.foldername(name))[3], '')::uuid) or public.is_staff())
  );

-- material-pages/{org_id}/sessions/{session_id}/pages/{version_id}/{n}.webp
-- Identical regardless of allow_download (07 §6) — no allow_download conjunct.
create policy "material_pages_storage_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'material-pages'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and exists (
      select 1 from public.material_versions mv
        join public.materials m on m.id = mv.material_id
        join public.sessions  s on s.id = m.session_id
       where mv.id = nullif((storage.foldername(name))[5], '')::uuid
         and m.removed_at is null
         and (m.phase = 'before' or s.state in ('completed', 'archived')
              or public.is_presenter_of(m.session_id) or public.is_staff())
    )
  );
-- write: the render job only — no insert policy for `authenticated` at all.

-- photos/{org_id}/sessions/{session_id}/photos/{photo_id}.webp
create policy "photos_storage_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and exists (
      select 1 from public.photos p
       where p.id = nullif(regexp_replace(storage.filename(name), '\.[a-zA-Z0-9]+$', ''), '')::uuid
         and (p.hidden_at is null or public.is_staff())
    )
  );

create policy "photos_storage_write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and (storage.foldername(name))[2] = 'sessions'
    and (public.has_checked_in(nullif((storage.foldername(name))[3], '')::uuid)
         or public.is_presenter_of(nullif((storage.foldername(name))[3], '')::uuid)
         or public.is_staff())
  );

-- design-assets/{org_id}/design/assets/{asset_id}.{ext} — admins only, both ways.
create policy "design_assets_storage_read" on storage.objects for select to authenticated
  using (bucket_id = 'design-assets' and (storage.foldername(name))[1] = public.auth_org_id()::text and public.is_org_admin());
create policy "design_assets_storage_write" on storage.objects for insert to authenticated
  with check (bucket_id = 'design-assets' and (storage.foldername(name))[1] = public.auth_org_id()::text and public.is_org_admin());

-- exports/{org_id}/exports/{document_id}/{preset}.{ext} — org members read; the worker writes.
create policy "exports_storage_read" on storage.objects for select to authenticated
  using (bucket_id = 'exports' and (storage.foldername(name))[1] = public.auth_org_id()::text);
-- write: the worker (service_role, bypassrls) only — no insert policy for `authenticated`.

-- fonts/{sha256}.{ext} — deliberately NOT org-prefixed (content-addressed, shared platform-wide, REQ-DSG-016).
create policy "fonts_storage_read" on storage.objects for select to authenticated
  using (bucket_id = 'fonts');
-- write: the worker (service_role, bypassrls) only — no insert policy for `authenticated`.

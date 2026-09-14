-- promoted by the lead at wave-3 sync 1 · designer (wave 3, M6) — the designer and certificates schema. Tables,
-- constraints, RLS, grants, the serial allocator and the public verification
-- function. No render RPCs and no session hooks: those are proposed
-- separately, the same discipline 0010 and 0037 set.
--
-- Serves:  02 §3 (the designer and certificate enums), §4.12 (certificates,
--          certificate_serial_counters), §4.13 (design_templates,
--          design_template_versions, design_documents, design_assets, fonts,
--          session_posters, export_artifacts), §7 (org_id coverage)
--          03 §5.8, §5.8a (verbatim), §5.9, §5.9a/§5.9b (verbatim), §6
--          REQ-DSG-004 … REQ-DSG-026 (the schema half), REQ-CRT-001 …
--          REQ-CRT-014 (the schema half), REQ-ADM-013
-- Cites:   DEC-009 (no SVG uploads), DEC-010 (two identifiers, a locked
--          counter row), DEC-012 (live/detached), DEC-017 (one renderer),
--          DEC-048 (wave-3 contracts)
--
-- docs/plan/notes/designer.md §0.3 carries the reasoning. Five things a
-- reader should not have to reconstruct:
--
--  1. THE THREE BUCKETS AND THEIR POLICIES ALREADY EXIST. `0037_m5_schema.sql`
--     created `design-assets`, `exports` and `fonts` with
--     design_assets_storage_{read,write}, exports_storage_read and
--     fonts_storage_read (03 §6.9). This file creates none of them.
--
--  2. `fonts` CARRIES NO `org_id`, and that is a FIFTH exception to 02 §7 —
--     the lead's DECISIONS entry, not this file's. 02 §4.13 gives ENT-fonts no
--     org column and makes `sha256` platform-wide unique; 06 §6.4 and §7.3 say
--     the entire point of the manifest is that the editor, the worker's
--     Chromium and the worker's LibreOffice read the SAME BYTES, and the
--     bucket is deliberately not org-prefixed for exactly that reason. A
--     per-org font table would contradict both. On promotion,
--     tests/rls/isolation.test.ts needs `fonts` in NO_ORG_ID and in the
--     non-vacuity exclusion list.
--
--  3. `design_template_versions.org_id` IS NULLABLE, mirroring its parent. It
--     is not a sixth exception: a version of a platform template belongs to no
--     org for the same reason the template does (D67, 02 §7's third row). A
--     trigger keeps it equal to the parent's, so the isolation sweep's
--     `org_id` column is always the truth and never a join away.
--
--  4. THE SERIAL PREFIX ALREADY EXISTS. `orgs.certificate_prefix` has been
--     there since `0004_tenancy.sql` (M1), `^[A-Z]{2,5}$`, and the fixture
--     already gives org A `KM` and org B `OT`. allocate_serial() reads it; no
--     new column, and DEC-010's `KM-2026-000123` needs nothing added.
--
--  5. TWO STRUCTURAL TRIGGERS move a requirement out of application code:
--     `design_template_versions_guard` refuses a hex colour literal in a
--     template (REQ-DSG-021 — "a literal #0B1220 in a template is a defect")
--     and a layer kind that is not one of the five (REQ-DSG-005, and the only
--     use of the `layer_kind` enum 02 §3 declares); `design_documents_guard`
--     refuses a document that moves, resizes, hides or deletes a layer its
--     template marked locked (REQ-DSG-024), so the editor's refusal is the
--     second line of defence rather than the only one.

-- ── Enums (02 §3 — the designer and certificate subsets) ───────────────────
create type public.certificate_kind  as enum ('attendance', 'presenter', 'achievement');
create type public.certificate_state as enum ('held', 'issued', 'revoked');

create type public.template_scope    as enum ('platform', 'org');
create type public.template_purpose  as enum ('poster', 'certificate');
create type public.poster_mode       as enum ('auto', 'customised', 'uploaded');
create type public.poster_binding    as enum ('live', 'detached');
create type public.layer_kind        as enum ('text', 'image', 'shape', 'qr', 'dynamic_field');
create type public.export_format     as enum ('png', 'webp', 'pdf', 'jpeg');
create type public.export_status     as enum ('queued', 'rendering', 'ready', 'failed');

-- ═══════════════════════════════════════════════════════════════════════════
-- design_templates / design_template_versions — 02 §4.13, REQ-DSG-007/008/026.
--
-- `org_id` is NULL exactly when `scope = 'platform'` (02 §7's third exception,
-- D67). `family` is constrained to 06 §3.3's baseline library and must agree
-- with `purpose`: a certificate template cannot be a `talk`.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.design_templates (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid references public.orgs(id) on delete cascade,
  scope            public.template_scope   not null,
  purpose          public.template_purpose not null,
  family           text not null,
  name             text not null check (char_length(btrim(name)) between 1 and 120),
  description      text,
  -- REQ-DSG-008: duplicating a platform template COPIES it. This records the
  -- provenance and nothing else — later platform changes never reach the copy.
  duplicated_from  uuid references public.design_templates(id) on delete set null,
  -- REQ-DSG-001/002: the automatic path needs one template per family to bind
  -- session data to. Not in 02 §4.13's column sketch; the requirement needs it.
  is_default       boolean not null default false,
  retired_at       timestamptz,
  created_by       uuid references public.members(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint design_templates_scope_org check ((scope = 'platform') = (org_id is null)),
  constraint design_templates_family_purpose check (
    (purpose = 'poster'      and family in ('talk', 'workshop', 'panel', 'meetup', 'announcement')) or
    (purpose = 'certificate' and family in ('attendance', 'presenter', 'achievement'))
  )
);
create trigger design_templates_updated_at before update on public.design_templates
  for each row execute function public.set_updated_at();

-- One default per family per org, and one platform default per family.
create unique index design_templates_org_default
  on public.design_templates (org_id, purpose, family) where is_default and org_id is not null;
create unique index design_templates_platform_default
  on public.design_templates (purpose, family) where is_default and org_id is null;
create index design_templates_org on public.design_templates (org_id) where org_id is not null;

create table public.design_template_versions (
  id              uuid primary key default gen_random_uuid(),
  -- Nullable, mirroring the parent (header note 3), kept equal by a trigger.
  org_id          uuid references public.orgs(id) on delete cascade,
  template_id     uuid not null references public.design_templates(id) on delete cascade,
  version         int  not null check (version >= 1),
  document        jsonb not null,
  dynamic_fields  jsonb not null default '[]'::jsonb,
  safe_areas      jsonb not null default '{}'::jsonb,
  -- REQ-CRT-014 / A39: pinned at publish, so reissuing in 2031 is byte-
  -- reproducible even if the family left the picker.
  font_hashes     text[] not null default '{}',
  published_at    timestamptz,
  published_by    uuid references public.members(id),
  created_at      timestamptz not null default now(),
  unique (template_id, version)
);
create index design_template_versions_template on public.design_template_versions (template_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- design_documents — 02 §4.13, REQ-DSG-005/006.
-- An instance. Fully described by its JSON; nothing about its appearance
-- lives outside it. `bound_certificate_id`'s FK is added after `certificates`.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.design_documents (
  id                   uuid primary key default gen_random_uuid(),
  org_id               uuid not null references public.orgs(id) on delete cascade,
  template_version_id  uuid references public.design_template_versions(id) on delete restrict,
  purpose              public.template_purpose not null,
  document             jsonb not null,
  bound_session_id     uuid references public.sessions(id) on delete cascade,
  bound_certificate_id uuid,
  updated_by           uuid references public.members(id),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  -- A document binds to at most one thing. An unbound document is a template
  -- draft being edited before it is attached to anything.
  constraint design_documents_one_binding
    check (bound_session_id is null or bound_certificate_id is null),
  constraint design_documents_schema_version
    check (document ? 'schemaVersion' and jsonb_typeof(document->'layers') = 'array')
);
create trigger design_documents_updated_at before update on public.design_documents
  for each row execute function public.set_updated_at();
create index design_documents_session on public.design_documents (bound_session_id) where bound_session_id is not null;
create index design_documents_certificate on public.design_documents (bound_certificate_id) where bound_certificate_id is not null;

-- ═══════════════════════════════════════════════════════════════════════════
-- design_assets — 02 §4.13, REQ-DSG-018/019, DEC-009.
-- The check is on the SNIFFED type, not the filename. An SVG would be XML
-- rendered inside a privileged headless Chromium; the format is dropped, not
-- sanitised, so there is no sanitiser to maintain and no bypass to track.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.design_assets (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references public.orgs(id) on delete cascade,
  storage_path  text not null,
  sniffed_mime  text not null check (sniffed_mime in ('image/png', 'image/jpeg', 'image/webp')),
  width         int  check (width  > 0),
  height        int  check (height > 0),
  byte_size     bigint check (byte_size > 0),
  sha256        text check (sha256 ~ '^[0-9a-f]{64}$'),
  -- A31: drives automatic variant cropping, so a 4:5 → 16:9 crop centres on
  -- the subject rather than the geometry.
  focal_x       numeric(4,3) check (focal_x between 0 and 1),
  focal_y       numeric(4,3) check (focal_y between 0 and 1),
  uploaded_by   uuid references public.members(id),
  created_at    timestamptz not null default now(),
  unique (org_id, storage_path)
);
create index design_assets_org on public.design_assets (org_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- fonts — 02 §4.13, REQ-DSG-016/017, A39. The manifest: the only way a font
-- enters the editor, the worker's Chromium or the worker's LibreOffice.
-- No org_id, deliberately (header note 2).
-- ═══════════════════════════════════════════════════════════════════════════
create table public.fonts (
  id             uuid primary key default gen_random_uuid(),
  family         text not null,
  style          text not null default 'normal' check (style in ('normal', 'italic')),
  weight         int  not null default 400 check (weight between 100 and 900),
  source         text not null check (source in ('platform', 'google')),
  -- OUR storage, never a CDN URL: Google's dynamically subset slices are not
  -- byte-stable, so a CDN link would break D66 invisibly — editor and worker
  -- would fetch different bytes on different days and nothing would error.
  storage_path   text not null,
  sha256         text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  subsets        text[] not null default '{}',
  parity_status  text not null default 'pending' check (parity_status in ('pending', 'passed', 'failed')),
  -- Which goldens failed, for the admin — a refusal with an answer (11 §2.5).
  parity_report  jsonb,
  created_at     timestamptz not null default now(),
  -- A font with no Arabic coverage can never become selectable (06 §7.2).
  constraint fonts_arabic_to_pass check (parity_status <> 'passed' or 'arabic' = any(subsets)),
  unique (family, style, weight, source)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- session_posters — 02 §4.13, DEC-012, REQ-DSG-001/002/003.
-- The live/detached rule lives HERE, as two checks. The asymmetry is the
-- decision: an `auto` poster is a pure function of template plus data, so a
-- change regenerates it; the moment an admin customises it, `binding` flips
-- to `detached` and a later data change sets `stale_since` instead.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.session_posters (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  session_id          uuid not null unique references public.sessions(id) on delete cascade,
  document_id         uuid references public.design_documents(id) on delete set null,
  mode                public.poster_mode    not null default 'auto',
  binding             public.poster_binding not null default 'live',
  uploaded_asset_id   uuid references public.design_assets(id) on delete restrict,
  detached_at         timestamptz,
  stale_since         timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint session_posters_uploaded check ((mode = 'uploaded') = (uploaded_asset_id is not null)),
  constraint session_posters_auto_is_live check (mode <> 'auto' or binding = 'live'),
  constraint session_posters_detached_at check ((binding = 'detached') = (detached_at is not null))
);
create trigger session_posters_updated_at before update on public.session_posters
  for each row execute function public.set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
-- export_artifacts — 02 §4.13, REQ-DSG-011/012/013, A29.
-- `source_fingerprint` is the cache key: a hash of the document JSON, the
-- template version, the bound data and the font hashes. Invalidation is
-- impossible to forget, because a changed source produces a different key
-- rather than requiring someone to remember to clear something.
-- ═══════════════════════════════════════════════════════════════════════════
create table public.export_artifacts (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs(id) on delete cascade,
  document_id         uuid not null references public.design_documents(id) on delete cascade,
  preset              text not null check (preset in ('master', 'square', 'story', 'landscape', 'og',
                                                      'a4', 'a3', 'cert_landscape', 'cert_portrait')),
  format              public.export_format not null,
  width_px            int check (width_px  > 0),
  height_px           int check (height_px > 0),
  storage_path        text,
  byte_size           bigint check (byte_size > 0),
  status              public.export_status not null default 'queued',
  source_fingerprint  text not null,
  -- REQ-DSG-014: the Tier A signature the render was checked against, kept so
  -- a failure can be explained rather than only reported.
  tier_a_signature    jsonb,
  rendered_at         timestamptz,
  error               text,
  created_at          timestamptz not null default now(),
  unique (document_id, preset, format, source_fingerprint),
  constraint export_artifacts_ready_has_file check (status <> 'ready' or storage_path is not null),
  constraint export_artifacts_failed_has_error check (status <> 'failed' or error is not null)
);
create index export_artifacts_document on public.export_artifacts (document_id);

-- ═══════════════════════════════════════════════════════════════════════════
-- certificates — 02 §4.12, REQ-CRT-001 … REQ-CRT-014, DEC-010.
--
-- Two identifiers, deliberately. `serial` is sequential, human-facing,
-- gapless, enumerable BY DESIGN, and never appears in a URL.
-- `verification_code` is random, unguessable, and is the ONLY key /verify
-- accepts — otherwise anyone could walk /verify/KM-2026-000001, 000002, …
-- and harvest the name of every person the org ever certified plus which
-- sessions they attended (REQ-CRT-009).
-- ═══════════════════════════════════════════════════════════════════════════
create table public.certificates (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.orgs(id) on delete cascade,
  member_id               uuid not null references public.members(id) on delete cascade,
  kind                    public.certificate_kind not null,
  session_id              uuid references public.sessions(id) on delete cascade,
  -- REQ-CHK-009 made STRUCTURAL: an attendee certificate cannot exist without
  -- the verified check-in event, so no bug in the issuance job can bypass it.
  check_in_id             uuid references public.check_ins(id) on delete restrict,
  badge_id                uuid references public.badges(id) on delete restrict,
  snapshot_id             uuid references public.leaderboard_snapshots(id) on delete restrict,
  serial                  text not null,
  verification_code       text not null unique,
  state                   public.certificate_state not null default 'held',
  template_version_id     uuid not null references public.design_template_versions(id) on delete restrict,
  font_hashes             text[] not null default '{}',
  -- A certificate records what was PRINTED. A member later changing their
  -- display name must not retroactively change a document someone is holding.
  recipient_name_snapshot text not null check (char_length(btrim(recipient_name_snapshot)) between 1 and 200),
  issued_at               timestamptz,
  released_by             uuid references public.members(id),
  revoked_at              timestamptz,
  revoked_by              uuid references public.members(id),
  revocation_reason       text,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint certificates_attendance_needs_check_in
    check (kind <> 'attendance' or check_in_id is not null),
  constraint certificates_session_kinds
    check ((kind in ('attendance', 'presenter')) = (session_id is not null)),
  constraint certificates_achievement_source
    check (kind <> 'achievement' or (badge_id is not null or snapshot_id is not null)),
  constraint certificates_issued_at
    check ((state = 'held') = (issued_at is null)),
  -- REQ-CRT-011: the reason is mandatory, and is never shown on the public page.
  constraint certificates_revocation
    check ((state = 'revoked') = (revoked_at is not null)
           and (revoked_at is null or char_length(btrim(coalesce(revocation_reason, ''))) > 0)),
  -- `orgs.certificate_prefix` is ^[A-Z]{2,5}$ (0004), so the serial is too.
  constraint certificates_serial_shape check (serial ~ '^[A-Z]{2,5}-[0-9]{4}-[0-9]{6}$'),
  -- 22+ random characters (REQ-CRT-009).
  constraint certificates_code_length check (char_length(verification_code) >= 22),
  -- REQ-CRT-003 idempotency: re-running the issuance job produces no duplicates.
  unique (org_id, session_id, member_id, kind),
  unique (org_id, serial)
);
create trigger certificates_updated_at before update on public.certificates
  for each row execute function public.set_updated_at();
-- The session unique above does not cover achievements (session_id is null):
-- `unique` treats NULLs as distinct, so a badge could be certified twice.
create unique index certificates_badge_once
  on public.certificates (org_id, member_id, badge_id) where badge_id is not null;
create unique index certificates_snapshot_once
  on public.certificates (org_id, member_id, snapshot_id) where snapshot_id is not null;
create index certificates_member on public.certificates (member_id);
create index certificates_session on public.certificates (session_id) where session_id is not null;

alter table public.design_documents
  add constraint design_documents_certificate_fk
  foreign key (bound_certificate_id) references public.certificates(id) on delete cascade;

-- ═══════════════════════════════════════════════════════════════════════════
-- certificate_serial_counters — 02 §4.12, REQ-CRT-008, DEC-010.
--
-- A counter row, NOT a Postgres SEQUENCE. A SEQUENCE is non-transactional by
-- design: a rolled-back issuance consumes a number and leaves a hole, and in
-- a certificate register a gap reads as a lost or hidden certificate. The
-- number is allocated by `select … for update` on this row inside the issuing
-- transaction, so a rollback returns it. Volume is hundreds per month (A24),
-- so the row-lock contention this introduces is irrelevant.
--
-- 03 §5.8: NO POLICY AT ALL, and therefore no grant. Touched only inside
-- allocate_serial().
-- ═══════════════════════════════════════════════════════════════════════════
create table public.certificate_serial_counters (
  org_id      uuid not null references public.orgs(id) on delete cascade,
  year        int  not null check (year between 2020 and 2200),
  next_value  int  not null default 1 check (next_value >= 1),
  updated_at  timestamptz not null default now(),
  primary key (org_id, year)
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Functions
-- ═══════════════════════════════════════════════════════════════════════════

-- REQ-CRT-009. 24 URL-safe characters from two v4 UUIDs, which Postgres draws
-- from `pg_strong_random` — a CSPRNG. Deliberately NOT pgcrypto's
-- gen_random_bytes: that needs an extension this database does not install,
-- and adding one to get randomness already present in core would be a new
-- dependency for CI's bare container to carry.
create function public.new_verification_code() returns text
language sql volatile set search_path = '' as $$
  select left(
    translate(
      encode(decode(replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''), 'hex'), 'base64'),
      '+/=', '-_0'),
    24)
$$;
revoke execute on function public.new_verification_code() from public, anon, authenticated;

-- REQ-CRT-008, DEC-010. Gapless, per-org, allocated inside the caller's
-- transaction. `for update` is the whole mechanism: two concurrent issuances
-- serialise on the row, and a rollback returns the number.
create function public.allocate_serial(p_org uuid, p_year int default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_tz     text;
  v_year   int;
  v_prefix text;
  v_next   int;
begin
  select o.certificate_prefix, os.time_zone into v_prefix, v_tz
    from public.orgs o
    left join public.org_settings os on os.org_id = o.id
   where o.id = p_org;
  if v_prefix is null then
    raise exception 'unknown_org: %', p_org using errcode = '23503';
  end if;

  -- The year is the ORG's year, not UTC's: a certificate issued at 02:00
  -- Riyadh on 1 January belongs to the new year on the certificate it prints.
  v_year := coalesce(p_year, extract(year from (now() at time zone coalesce(v_tz, 'UTC')))::int);

  insert into public.certificate_serial_counters (org_id, year)
  values (p_org, v_year)
  on conflict (org_id, year) do nothing;

  select c.next_value into v_next
    from public.certificate_serial_counters c
   where c.org_id = p_org and c.year = v_year
     for update;

  update public.certificate_serial_counters
     set next_value = v_next + 1, updated_at = now()
   where org_id = p_org and year = v_year;

  return v_prefix || '-' || v_year::text || '-' || lpad(v_next::text, 6, '0');
end $$;
revoke execute on function public.allocate_serial(uuid, int) from public, anon, authenticated;
grant  execute on function public.allocate_serial(uuid, int) to service_role;

-- 03 §5.8a. The public verification page's ONLY door — `anon` has no policy on
-- `certificates` at all.
--
-- Three properties an anon RLS policy would not buy: the return type is the
-- allowlist, so a later column addition cannot leak; it is reachable only by
-- `verification_code`, never by `serial`, so /verify/KM-2026-000001 cannot be
-- walked (REQ-CRT-009); and it returns an empty set for both unknown and
-- revoked-but-nonexistent codes, so the caller cannot distinguish never
-- existed from revoked (REQ-CRT-007). The revocation REASON is not in the
-- return type, because this page is public (REQ-CRT-011).
--
-- Rate limiting sits in the Route Handler in front of it (REQ-NFR-005), not
-- here: the limit is per-IP and the database does not see IPs.
create function public.verify_certificate(p_code text)
returns table (recipient_name text, kind public.certificate_kind, session_title text,
               session_date date, achievement_name text, org_name text,
               issued_at timestamptz, state public.certificate_state)
language sql stable security definer set search_path = '' as $$
  select c.recipient_name_snapshot, c.kind, s.title,
         (s.starts_at at time zone coalesce(os.time_zone, 'UTC'))::date,
         b.name, o.name, c.issued_at, c.state
    from public.certificates c
    join public.orgs o on o.id = c.org_id
    left join public.org_settings os on os.org_id = c.org_id
    left join public.sessions s on s.id = c.session_id
    left join public.badges   b on b.id = c.badge_id
   where c.verification_code = p_code
     and c.state in ('issued', 'revoked')
$$;
revoke execute on function public.verify_certificate(text) from public;
grant  execute on function public.verify_certificate(text) to anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Structural triggers (header note 5)
-- ═══════════════════════════════════════════════════════════════════════════

-- REQ-DSG-005, REQ-DSG-021, REQ-DSG-026. Templates only: a resolved instance
-- legitimately carries resolved colours, a template never does.
create function public.design_template_versions_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_layer  jsonb;
  v_colour text;
  v_ids    text[] := '{}';
  v_kinds  text[] := enum_range(null::public.layer_kind)::text[];
begin
  -- org_id mirrors the parent, always (header note 3).
  select t.org_id into new.org_id from public.design_templates t where t.id = new.template_id;

  if new.document->>'schemaVersion' is null then
    raise exception 'document_schema_version_missing' using errcode = '22023';
  end if;
  if jsonb_typeof(new.document->'layers') <> 'array' then
    raise exception 'document_layers_missing' using errcode = '22023';
  end if;
  if (new.document#>>'{background,color}') ~ '^#' then
    raise exception 'hardcoded_colour_in_template: background uses %', new.document#>>'{background,color}'
      using errcode = '22023';
  end if;

  for v_layer in select e.value from jsonb_array_elements(new.document->'layers') as e(value) loop
    if v_layer->>'id' is null then
      raise exception 'layer_id_missing' using errcode = '22023';
    end if;
    if v_layer->>'id' = any(v_ids) then
      raise exception 'layer_id_duplicated: %', v_layer->>'id' using errcode = '22023';
    end if;
    v_ids := v_ids || (v_layer->>'id');

    if v_layer->>'kind' is null or not (v_layer->>'kind' = any(v_kinds)) then
      raise exception 'layer_kind_invalid: %', coalesce(v_layer->>'kind', 'null') using errcode = '22023';
    end if;

    -- REQ-DSG-021. A hex literal here is what makes DEC-008's "one edit in one
    -- place" aspirational instead of true, and it is invisible until an org
    -- changes its brand and one template does not follow.
    foreach v_colour in array array[v_layer->>'color', v_layer#>>'{shape,fill}', v_layer#>>'{shape,stroke}'] loop
      if v_colour ~ '^#' then
        raise exception 'hardcoded_colour_in_template: layer % uses %', v_layer->>'id', v_colour
          using errcode = '22023';
      end if;
    end loop;
  end loop;

  return new;
end $$;

create trigger design_template_versions_guard
  before insert or update on public.design_template_versions
  for each row execute function public.design_template_versions_guard();

-- REQ-DSG-024. A locked region cannot be moved, resized, hidden or deleted in
-- the org editor. Unlocking is a platform-template-level act, not an
-- in-editor one — so a document may not clear `locked` either.
--
-- The QR and serial are locked on every certificate template for an obvious
-- reason: a certificate whose verification QR someone dragged off the page
-- cannot be verified, and that only shows up after it is printed and handed
-- over. An editor-side refusal alone would be the only thing standing between
-- a bug and an unverifiable certificate.
create function public.design_documents_guard() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_template jsonb;
  v_locked   jsonb;
  v_mine     jsonb;
begin
  if new.template_version_id is null then
    return new;
  end if;
  select v.document into v_template
    from public.design_template_versions v where v.id = new.template_version_id;
  if v_template is null or jsonb_typeof(v_template->'layers') <> 'array' then
    return new;
  end if;

  for v_locked in
    select e.value from jsonb_array_elements(v_template->'layers') as e(value)
     where (e.value->>'locked')::boolean is true
  loop
    select e.value into v_mine
      from jsonb_array_elements(new.document->'layers') as e(value)
     where e.value->>'id' = v_locked->>'id'
     limit 1;

    if v_mine is null then
      raise exception 'locked_layer_removed: %', v_locked->>'id' using errcode = '23514';
    end if;
    if v_mine->'frame' is distinct from v_locked->'frame' then
      raise exception 'locked_layer_moved: %', v_locked->>'id' using errcode = '23514';
    end if;
    -- Hidden, and its quieter twin: opacity 0 is hidden with extra steps.
    if coalesce((v_mine->>'hidden')::boolean, false)
       or (v_mine->'opacity' is distinct from v_locked->'opacity') then
      raise exception 'locked_layer_hidden: %', v_locked->>'id' using errcode = '23514';
    end if;
    if coalesce((v_mine->>'locked')::boolean, false) is not true then
      raise exception 'locked_layer_unlocked: %', v_locked->>'id' using errcode = '23514';
    end if;
  end loop;

  return new;
end $$;

create trigger design_documents_guard
  before insert or update on public.design_documents
  for each row execute function public.design_documents_guard();

-- ═══════════════════════════════════════════════════════════════════════════
-- RLS and grants — 03 §5.8, §5.9. Every policy has a grant (invariant 6).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── design_templates — 03 §5.9a, written out there rather than inherited ────
-- The ONE table where a cross-org read is deliberately permitted, and the
-- exception is narrow and explicit: platform templates are readable by every
-- org because D67 requires org admins to duplicate from them. They are NEVER
-- writable by one — `scope = 'org'` appears in every write clause.
alter table public.design_templates enable row level security;
revoke all on public.design_templates from anon, authenticated, service_role;

create policy "templates_read" on public.design_templates for select to authenticated
  using (scope = 'platform' or org_id = public.auth_org_id());
create policy "templates_write_org" on public.design_templates for insert to authenticated
  with check (scope = 'org' and org_id = public.auth_org_id() and public.is_org_admin());
create policy "templates_update_org" on public.design_templates for update to authenticated
  using       (scope = 'org' and org_id = public.auth_org_id() and public.is_org_admin())
  with check  (scope = 'org' and org_id = public.auth_org_id() and public.is_org_admin());
create policy "templates_delete_org" on public.design_templates for delete to authenticated
  using       (scope = 'org' and org_id = public.auth_org_id() and public.is_org_admin());

grant select, insert, update, delete on public.design_templates to authenticated;

-- ── design_template_versions — 03 §5.9: select follows the parent; insert P2
-- on the org branch; NO update and NO delete, because a published version is
-- immutable (REQ-DSG-007 — an artifact references a version, not a template).
alter table public.design_template_versions enable row level security;
revoke all on public.design_template_versions from anon, authenticated, service_role;

create policy "template_versions_read" on public.design_template_versions for select to authenticated
  using (exists (select 1 from public.design_templates t
                  where t.id = template_id
                    and (t.scope = 'platform' or t.org_id = public.auth_org_id())));
create policy "template_versions_insert_org" on public.design_template_versions for insert to authenticated
  with check (public.is_org_admin()
              and exists (select 1 from public.design_templates t
                           where t.id = template_id
                             and t.scope = 'org' and t.org_id = public.auth_org_id()));

grant select, insert on public.design_template_versions to authenticated;

-- ── design_documents — 03 §5.9b, verbatim, plus P2 for writes ──────────────
-- A presenter can see their own session's poster document; a member can see
-- the document behind their own certificate. Neither can edit — REQ-DSG-002
-- makes design an admin act.
alter table public.design_documents enable row level security;
revoke all on public.design_documents from anon, authenticated, service_role;

create policy "documents_read" on public.design_documents for select to authenticated
  using (org_id = public.auth_org_id()
         and (public.is_org_admin()
              or (bound_session_id is not null and public.is_presenter_of(bound_session_id))
              or (bound_certificate_id in (select id from public.certificates
                                            where member_id = public.auth_member_id()))));
create policy "p2_admin_insert" on public.design_documents for insert to authenticated
  with check (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_update" on public.design_documents for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_delete" on public.design_documents for delete to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin());

grant select, insert, update, delete on public.design_documents to authenticated;

-- ── design_assets — 03 §5.9: P1 select, P2 insert, no update, P2 delete ────
-- No update policy at all: an asset's sniffed type, size and hash describe
-- bytes that already landed. Changing them would be describing different bytes
-- (DEC-009 — the sniff is the authority, and it happens once).
alter table public.design_assets enable row level security;
revoke all on public.design_assets from anon, authenticated, service_role;

create policy "p1_org_read" on public.design_assets for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p2_admin_insert" on public.design_assets for insert to authenticated
  with check (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_delete" on public.design_assets for delete to authenticated
  using (org_id = public.auth_org_id() and public.is_org_admin());

grant select, insert, delete on public.design_assets to authenticated;

-- ── export_artifacts — 03 §5.9: select follows the document; job-written ───
alter table public.export_artifacts enable row level security;
revoke all on public.export_artifacts from anon, authenticated, service_role;

create policy "exports_read" on public.export_artifacts for select to authenticated
  using (org_id = public.auth_org_id()
         and exists (select 1 from public.design_documents d where d.id = document_id));
-- No insert/update/delete policy for `authenticated`: the render job writes
-- these rows as service_role, which bypasses RLS.

grant select on public.export_artifacts to authenticated;

-- ── fonts — 03 §5.9: P1 read; parity_status written by the job only ────────
-- Readable by every authenticated member because the manifest IS platform-wide
-- (header note 2): the bucket is content-addressed and shared for the same
-- reason. The picker filters on `parity_status = 'passed'`; the table does not
-- hide a pending font, it marks it (06 §7.2 — the admin is told WHICH goldens
-- failed, which is an answer rather than a refusal).
alter table public.fonts enable row level security;
revoke all on public.fonts from anon, authenticated, service_role;

create policy "fonts_read" on public.fonts for select to authenticated
  using (true);

grant select on public.fonts to authenticated;

-- ── session_posters — 03 §5.9: P1 select, P2 insert, P2 update, no delete ──
-- No delete: REQ-DSG-001 says no session reaches `published` without a poster,
-- so deleting the row would undo the gate after the fact. A poster is replaced,
-- never removed.
alter table public.session_posters enable row level security;
revoke all on public.session_posters from anon, authenticated, service_role;

create policy "p1_org_read" on public.session_posters for select to authenticated
  using (org_id = public.auth_org_id());
create policy "p2_admin_insert" on public.session_posters for insert to authenticated
  with check (org_id = public.auth_org_id() and public.is_org_admin());
create policy "p2_admin_update" on public.session_posters for update to authenticated
  using       (org_id = public.auth_org_id() and public.is_org_admin())
  with check  (org_id = public.auth_org_id() and public.is_org_admin());

grant select, insert, update on public.session_posters to authenticated;

-- ── certificates — 03 §5.8a, verbatim ──────────────────────────────────────
-- `anon` gets no policy on this table, at all. The public verification page
-- goes through verify_certificate() above, whose return type is the allowlist.
alter table public.certificates enable row level security;
revoke all on public.certificates from anon, authenticated, service_role;

create policy "certs_read_self_or_admin" on public.certificates for select to authenticated
  using (org_id = public.auth_org_id()
         and state <> 'held'                                  -- REQ-CRT-004
         and (member_id = public.auth_member_id() or public.is_org_admin()));
-- Admins additionally see held certificates awaiting release (REQ-CRT-004).
create policy "certs_read_held_admin" on public.certificates for select to authenticated
  using (org_id = public.auth_org_id() and public.is_org_admin());

grant select on public.certificates to authenticated;
-- Insert, update and delete are P5: issuance allocates a serial under a lock,
-- release and revocation write an audit row in the same transaction. No policy
-- can express either, so no policy exists.

-- ── certificate_serial_counters — 03 §5.8: NO POLICY AT ALL ────────────────
-- RLS enabled, nothing granted: every client role fails on the grant. Touched
-- only inside allocate_serial(), which is SECURITY DEFINER.
alter table public.certificate_serial_counters enable row level security;
revoke all on public.certificate_serial_counters from anon, authenticated, service_role;

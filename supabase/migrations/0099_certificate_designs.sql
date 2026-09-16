-- promoted by the lead from supabase/proposed/designer/0003_certificate_designs.sql (wave 8, DEC-148)
-- designer (wave 8) — the certificate design chosen for a session, and the scheme pinned on a certificate.
-- Follows designer/0002 (the certificate library), 0088 (issue_certificate's
-- current text), 0082 (certificate_render_context's), 0065.
--
-- Serves:  REQ-CRT-001 … REQ-CRT-004 (issuance, held, release), REQ-CRT-014
--          (reissue is byte-reproducible: the scheme is pinned beside the
--          template version and the font hashes), REQ-DSG-007, REQ-DSG-026
-- Cites:   DEC-128 (a certificate is a library choice made at issue time),
--          DEC-148 (a row is a composition; the scheme is pinned where the
--          render is decided; ENT-session_certificate_designs and
--          certificates.scheme approved as an amendment to frozen 02 §4.12),
--          DEC-141 (the removed check-in), DEC-043, 11 §2.5
--
-- 03 §8.2 ROWS THIS FILE NEEDS:
--   | `POL-session_certificate_designs.select_staff` | An admin and a moderator of the org read a session's certificate design; a member does not; another org's staff do not. |
--   | `POL-session_certificate_designs.no_write_grant` | An authenticated insert, update or delete is refused (42501) — the only writer is `set_certificate_design()`. |
--   | `RPC-set_certificate_design.admin` | An admin sets (and resets) the design, audited as `certificate.design_set`; a moderator is refused (42501). |
--   | `RPC-set_certificate_design.family_matches_kind` | A template of another family, a poster template, a retired one or another org's is refused (22023). |
--   | `RPC-set_certificate_design.locked_after_issue` | Once a certificate of that kind for that session is `issued` or `revoked`, the design is refused (55000); while they are `held` it may change. |
--   | `RPC-issue_certificate.pins_design` | A certificate issued for a session with a design pins that template's latest PUBLISHED version and its scheme. |
--   | `RPC-issue_certificate.no_design_is_default_light` | With no design, the org's default of the family, else the platform's, and `light` — every certificate before this file. |
--   | `RPC-issue_certificate.no_check_in_when_removed` | Kept from 0088: a late job for a removed check-in raises `no_check_in`. |
--   | `RPC-redesign_held_certificates.held_only` | Re-pins the HELD certificates of a kind to the current design and re-enqueues each render with 11 §2.5's key; issued and revoked ones are untouched; audited; a moderator is refused. |
--   | `RPC-record_certificate_document.follows_the_pin` | The certificate's document follows its pinned version, so a redesigned held certificate is not refused by the locked-region guard. |
--
-- ★ WHY A TABLE AND NOT A CHOICE MADE AT A BUTTON. Automatic issuance has no
-- human at issue time: it is the edge into `completed`
-- (`sessions_certificate_hook`, 0065). So the choice DEC-128 puts "at issue
-- time" has to exist BEFORE completion, per session and per kind — attendance
-- and presenter are different families — and be read by the issuance itself.
-- No row means today's behaviour exactly: the family default, light.
--
-- ★ WHY THE SCHEME IS A COLUMN ON `certificates`. A reissue in 2031 must
-- render as the certificate was issued (REQ-CRT-014), and the pinned template
-- version and font hashes cannot say light or dark — a scheme is never a row
-- (DEC-148). The default `light` is TRUE of every existing row: every
-- certificate issued before this file rendered light.
--
-- ★ `issue_certificate()` IS RE-CREATED FROM 0088's TEXT, not 0065's: 0088
-- (checkin, DEC-141) made the attendance check-in exclude a removed one. The
-- whole body below is 0088's with three changes, each marked «wave 8».

-- ── the scheme ─────────────────────────────────────────────────────────────
create type public.brand_scheme as enum ('light', 'dark');

alter table public.certificates
  add column scheme public.brand_scheme not null default 'light';
comment on column public.certificates.scheme is
  'DEC-148: the palette this certificate renders in, pinned at issue beside template_version_id and font_hashes (REQ-CRT-014). Default light is true of every certificate issued before wave 8.';

-- ── ENT-session_certificate_designs ────────────────────────────────────────
create table public.session_certificate_designs (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.orgs(id) on delete cascade,
  session_id   uuid not null references public.sessions(id) on delete cascade,
  -- Achievement certificates have no session; their design is the family
  -- default until a later wave gives badges one.
  kind         public.certificate_kind not null check (kind in ('attendance', 'presenter')),
  -- The TEMPLATE, not a version: a certificate pins the latest published
  -- version at the moment it is issued, so an org that publishes v3 before a
  -- session completes gets v3.
  template_id  uuid not null references public.design_templates(id) on delete restrict,
  scheme       public.brand_scheme not null default 'light',
  updated_by   uuid references public.members(id),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (session_id, kind)
);
create trigger session_certificate_designs_updated_at before update on public.session_certificate_designs
  for each row execute function public.set_updated_at();
create index session_certificate_designs_org on public.session_certificate_designs (org_id);

alter table public.session_certificate_designs enable row level security;
revoke all on public.session_certificate_designs from anon, authenticated, service_role;

-- Staff read: SCR-045 shows the design to the admin who sets it and the
-- moderator who can see the session's certificates.
create policy "certificate_designs_read_staff" on public.session_certificate_designs for select to authenticated
  using (org_id = public.auth_org_id() and public.is_staff());
grant select on public.session_certificate_designs to authenticated;
-- No insert, update or delete grant and no write policy: the only writer is
-- `set_certificate_design()`, which re-reads the admin's role and audits.

-- ── the latest PUBLISHED version of a certificate template ─────────────────
create function public.certificate_template_latest_version(p_template uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select v.id from public.design_template_versions v
   where v.template_id = p_template and v.published_at is not null
   order by v.version desc limit 1
$$;
revoke execute on function public.certificate_template_latest_version(uuid) from public, anon, authenticated;
grant  execute on function public.certificate_template_latest_version(uuid) to service_role;

-- ── set_certificate_design ─────────────────────────────────────────────────
create function public.set_certificate_design(
  p_session  uuid,
  p_kind     public.certificate_kind,
  p_template uuid,
  p_scheme   public.brand_scheme
) returns public.session_certificate_designs
language plpgsql security definer set search_path = '' as $$
declare
  actor    public.members := public.assert_fresh_admin();
  v_before public.session_certificate_designs;
  v_row    public.session_certificate_designs;
begin
  if not exists (select 1 from public.sessions s where s.id = p_session and s.org_id = actor.org_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_kind not in ('attendance', 'presenter') or p_scheme is null then
    raise exception 'design_invalid' using errcode = '22023';
  end if;

  -- The family IS the kind: an attendance certificate carries «شهادة حضور»
  -- in its own document. And the template must be this org's or the
  -- platform's, live, with something published to pin.
  if not exists (
    select 1 from public.design_templates t
     where t.id = p_template and t.purpose = 'certificate' and t.family = p_kind::text
       and t.retired_at is null and (t.org_id = actor.org_id or (t.scope = 'platform' and t.org_id is null))
  ) or public.certificate_template_latest_version(p_template) is null then
    raise exception 'template_invalid' using errcode = '22023';
  end if;

  -- ★ Locked once any certificate of this kind has reached a member. A held
  -- one is invisible and unemailed (REQ-CRT-004), so it may still change —
  -- that is what `redesign_held_certificates()` is for.
  if exists (
    select 1 from public.certificates c
     where c.session_id = p_session and c.kind = p_kind and c.state in ('issued', 'revoked')
  ) then
    raise exception 'design_locked' using errcode = '55000';
  end if;

  select * into v_before from public.session_certificate_designs d where d.session_id = p_session and d.kind = p_kind;

  insert into public.session_certificate_designs (org_id, session_id, kind, template_id, scheme, updated_by)
  values (actor.org_id, p_session, p_kind, p_template, p_scheme, actor.id)
  on conflict (session_id, kind) do update
    set template_id = excluded.template_id, scheme = excluded.scheme, updated_by = excluded.updated_by
  returning * into v_row;

  perform public.write_audit(actor.org_id, 'certificate.design_set', 'session', p_session,
                             case when v_before.id is null then null else jsonb_build_object('template_id', v_before.template_id, 'scheme', v_before.scheme) end,
                             jsonb_build_object('kind', p_kind, 'template_id', p_template, 'scheme', p_scheme));
  return v_row;
end $$;
revoke execute on function public.set_certificate_design(uuid, public.certificate_kind, uuid, public.brand_scheme) from public, anon;
grant  execute on function public.set_certificate_design(uuid, public.certificate_kind, uuid, public.brand_scheme) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- issue_certificate — 0088's text, with three wave-8 changes.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.issue_certificate(
  p_session uuid,
  p_member  uuid,
  p_kind    public.certificate_kind,
  p_template_version uuid default null,
  p_font_hashes text[] default '{}'
) returns public.certificates
language plpgsql security definer set search_path = '' as $$
declare
  v_org      uuid;
  v_mode     public.certificate_mode;
  v_check_in uuid;
  v_name     text;
  v_version  uuid := p_template_version;
  v_scheme   public.brand_scheme := 'light';
  v_design   public.session_certificate_designs;
  v_row      public.certificates;
begin
  select s.org_id, s.certificate_mode into v_org, v_mode from public.sessions s where s.id = p_session;
  if v_org is null then
    raise exception 'unknown_session' using errcode = '42704';
  end if;
  if v_mode = 'off' then
    raise exception 'certificates_off' using errcode = '42501';
  end if;

  -- REQ-CRT-003: idempotent. Re-running the job returns what exists rather
  -- than allocating a second serial for the same person.
  select * into v_row from public.certificates c
   where c.org_id = v_org and c.session_id = p_session and c.member_id = p_member and c.kind = p_kind;
  if v_row.id is not null then
    return v_row;
  end if;

  if p_kind = 'attendance' then
    -- ★ RE-DERIVED, never taken from the payload — and, DEC-141, excludes a
    -- removed check-in. A late job for one raises the SAME `no_check_in` it
    -- already raises for a member who never checked in.
    select c.id into v_check_in from public.check_ins c
     where c.session_id = p_session and c.member_id = p_member and c.removed_at is null limit 1;
    if v_check_in is null then
      raise exception 'no_check_in' using errcode = '42501';
    end if;
  end if;

  -- The name AS PRINTED, frozen here. A member changing their display name
  -- later must not retroactively change a document someone is holding
  -- (REQ-CRT-014).
  select m.display_name into v_name from public.members m where m.id = p_member;
  if v_name is null then
    raise exception 'unknown_member' using errcode = '42704';
  end if;

  -- wave 8 (1): the design chosen for this session and kind, when there is
  -- one — its template's latest PUBLISHED version, and its scheme (DEC-128).
  select * into v_design from public.session_certificate_designs d where d.session_id = p_session and d.kind = p_kind;
  if v_design.id is not null then
    v_scheme := v_design.scheme;
    if v_version is null then
      v_version := public.certificate_template_latest_version(v_design.template_id);
    end if;
  end if;

  if v_version is null then
    -- The org's default certificate template for this kind, else the
    -- platform's. Pinned on the row, so reissuing in 2031 renders as today.
    -- wave 8 (2): published versions only — a draft is not a certificate.
    select v.id into v_version
      from public.design_templates t
      join public.design_template_versions v on v.template_id = t.id
     where t.purpose = 'certificate' and t.retired_at is null
       and t.family = (case when p_kind = 'presenter' then 'presenter' else 'attendance' end)
       and (t.org_id = v_org or t.org_id is null)
       and v.published_at is not null
     order by (t.org_id is not null) desc, t.is_default desc, v.version desc
     limit 1;
  end if;
  if v_version is null then
    raise exception 'no_certificate_template' using errcode = '42704';
  end if;

  insert into public.certificates (
    org_id, member_id, kind, session_id, check_in_id, serial, verification_code, state,
    template_version_id, font_hashes, recipient_name_snapshot, issued_at, scheme
  ) values (
    v_org, p_member, p_kind, p_session, v_check_in,
    -- ★ Inside this transaction. A rollback returns the number (DEC-010).
    public.allocate_serial(v_org),
    public.new_verification_code(),
    -- D50: automatic issues; review HOLDS, invisible and unemailed
    -- (REQ-CRT-004).
    case when v_mode = 'review' then 'held' else 'issued' end::public.certificate_state,
    v_version, coalesce(p_font_hashes, '{}'), v_name,
    case when v_mode = 'review' then null else now() end,
    -- wave 8 (3): the scheme, pinned (REQ-CRT-014, DEC-148).
    v_scheme
  ) returning * into v_row;

  perform public.write_audit(v_org, 'certificate.issued', 'certificate', v_row.id, null,
                             jsonb_build_object('kind', p_kind, 'serial', v_row.serial, 'state', v_row.state, 'scheme', v_row.scheme));
  return v_row;
end $$;

-- ── redesign_held_certificates ─────────────────────────────────────────────
-- Review mode only (D50): certificates generated and HELD at completion are
-- invisible and unemailed, so they may take a design chosen after the fact.
-- Each is re-pinned and its render re-enqueued with 11 §2.5's key — the key
-- MOVES a pending job rather than adding one, and `issue_certificates`
-- returns the existing row and renders it under the new fingerprint. The
-- serial is untouched.
create function public.redesign_held_certificates(p_session uuid, p_kind public.certificate_kind) returns int
language plpgsql security definer set search_path = '' as $$
declare
  actor     public.members := public.assert_fresh_admin();
  v_design  public.session_certificate_designs;
  v_version uuid;
  v_row     public.certificates;
  v_n       int := 0;
begin
  if not exists (select 1 from public.sessions s where s.id = p_session and s.org_id = actor.org_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  select * into v_design from public.session_certificate_designs d where d.session_id = p_session and d.kind = p_kind;
  if v_design.id is null then
    raise exception 'no_design' using errcode = '22023';
  end if;
  v_version := public.certificate_template_latest_version(v_design.template_id);
  if v_version is null then
    raise exception 'template_invalid' using errcode = '22023';
  end if;

  for v_row in
    update public.certificates c
       set template_version_id = v_version, scheme = v_design.scheme
     where c.session_id = p_session and c.kind = p_kind and c.org_id = actor.org_id and c.state = 'held'
     returning *
  loop
    perform public.enqueue_job(
      'issue_certificates',
      jsonb_build_object('session_id', p_session, 'member_id', v_row.member_id, 'kind', p_kind),
      'cert:' || p_session::text || ':' || v_row.member_id::text || ':' || p_kind::text,
      null, 'render', 3
    );
    v_n := v_n + 1;
  end loop;

  perform public.write_audit(actor.org_id, 'certificate.redesigned', 'session', p_session, null,
                             jsonb_build_object('kind', p_kind, 'count', v_n, 'template_version_id', v_version, 'scheme', v_design.scheme));
  return v_n;
end $$;
revoke execute on function public.redesign_held_certificates(uuid, public.certificate_kind) from public, anon;
grant  execute on function public.redesign_held_certificates(uuid, public.certificate_kind) to authenticated;

-- ── record_certificate_document — follows the pin ──────────────────────────
-- 0065's body, with the document's `template_version_id` kept equal to the
-- certificate's. Without it a redesigned held certificate's new document is
-- compared, by `design_documents_guard`, against the OLD version's locked
-- regions — a portrait QR «moved» from where a landscape one was.
create or replace function public.record_certificate_document(p_certificate uuid, p_document jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.certificates;
  v_id  uuid;
begin
  select * into v_row from public.certificates where id = p_certificate;
  if v_row.id is null then
    raise exception 'unknown_certificate' using errcode = '42704';
  end if;

  select d.id into v_id from public.design_documents d where d.bound_certificate_id = p_certificate limit 1;
  if v_id is not null then
    update public.design_documents
       set document = p_document, template_version_id = v_row.template_version_id
     where id = v_id;
    return v_id;
  end if;

  insert into public.design_documents (org_id, template_version_id, purpose, document, bound_certificate_id)
  values (v_row.org_id, v_row.template_version_id, 'certificate', p_document, p_certificate)
  returning id into v_id;
  return v_id;
end $$;

-- ── certificate_render_context — the scheme joins it ───────────────────────
-- 0082's text with `scheme` added; a return type cannot be replaced in place.
drop function public.certificate_render_context(uuid);
create function public.certificate_render_context(p_certificate uuid)
returns table (
  certificate_id uuid, org_id uuid, member_id uuid, state public.certificate_state,
  serial text, verification_code text, issued_at timestamptz, recipient_name text,
  kind public.certificate_kind, session_title text, achievement_name text,
  org_name text, org_time_zone text,
  template_version_id uuid, template_document jsonb, document_id uuid,
  scheme public.brand_scheme
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.org_id, c.member_id, c.state, c.serial, c.verification_code, c.issued_at,
         c.recipient_name_snapshot, c.kind, s.title, b.name, o.name,
         coalesce(os.time_zone, 'Asia/Riyadh'),
         c.template_version_id, v.document,
         (select d.id from public.design_documents d where d.bound_certificate_id = c.id limit 1),
         c.scheme
    from public.certificates c
    join public.orgs o on o.id = c.org_id
    left join public.org_settings os on os.org_id = c.org_id
    left join public.sessions s on s.id = c.session_id
    left join public.badges b on b.id = c.badge_id
    join public.design_template_versions v on v.id = c.template_version_id
   where c.id = p_certificate
$$;
revoke execute on function public.certificate_render_context(uuid) from public, anon, authenticated;
grant  execute on function public.certificate_render_context(uuid) to service_role;

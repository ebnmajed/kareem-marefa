-- content, follow-up — REQ-PRO-004, deferred from M2 (DEC-045: the entity
-- `materials` needed to exist, and it didn't until this track's own 0037).
-- "Draft مواد attached to a proposal are visible to admins only until the
-- session is published. They obey every materials rule. On publication
-- they carry over to the session, retaining their availability flag."
--
-- `materials.session_id` was `not null` ("REQ-MAT-001: no standalone
-- uploads") — this relaxes that to an either/or: a material belongs to a
-- session XOR a proposal, never both, never neither. Every policy that
-- read `session_id` gets a parallel proposal branch rather than a rewrite:
-- `is_presenter_of(session_id)` already returns false (never raises) for a
-- null session_id, since it is not `strict` and the inner `sp.session_id =
-- null` comparison is simply UNKNOWN — so the session branches below are
-- copied verbatim from 0037, not re-derived, and only the proposal branch
-- and the `is_staff()` shortcut (pulled to the top level, logically
-- unchanged) are new.
--
-- The carry-over is a TRIGGER on `public.sessions`, not a change to
-- whichever RPC the `sessions` track's own publish flow calls — the same
-- "additive schema DDL on a table this track does not own the app code
-- for" pattern 0037 already used for `sessions.search_vector` (its own
-- header comment). It fires on ANY session insert naming a `proposal_id`,
-- regardless of which door created it, so nothing in `sessions`' own RPCs
-- has to change or even know this exists.
--
-- Serves:  REQ-PRO-004
-- Cites:   0010 (proposals, proposal_presenters, is_presenter_of) · 0037
--          (materials, materials_read, p8_presenter_write, materials_
--          update_presenter, materials_guard, materials_storage_read/write)
--
-- 03 §8.2 rows this adds:
--   | `POL-materials.proposal.visibility` | A proposal's own materials are
--     visible to its proposer, an accepted co-presenter, and staff — never
--     to a plain member — until the proposal becomes a session. |
--   | `POL-materials.proposal.write` | The same three may upload/update a
--     proposal's materials; nobody else. |
--   | `RPC-carry_over_proposal_materials.trigger` | A session inserted with
--     a `proposal_id` reassigns every material with that `proposal_id` to
--     the new session (`session_id` set, `proposal_id` cleared), leaving
--     `phase`/`allow_download` untouched. |
--   | `POL-storage.materials.proposal_write` | The `materials` bucket's
--     write policy accepts a `{org}/proposals/{proposal_id}/materials/…`
--     prefix for the proposal's owner/co-presenter/staff, the same shape
--     the `{org}/sessions/{session_id}/materials/…` prefix already had. |

alter table public.materials alter column session_id drop not null;
alter table public.materials add column proposal_id uuid references public.proposals(id) on delete cascade;
alter table public.materials add constraint materials_session_xor_proposal
  check ((session_id is not null) <> (proposal_id is not null));
create index materials_org_proposal_idx on public.materials (org_id, proposal_id) where proposal_id is not null;

-- Mirrors is_presenter_of()'s shape (0010) for a proposal: the proposer, or
-- an ACCEPTED co-presenter — declined/pending invitees do not get write
-- access to someone else's draft materials.
create function public.is_proposal_owner_of(p_proposal uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.proposals p where p.id = p_proposal and p.proposer_id = public.auth_member_id())
      or exists (select 1 from public.proposal_presenters pp
                  where pp.proposal_id = p_proposal and pp.member_id = public.auth_member_id() and pp.accepted)
$$;
grant execute on function public.is_proposal_owner_of(uuid) to authenticated, anon, service_role;

-- ── materials table policies — drop and recreate with the proposal branch ──
drop policy "materials_read" on public.materials;
create policy "materials_read" on public.materials for select to authenticated       -- 03 §5.5a, amended
  using (org_id = public.auth_org_id()
         and removed_at is null
         and (
           (session_id is not null and (
             phase = 'before'
             or exists (select 1 from public.sessions s
                         where s.id = materials.session_id
                           and s.state in ('completed', 'archived'))
             or public.is_presenter_of(session_id)
           ))
           or (proposal_id is not null and public.is_proposal_owner_of(proposal_id))
           or public.is_staff()
         ));

drop policy "p8_presenter_write" on public.materials;
create policy "p8_presenter_write" on public.materials for insert to authenticated
  with check (org_id = public.auth_org_id()
              and (
                (session_id is not null and (public.is_presenter_of(session_id) or public.is_org_admin()))
                or (proposal_id is not null and (public.is_proposal_owner_of(proposal_id) or public.is_org_admin()))
              ));

drop policy "materials_update_presenter" on public.materials;
create policy "materials_update_presenter" on public.materials for update to authenticated
  using       (org_id = public.auth_org_id() and (
                (session_id is not null and public.is_presenter_of(session_id))
                or (proposal_id is not null and public.is_proposal_owner_of(proposal_id))
              ))
  with check  (org_id = public.auth_org_id() and (
                (session_id is not null and public.is_presenter_of(session_id))
                or (proposal_id is not null and public.is_proposal_owner_of(proposal_id))
              ));
-- materials_update_admin, materials_delete_admin: untouched — is_org_admin() does not
-- distinguish session-owned from proposal-owned rows.

-- materials_guard (0037) blocks session_id/kind/added_by from ever changing — carve
-- out exactly the one legitimate transition the carry-over trigger below performs,
-- verified against a REAL session row that actually descends from that proposal
-- (never trust "this looks like a carry-over" from the new values alone).
create or replace function public.materials_guard() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_is_carry_over boolean := false;
begin
  if old.session_id is null and old.proposal_id is not null and new.session_id is not null and new.proposal_id is null then
    v_is_carry_over := exists (select 1 from public.sessions s where s.id = new.session_id and s.proposal_id = old.proposal_id);
  end if;

  if not v_is_carry_over and (new.session_id is distinct from old.session_id or new.proposal_id is distinct from old.proposal_id) then
    raise exception 'immutable_columns' using errcode = '42501';
  end if;
  if new.kind is distinct from old.kind or new.added_by is distinct from old.added_by then
    raise exception 'immutable_columns' using errcode = '42501';
  end if;

  new.updated_at := now();
  return new;
end $$;

-- REQ-PRO-004: "On publication they carry over to the session, retaining
-- their availability flag" — phase/allow_download are untouched here. A
-- pdf/powerpoint material was never enqueued for conversion while it was
-- still a draft (finalize_material_upload, amended below, skips the
-- enqueue when session_id is null — 07 §4.1's pipeline needs a real
-- session_id to build a storage path from); this is where that deferred
-- enqueue happens, now that one exists.
create function public.carry_over_proposal_materials() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  if new.proposal_id is null then
    return new;
  end if;

  for r in
    update public.materials
       set session_id = new.id, proposal_id = null
     where proposal_id = new.proposal_id
    returning id, kind, current_version_id, render_status
  loop
    if r.kind in ('pdf', 'powerpoint') and r.current_version_id is not null and r.render_status = 'pending' then
      perform public.enqueue_job(
        'convert_document',
        jsonb_build_object('version_id', r.current_version_id, 'material_id', r.id),
        'conv:' || r.current_version_id::text
      );
    end if;
  end loop;

  return new;
end $$;
create trigger sessions_carry_over_proposal_materials after insert on public.sessions
  for each row execute function public.carry_over_proposal_materials();

-- ── finalize_material_upload (0046), remove_material (0037) — amended ──
-- Both re-derive authority from `session_id` alone today; both get a
-- parallel `proposal_id` branch. `create or replace` keeps every existing
-- grant (0046/0037 already granted `authenticated` execute on both).
create or replace function public.finalize_material_upload(
  p_material_id  uuid,
  p_storage_path text,
  p_byte_size    bigint,
  p_sniffed_mime text,
  p_sha256       text
) returns public.material_versions
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id       uuid;
  v_session_id   uuid;
  v_proposal_id  uuid;
  v_kind         public.material_kind;
  v_is_admin     boolean := public.is_org_admin();
  v_next_version int;
  v_limit_mb     int;
  v_render       public.render_status;
  v_version      public.material_versions;
begin
  select m.org_id, m.session_id, m.proposal_id, m.kind into v_org_id, v_session_id, v_proposal_id, v_kind
    from public.materials m
   where m.id = p_material_id;
  if v_org_id is null or v_org_id is distinct from public.auth_org_id() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (v_is_admin
          or (v_session_id is not null and public.is_presenter_of(v_session_id))
          or (v_proposal_id is not null and public.is_proposal_owner_of(v_proposal_id))) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select case v_kind
           when 'audio' then limit_audio_mb
           when 'image' then limit_image_mb
           else limit_document_mb
         end
    into v_limit_mb
    from public.org_settings where org_id = v_org_id;
  if p_byte_size > v_limit_mb::bigint * 1024 * 1024 then
    raise exception 'file_too_large: byte_size % exceeds the % MB limit for kind %', p_byte_size, v_limit_mb, v_kind
      using errcode = '23514';
  end if;

  select coalesce(max(version), 0) + 1 into v_next_version
    from public.material_versions where material_id = p_material_id;

  insert into public.material_versions (org_id, material_id, version, storage_path, byte_size, sniffed_mime, sha256, uploaded_by)
  values (v_org_id, p_material_id, v_next_version, p_storage_path, p_byte_size, p_sniffed_mime, p_sha256, public.auth_member_id())
  returning * into v_version;

  v_render := case when v_kind in ('pdf', 'powerpoint') then 'pending' else 'not_applicable' end;

  update public.materials
     set current_version_id = v_version.id, render_status = v_render, updated_at = now()
   where id = p_material_id;

  -- A proposal's own material is never enqueued for conversion while still a
  -- draft — 07 §4.1's pipeline needs a real session_id to build a storage
  -- path from, and this one has none yet. carry_over_proposal_materials()
  -- enqueues it once the proposal becomes a session (above).
  if v_render = 'pending' and v_session_id is not null then
    perform public.enqueue_job('convert_document', jsonb_build_object('version_id', v_version.id, 'material_id', p_material_id), 'conv:' || v_version.id::text);
  end if;

  return v_version;
end $$;

create or replace function public.remove_material(p_material_id uuid, p_reason text) returns public.materials
language plpgsql security definer set search_path = '' as $$
declare
  v_org_id uuid;
  v_session_id uuid;
  v_proposal_id uuid;
  v_is_admin boolean := public.is_org_admin();
  v_session_closed boolean;
  v_row public.materials;
begin
  select m.org_id, m.session_id, m.proposal_id into v_org_id, v_session_id, v_proposal_id
    from public.materials m
   where m.id = p_material_id and m.removed_at is null;
  if v_org_id is null or v_org_id is distinct from public.auth_org_id() then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not (v_is_admin
          or (v_session_id is not null and public.is_presenter_of(v_session_id))
          or (v_proposal_id is not null and public.is_proposal_owner_of(v_proposal_id))) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise exception 'reason_required' using errcode = '23514';
  end if;
  -- v_session_id is null for a proposal's own material — the lookup below
  -- then matches no row, v_session_closed stays null, and `if null and …`
  -- is false in PL/pgSQL, so this is skipped rather than raising (there is
  -- no "session completed" concept for a draft that has no session yet).
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

-- ── storage.objects — materials bucket, amended ─────────────────────────
-- materials/{org_id}/proposals/{proposal_id}/materials/{version_id}/{filename}
-- — same segment shape and position as the session path (org/‹kind›/id/
-- materials/version/filename), so `(storage.foldername(name))[5]` (the
-- version id the read policy joins on) is identical either way.
drop policy "materials_storage_write" on storage.objects;
create policy "materials_storage_write" on storage.objects for insert to authenticated
  with check (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and (
      ((storage.foldername(name))[2] = 'sessions'
        and (public.is_presenter_of(nullif((storage.foldername(name))[3], '')::uuid) or public.is_staff()))
      or ((storage.foldername(name))[2] = 'proposals'
        and (public.is_proposal_owner_of(nullif((storage.foldername(name))[3], '')::uuid) or public.is_staff()))
    )
  );

drop policy "materials_storage_read" on storage.objects;
create policy "materials_storage_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = public.auth_org_id()::text
    and exists (
      select 1 from public.material_versions mv
        join public.materials m on m.id = mv.material_id
        left join public.sessions s on s.id = m.session_id
       where mv.id = nullif((storage.foldername(name))[5], '')::uuid
         and m.removed_at is null
         and (
           (m.session_id is not null and (m.phase = 'before' or s.state in ('completed', 'archived') or public.is_presenter_of(m.session_id)))
           or (m.proposal_id is not null and public.is_proposal_owner_of(m.proposal_id))
           or public.is_staff()
         )
         and (
           m.allow_download
           or (m.session_id is not null and public.is_presenter_of(m.session_id))
           or (m.proposal_id is not null and public.is_proposal_owner_of(m.proposal_id))
           or public.is_staff()
         )
    )
  );

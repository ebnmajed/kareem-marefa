-- 0212 — Inactive claims carry no org; a platform admin is never a member; members cannot forge a broadcast or claim
-- a sign-in domain another org holds; staff alone download a photograph; a member listens to a recording and never fetches an original
-- file; a rejected upload can be deleted; four indexes. DEC-265, DEC-266. REQ-NFR-001, REQ-TEN-003, REQ-ADM-002,
-- REQ-ADM-003, REQ-ADM-021, REQ-EVT-004, REQ-MAT-005, REQ-MAT-007, REQ-MAT-012.
--
-- Found by the QA sweep (DEC-265), each verified against the database at 0211; approved by the owner on 2026-10-06
-- with the rulings recorded in DEC-266.
--
-- 1. ★ custom_access_token_hook() (0069) wrote org_id and org_role whatever the member's status and the org's, and no
--    policy read status or org_status — so a deactivated member, and every member of a suspended org, kept the whole
--    of RLS for as long as their refresh token lived. auth_org_id() and auth_org_role() now answer null unless the
--    token says both are active. The hook keeps both claims, which the app needs to send the person to the right
--    screen. A token with neither claim — none the hook issues — reads as active.
-- 2. ★ The owner's ruling: a platform admin is never a member and never uses the app as one. The hook gives a platform
--    admin no member claims (impersonation is their one way in); provision_member() never creates or binds a row for
--    one; members refuses a row whose address or auth user is a platform admin's.
-- 3. realtime_session_insert (0016) let any member broadcast on session:<id>, which the event page renders as a
--    comment. Nothing in the browser sends; the server broadcasts from definer triggers. Dropped.
-- 4. org_domains was unique only per org, so an org admin could add another org's domain on the settings page, and
--    provision_member() then offered that org to the other org's people. An org admin now cannot put a domain another
--    org holds on their list; the platform still can (the choose-org case, SCR-003), and the admin still edits their
--    own org's list (save_org_settings(), SCR-063).
-- 5. ★ The owner's ruling: a member never downloads a photograph — record_photo_download() is staff's.
-- 6. ★ materials_storage_read matched an object to its version by the id in the path, but finalize_material_upload()
--    mints its own id — so no real upload ever matched, and a member could neither fetch the source NOR stream an
--    audio recording. It now matches the version's exact stored path, which repairs every existing version with no
--    data change. ★ The owner's ruling: a member reads an original only to listen to it — an audio material with
--    listening allowed; a PDF's original is presenters', the proposal's owner's and staff's. finalize_material_upload()
--    now holds the client's path to the builder's shape for that material.
-- 7. A rejected upload (REQ-MAT-012, DEC-009) was «removed» by a call with no delete policy behind it — a silent no-op
--    that left the object readable to staff and the presenter. Its uploader may now delete an object no version or
--    asset row points at.
-- 8. Indexes the reversal lookup (every event page) and three cascades scan without.
--
-- Additive in what main's app sends: no column, no table, no changed signature.

-- ── 1 ────────────────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.auth_org_id()
returns uuid
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce(auth.jwt() -> 'app_metadata' ->> 'status', 'active') = 'active'
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'org_status', 'active') = 'active'
    then nullif(auth.jwt() -> 'app_metadata' ->> 'org_id', '')::uuid
  end
$$;

create or replace function public.auth_org_role()
returns public.org_role
language sql
stable
set search_path = ''
as $$
  select case
    when coalesce(auth.jwt() -> 'app_metadata' ->> 'status', 'active') = 'active'
     and coalesce(auth.jwt() -> 'app_metadata' ->> 'org_status', 'active') = 'active'
    then nullif(auth.jwt() -> 'app_metadata' ->> 'org_role', '')::public.org_role
  end
$$;

-- With auth_org_role() null for an inactive token, `= 'admin'` would answer null — and `if not is_org_admin()` in a
-- function body reads `not null`, which skips the refusal. The two helpers answer a definite false instead.
create or replace function public.is_org_admin()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.auth_org_role() = 'admin', false)
$$;

create or replace function public.is_staff()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce(public.auth_org_role() in ('admin', 'moderator'), false)
$$;

-- ── 2 ────────────────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid    uuid;
  v_claims jsonb;
  v_app    jsonb;
  r        record;
  imp      record;
  v_pa     boolean := false;
  v_member boolean := false;
begin
  v_uid := (event ->> 'user_id')::uuid;
  if v_uid is null then
    return event;
  end if;

  select m.id, m.org_id, m.org_role, m.status, m.claims_version, o.status as org_status
    into r
    from public.members m
    join public.orgs o on o.id = m.org_id
   where m.auth_user_id = v_uid;
  v_member := found;

  select exists (select 1 from public.platform_admins p where p.auth_user_id = v_uid) into v_pa;

  if not v_member and not v_pa then
    return event;
  end if;

  v_claims := coalesce(event -> 'claims', '{}'::jsonb);
  v_app    := coalesce(v_claims -> 'app_metadata', '{}'::jsonb);

  -- ★ 0212 (DEC-266, the owner's ruling): a platform admin is never a member of an org and never uses the app as
  -- one. A member row they may still have (from before this ruling) carries nothing onto their token; the one way a
  -- platform admin holds an org's claims is impersonation, below — audited and time-boxed.
  if v_member and not v_pa then
    v_app := v_app || jsonb_build_object(
      'org_id',         r.org_id,
      'member_id',      r.id,
      'org_role',       r.org_role,
      'status',         r.status,
      'claims_version', r.claims_version,
      'org_status',     r.org_status
    );
  end if;
  if v_pa then
    v_app := v_app || jsonb_build_object('platform_admin', true);

    -- REQ-ADM-002 / REQ-ADM-019. A super admin has no member row, so this is
    -- the ONLY way org_id ever appears on their token, it lasts at most four
    -- hours by a table constraint, and the org already has the audit row.
    select s.id, s.org_id, s.expires_at, o.status as org_status
      into imp
      from public.impersonation_sessions s
      join public.orgs o on o.id = s.org_id
     where s.platform_admin_id = v_uid and s.ended_at is null and s.expires_at > now()
     order by s.started_at desc
     limit 1;
    if found then
      v_app := v_app || jsonb_build_object(
        'org_id',       imp.org_id,
        'org_role',     'member',
        'status',       'active',
        'org_status',   imp.org_status,
        'impersonation', imp.id,
        'impersonation_expires_at', imp.expires_at
      );
      -- member_id is deliberately absent: 03 §1.3 refuses every privileged
      -- write without one. Removed rather than trusted to be absent, in case a
      -- future member-and-platform-admin account ever exists.
      v_app := v_app - 'member_id' - 'claims_version';
    end if;
  end if;

  v_claims := jsonb_set(v_claims, '{app_metadata}', v_app, true);
  return jsonb_set(event, '{claims}', v_claims, true);
exception
  when others then
    -- 0006's rule 1, unchanged and now covering one more table: a hook that
    -- raises is an outage for every user.
    return event;
end $function$;

CREATE OR REPLACE FUNCTION public.provision_member(p_org uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid       uuid := auth.uid();
  v_email     extensions.citext;
  v_domain    text;
  v_meta      jsonb;
  v_name      text;
  v_avatar    text;
  m           public.members;
  v_org       public.orgs;
  v_orgs      jsonb;
  v_count     int;
  v_role      public.org_role := 'member';
  v_waiting   int;
  v_wait_orgs jsonb;
  v_company   uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  -- ★ 0212 (DEC-266): a platform admin is never provisioned, bound or reported as a member. `no_match` is the
  -- answer the callback already turns into the console for a platform admin (DEC-263).
  if exists (select 1 from public.platform_admins pa where pa.auth_user_id = v_uid) then
    return jsonb_build_object('status', 'no_match');
  end if;

  select u.email, u.raw_user_meta_data into v_email, v_meta from auth.users u where u.id = v_uid;
  if v_email is null then
    raise exception 'no_email' using errcode = '42501';
  end if;
  v_name   := nullif(btrim(coalesce(v_meta ->> 'full_name', v_meta ->> 'name', '')), '');
  v_avatar := nullif(coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture', ''), '');
  if v_avatar is not null and v_avatar !~ '^https://' then v_avatar := null; end if;

  -- Already a member: refresh what Google owns, never what the member edited
  -- (REQ-PRF-001), and report. A BOUND row is matched here and never reaches the bind
  -- branch below, which is what keeps a second account on the same address refused.
  select * into m from public.members where auth_user_id = v_uid;
  if m.id is not null then
    update public.members
       set avatar_url   = coalesce(v_avatar, avatar_url),
           display_name = coalesce(display_name, v_name)
     where id = m.id;
    select * into v_org from public.orgs where id = m.org_id;
    return jsonb_build_object('status', 'member', 'org_id', m.org_id, 'member_id', m.id,
                              'org_status', v_org.status, 'member_status', m.status);
  end if;

  -- ★ DEC-244 §4 — an admin added this person: BIND the row they already have.
  -- Whatever the domain says. `where auth_user_id is null` is the lock, so a concurrent
  -- double sign-in binds exactly once.
  select count(*), jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug) order by o.name)
    into v_waiting, v_wait_orgs
    from public.members w
    join public.orgs o on o.id = w.org_id
   where w.email = v_email and w.auth_user_id is null and w.status = 'active'
     and o.status = 'active';

  if v_waiting > 0 then
    if v_waiting > 1 and p_org is null then
      return jsonb_build_object('status', 'ambiguous', 'orgs', v_wait_orgs);
    end if;
    update public.members
       set auth_user_id = v_uid,
           display_name = coalesce(display_name, v_name),
           avatar_url   = coalesce(v_avatar, avatar_url)
     where email = v_email
       and auth_user_id is null
       and status = 'active'
       and (p_org is null or org_id = p_org)
       and org_id in (select id from public.orgs where status = 'active')
    returning * into m;

    if m.id is null then
      -- Another request bound it first, or p_org named an org with no waiting row.
      select * into m from public.members where auth_user_id = v_uid;
      if m.id is null then
        raise exception 'org_not_allowed' using errcode = '42501';
      end if;
    end if;

    -- ★ DEC-254 §2.4, DEC-255 §4 — a bound member with no company is placed by their domain. A company
    -- the admin chose when adding them is a placement by hand and is never touched (REQ-PRF-013); nor is
    -- a member an admin deliberately left with none (`company_assigned_by = 'admin'`).
    if m.company_id is null and m.company_assigned_by is null then
      v_company := public.company_for_sign_in(m.org_id, v_email::text);
      if v_company is not null then
        perform set_config('kareem.company_source', 'domain', true);
        update public.members set company_id = v_company where id = m.id returning * into m;
        perform set_config('kareem.company_source', '', true);
      end if;
    end if;

    select * into v_org from public.orgs where id = m.org_id;
    perform public.write_audit(m.org_id, 'member.claimed', 'member', m.id, null,
                               jsonb_build_object('email', m.email, 'org_role', m.org_role, 'company_id', m.company_id),
                               null, m.org_role::text, m.id);
    return jsonb_build_object('status', 'provisioned', 'org_id', m.org_id, 'member_id', m.id,
                              'org_status', v_org.status, 'member_status', m.status);
  end if;

  v_domain := split_part(lower(v_email::text), '@', 2);
  select count(*), jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'slug', o.slug) order by o.name)
    into v_count, v_orgs
    from public.orgs o
    join public.org_domains d on d.org_id = o.id
   where d.domain = v_domain and o.status = 'active';

  if v_count = 0 then
    return jsonb_build_object('status', 'no_match');
  end if;
  if v_count > 1 and p_org is null then
    return jsonb_build_object('status', 'ambiguous', 'orgs', v_orgs);
  end if;
  if p_org is not null then
    if not exists (
      select 1 from public.orgs o join public.org_domains d on d.org_id = o.id
       where o.id = p_org and d.domain = v_domain and o.status = 'active'
    ) then
      raise exception 'org_not_allowed' using errcode = '42501';
    end if;
    select * into v_org from public.orgs where id = p_org;
  else
    select o.* into v_org from public.orgs o join public.org_domains d on d.org_id = o.id
     where d.domain = v_domain and o.status = 'active' limit 1;
  end if;

  -- The first admin named at org creation (REQ-TEN-002) arrives as an admin.
  -- lower() on both: with search_path = '' the citext `=` operator is not
  -- found and the comparison silently falls back to case-sensitive text.
  if v_org.first_admin_email is not null and lower(v_org.first_admin_email::text) = lower(v_email::text) then
    v_role := 'admin';
  end if;

  -- Idempotent under a concurrent double sign-in: the unique constraint on
  -- auth_user_id absorbs the second insert, and both calls return one row.
  -- ★ DEC-254 §2.4 — the company follows the address's domain; no match leaves it null.
  v_company := public.company_for_sign_in(v_org.id, v_email::text);
  perform set_config('kareem.company_source', 'domain', true);
  insert into public.members (org_id, auth_user_id, email, display_name, avatar_url, org_role, company_id)
  values (v_org.id, v_uid, v_email, v_name, v_avatar, v_role, v_company)
  on conflict do nothing;
  perform set_config('kareem.company_source', '', true);

  select * into m from public.members where auth_user_id = v_uid;
  if m.id is null then
    -- (org_id, email) already taken by a different auth user: a recreated
    -- Google account. An admin resolves it; provisioning does not guess.
    raise exception 'email_already_member' using errcode = '42501';
  end if;

  perform public.write_audit(m.org_id, 'member.provisioned', 'member', m.id, null,
                             jsonb_build_object('email', m.email, 'org_role', m.org_role, 'company_id', m.company_id),
                             null, m.org_role::text, m.id);
  return jsonb_build_object('status', 'provisioned', 'org_id', m.org_id, 'member_id', m.id,
                            'org_status', v_org.status, 'member_status', m.status);
end $function$;

create or replace function public.members_not_platform_admin()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1
               from public.platform_admins pa
               join auth.users u on u.id = pa.auth_user_id
              where pa.auth_user_id = new.auth_user_id
                 or lower(u.email) = lower(new.email::text)) then
    raise exception 'platform_admin' using errcode = '22023';
  end if;
  return new;
end $$;
revoke execute on function public.members_not_platform_admin() from public, anon, authenticated;

drop trigger if exists members_not_platform_admin on public.members;
create trigger members_not_platform_admin
  before insert or update of email, auth_user_id on public.members
  for each row execute function public.members_not_platform_admin();

-- ── 3 ────────────────────────────────────────────────────────────────────────────────────────────────────────

drop policy if exists realtime_session_insert on realtime.messages;

-- ── 4 ────────────────────────────────────────────────────────────────────────────────────────────────────────

create or replace function public.org_domains_not_another_orgs()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Only the platform puts a domain on a second org's list (add_org_domain(), or a system call with no user): that is
  -- the choose-org case (SCR-003). An org admin — any signed-in caller who is not a platform admin — may not.
  if auth.uid() is not null
     and not exists (select 1 from public.platform_admins pa where pa.auth_user_id = auth.uid())
     and exists (select 1 from public.org_domains d where d.domain = new.domain and d.org_id <> new.org_id) then
    raise exception 'domain_taken' using errcode = '23505';
  end if;
  return new;
end $$;
revoke execute on function public.org_domains_not_another_orgs() from public, anon, authenticated;

drop trigger if exists org_domains_not_another_orgs on public.org_domains;
create trigger org_domains_not_another_orgs
  before insert or update of domain on public.org_domains
  for each row execute function public.org_domains_not_another_orgs();

-- ── 5 ────────────────────────────────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_photo_download(p_photo uuid)
 RETURNS TABLE(storage_path text, file_name text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- ★ 0212 (DEC-266, the owner's ruling): staff alone download a photograph; a member sees it and never downloads
  -- it. Re-read from the member row, never the claim's role.
  if not exists (select 1 from public.members m
                  where m.id = public.auth_member_id() and m.org_id = v_org and m.status = 'active'
                    and m.org_role in ('admin', 'moderator')) then
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
end $function$;

-- ── 6 ────────────────────────────────────────────────────────────────────────────────────────────────────────

drop policy if exists materials_storage_read on storage.objects;
create policy "materials_storage_read" on storage.objects for select to authenticated
  using (
    bucket_id = 'materials'
    and (storage.foldername(name))[1] = (public.auth_org_id())::text
    and (
      exists (
        select 1
          from public.material_versions mv
          join public.materials m on m.id = mv.material_id
          left join public.sessions s on s.id = m.session_id
          left join public.session_days d on d.id = m.session_day_id
         where mv.storage_path = objects.name
           and m.removed_at is null
           and (
             (m.session_id is not null
               and (m.phase = 'before'
                    or s.state = any (array['completed'::public.session_state, 'archived'::public.session_state])
                    or (m.session_day_id is not null and d.ends_at <= now())
                    or public.is_presenter_of(m.session_id)))
             or (m.proposal_id is not null and public.is_proposal_owner_of(m.proposal_id))
             or public.is_staff()
           )
           and (
             (m.allow_download and m.kind = 'audio')
             or (m.session_id is not null and public.is_presenter_of(m.session_id))
             or (m.proposal_id is not null and public.is_proposal_owner_of(m.proposal_id))
             or public.is_staff()
           )
      )
      or ((storage.foldername(name))[2] = 'sessions'
          and (public.is_presenter_of((nullif((storage.foldername(name))[3], ''))::uuid) or public.is_staff()))
      or ((storage.foldername(name))[2] = 'proposals'
          and (public.is_proposal_owner_of((nullif((storage.foldername(name))[3], ''))::uuid) or public.is_staff()))
    )
  );

create index if not exists material_versions_storage_path_idx on public.material_versions (storage_path);

CREATE OR REPLACE FUNCTION public.finalize_material_upload(p_material_id uuid, p_storage_path text, p_byte_size bigint, p_sniffed_mime text, p_sha256 text)
 RETURNS material_versions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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

  -- ★ 0212 (DEC-266): the path is the client's, so it is held to the one shape the path builder writes —
  -- `{org}/sessions/{session}/materials/{version}/{file}` or `{org}/proposals/{proposal}/materials/{version}/{file}`
  -- — for THIS material's org and owner, and a path already recorded is refused. Until now any path under the org's
  -- prefix was accepted.
  if p_storage_path is null
     or split_part(p_storage_path, '/', 1) <> v_org_id::text
     or split_part(p_storage_path, '/', 4) <> 'materials'
     or split_part(p_storage_path, '/', 5) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or split_part(p_storage_path, '/', 6) = ''
     or not ((split_part(p_storage_path, '/', 2) = 'sessions' and split_part(p_storage_path, '/', 3) = v_session_id::text)
          or (split_part(p_storage_path, '/', 2) = 'proposals' and split_part(p_storage_path, '/', 3) = v_proposal_id::text))
     or exists (select 1 from public.material_versions mv where mv.storage_path = p_storage_path) then
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

  -- DEC-058: only a PDF is ever rendered; image and audio are not_applicable.
  v_render := case when v_kind = 'pdf' then 'pending' else 'not_applicable' end;

  update public.materials
     set current_version_id = v_version.id, render_status = v_render, updated_at = now()
   where id = p_material_id;

  -- A proposal's own material is never enqueued for rendering while still a
  -- draft — 07 §4.1's pipeline needs a real session_id to build a storage
  -- path from, and this one has none yet. carry_over_proposal_materials()
  -- enqueues it once the proposal becomes a session.
  if v_render = 'pending' and v_session_id is not null then
    perform public.enqueue_job('convert_document', jsonb_build_object('version_id', v_version.id, 'material_id', p_material_id), 'conv:' || v_version.id::text);
  end if;

  return v_version;
end $function$;
-- ── 7 ────────────────────────────────────────────────────────────────────────────────────────────────────────

drop policy if exists "materials_storage_delete_unrecorded" on storage.objects;
create policy "materials_storage_delete_unrecorded" on storage.objects for delete to authenticated
  using (
    bucket_id = 'materials'
    and owner_id = (auth.uid())::text
    and (storage.foldername(name))[1] = (public.auth_org_id())::text
    and not exists (select 1 from public.material_versions mv where mv.storage_path = objects.name)
  );

drop policy if exists "design_assets_storage_delete_unrecorded" on storage.objects;
create policy "design_assets_storage_delete_unrecorded" on storage.objects for delete to authenticated
  using (
    bucket_id = 'design-assets'
    and owner_id = (auth.uid())::text
    and (storage.foldername(name))[1] = (public.auth_org_id())::text
    and public.is_org_admin()
    and not exists (select 1 from public.design_assets a where a.storage_path = objects.name)
  );

-- ── 8 ────────────────────────────────────────────────────────────────────────────────────────────────────────

create index if not exists points_ledger_source_id_idx on public.points_ledger (source_id) where source_id is not null;
create index if not exists story_views_frame_id_idx on public.story_views (frame_id);
create index if not exists reports_comment_id_idx on public.reports (comment_id) where comment_id is not null;
create index if not exists email_deliveries_notification_id_idx on public.email_deliveries (notification_id) where notification_id is not null;

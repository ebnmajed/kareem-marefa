-- 0005 — the tenancy RPCs: the only write paths for the things a policy
-- cannot express. 03-permissions-rls.md §1.3, §5.1, §5.10 · REQ-TEN-002 ·
-- REQ-TEN-005 · REQ-TEN-006 · REQ-TEN-007 · REQ-AUT-003 · REQ-AUT-004 ·
-- REQ-AUT-006 · REQ-AUT-007 · REQ-AUT-008 · REQ-ADM-018
--
-- Every function: SECURITY DEFINER, `set search_path = ''`, fully qualified
-- names, and EXECUTE revoked from public so only the roles named below may
-- call it. Errors use errcode 42501 with a stable message the app maps to
-- Arabic copy; the message is an identifier, not prose.

-- ═══════════════════════════════════════════════════════════════════════════
-- write_audit — the ONLY way a row enters audit_log. Called inside the
-- transaction that performs the audited act, so the act and its evidence
-- commit together or not at all.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.write_audit(
  p_org          uuid,
  p_action       text,
  p_subject_type text default null,
  p_subject_id   uuid default null,
  p_before       jsonb default null,
  p_after        jsonb default null,
  p_reason       text default null,
  p_actor_role   text default null,
  p_actor_id     uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.audit_log (org_id, actor_id, actor_role, action, subject_type, subject_id, before, after, reason)
  values (
    p_org,
    coalesce(p_actor_id, public.auth_member_id()),
    coalesce(p_actor_role, public.auth_org_role()::text, 'system'),
    p_action, p_subject_type, p_subject_id, p_before, p_after, p_reason
  )
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.write_audit from public, anon, authenticated;
grant  execute on function public.write_audit to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- The staleness pattern (03 §1.3). A privileged write never trusts the
-- read-side claims: it re-reads the member row and compares claims_version.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.assert_active_member() returns public.members
language plpgsql security definer set search_path = '' as $$
declare m public.members;
begin
  select * into m from public.members
   where id = public.auth_member_id() and org_id = public.auth_org_id();
  if m.id is null or m.status <> 'active' then
    raise exception 'not_a_member' using errcode = '42501';
  end if;
  if m.claims_version is distinct from public.auth_claims_version() then
    raise exception 'stale_claims' using errcode = '42501';
  end if;
  return m;
end $$;

create function public.assert_fresh_admin() returns public.members
language plpgsql security definer set search_path = '' as $$
declare m public.members;
begin
  m := public.assert_active_member();
  if m.org_role <> 'admin' then
    raise exception 'not_an_admin' using errcode = '42501';
  end if;
  return m;
end $$;
revoke execute on function public.assert_active_member, public.assert_fresh_admin from public, anon;
grant  execute on function public.assert_active_member, public.assert_fresh_admin to authenticated, service_role;

create function public.assert_platform_admin() returns uuid
language plpgsql security definer set search_path = '' as $$
declare u uuid := auth.uid();
begin
  if u is null or not exists (select 1 from public.platform_admins p where p.auth_user_id = u) then
    raise exception 'not_platform_admin' using errcode = '42501';
  end if;
  return u;
end $$;
revoke execute on function public.assert_platform_admin from public, anon;
grant  execute on function public.assert_platform_admin to authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- provision_member — domain-gated, idempotent, first-sign-in provisioning.
-- REQ-AUT-003, REQ-AUT-004, REQ-AUT-006.
--
-- Returns a jsonb envelope rather than raising, because three of its four
-- outcomes are ordinary:
--   { status: 'member',      org_id, member_id, org_status, member_status }
--   { status: 'provisioned', org_id, member_id, org_status, member_status }
--   { status: 'ambiguous',   orgs: [{ id, name, slug }] }   ← REQ-AUT-004 picker
--   { status: 'no_match' }                                  ← REQ-AUT-006: NO row, NO audit
-- Called with p_org after the picker; the choice is permanent because
-- members.org_id is immutable, not because the picker hides.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.provision_member(p_org uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_email   extensions.citext;
  v_domain  text;
  v_meta    jsonb;
  v_name    text;
  v_avatar  text;
  m         public.members;
  v_org     public.orgs;
  v_orgs    jsonb;
  v_count   int;
  v_role    public.org_role := 'member';
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select u.email, u.raw_user_meta_data into v_email, v_meta from auth.users u where u.id = v_uid;
  if v_email is null then
    raise exception 'no_email' using errcode = '42501';
  end if;
  v_name   := nullif(btrim(coalesce(v_meta ->> 'full_name', v_meta ->> 'name', '')), '');
  v_avatar := nullif(coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture', ''), '');
  if v_avatar is not null and v_avatar !~ '^https://' then v_avatar := null; end if;

  -- Already a member: refresh what Google owns, never what the member edited
  -- (REQ-PRF-001), and report.
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
  insert into public.members (org_id, auth_user_id, email, display_name, avatar_url, org_role)
  values (v_org.id, v_uid, v_email, v_name, v_avatar, v_role)
  on conflict do nothing;

  select * into m from public.members where auth_user_id = v_uid;
  if m.id is null then
    -- (org_id, email) already taken by a different auth user: a recreated
    -- Google account. An admin resolves it; provisioning does not guess.
    raise exception 'email_already_member' using errcode = '42501';
  end if;

  perform public.write_audit(m.org_id, 'member.provisioned', 'member', m.id, null,
                             jsonb_build_object('email', m.email, 'org_role', m.org_role),
                             null, m.org_role::text, m.id);
  return jsonb_build_object('status', 'provisioned', 'org_id', m.org_id, 'member_id', m.id,
                            'org_status', v_org.status, 'member_status', m.status);
end $$;
revoke execute on function public.provision_member from public, anon;
grant  execute on function public.provision_member to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- me — the member's own full row. The column grant hides `email` from the
-- org (A33); the member sees their own through here.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', m.id, 'org_id', m.org_id, 'email', m.email, 'display_name', m.display_name,
    'avatar_url', m.avatar_url, 'company_id', m.company_id, 'job_title', m.job_title,
    'bio', m.bio, 'org_role', m.org_role, 'status', m.status,
    'leaderboard_opt_out', m.leaderboard_opt_out, 'created_at', m.created_at
  )
  from public.members m
  where m.auth_user_id = auth.uid()
$$;
revoke execute on function public.me from public, anon;
grant  execute on function public.me to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- Role and status changes — REQ-TEN-005, REQ-AUT-007, REQ-AUT-008.
-- Each bumps claims_version so the subject's next privileged write sees
-- stale_claims, and writes the audit row in the same transaction.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.set_member_role(p_member uuid, p_role public.org_role) returns public.members
language plpgsql security definer set search_path = '' as $$
declare
  actor    public.members := public.assert_fresh_admin();
  target   public.members;
  old_role public.org_role;
begin
  select * into target from public.members where id = p_member and org_id = actor.org_id;
  if target.id is null then
    raise exception 'member_not_found' using errcode = '42501';
  end if;
  if target.org_role = p_role then
    return target;
  end if;
  old_role := target.org_role;
  if target.org_role = 'admin' and not exists (
    select 1 from public.members x
     where x.org_id = actor.org_id and x.org_role = 'admin' and x.status = 'active' and x.id <> target.id
  ) then
    raise exception 'last_admin' using errcode = '42501';
  end if;

  update public.members
     set org_role = p_role, claims_version = claims_version + 1
   where id = target.id
   returning * into target;

  perform public.write_audit(actor.org_id, 'member.role_changed', 'member', target.id,
                             jsonb_build_object('org_role', old_role),
                             jsonb_build_object('org_role', p_role), null, 'admin', actor.id);
  return target;
end $$;

create function public.deactivate_member(p_member uuid, p_reason text) returns public.members
language plpgsql security definer set search_path = '' as $$
declare
  actor  public.members := public.assert_fresh_admin();
  target public.members;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  if p_member = actor.id then
    raise exception 'cannot_deactivate_self' using errcode = '42501';
  end if;
  select * into target from public.members where id = p_member and org_id = actor.org_id;
  if target.id is null then
    raise exception 'member_not_found' using errcode = '42501';
  end if;
  if target.status = 'deactivated' then
    return target;
  end if;

  update public.members
     set status = 'deactivated', deactivated_at = now(), deactivated_reason = btrim(p_reason),
         deactivated_by = actor.id, claims_version = claims_version + 1
   where id = target.id
   returning * into target;

  -- Future RSVPs are cancelled by the M2 migration that creates rsvps; this
  -- function is where that call will live (REQ-AUT-008).
  perform public.write_audit(actor.org_id, 'member.deactivated', 'member', target.id,
                             jsonb_build_object('status', 'active'),
                             jsonb_build_object('status', 'deactivated'),
                             btrim(p_reason), 'admin', actor.id);
  return target;
end $$;

create function public.reactivate_member(p_member uuid) returns public.members
language plpgsql security definer set search_path = '' as $$
declare
  actor  public.members := public.assert_fresh_admin();
  target public.members;
begin
  select * into target from public.members where id = p_member and org_id = actor.org_id;
  if target.id is null then
    raise exception 'member_not_found' using errcode = '42501';
  end if;
  if target.status = 'active' then
    return target;
  end if;
  update public.members
     set status = 'active', deactivated_at = null, deactivated_reason = null,
         deactivated_by = null, claims_version = claims_version + 1
   where id = target.id
   returning * into target;
  perform public.write_audit(actor.org_id, 'member.reactivated', 'member', target.id,
                             jsonb_build_object('status', 'deactivated'),
                             jsonb_build_object('status', 'active'), null, 'admin', actor.id);
  return target;
end $$;
revoke execute on function public.set_member_role, public.deactivate_member, public.reactivate_member from public, anon;
grant  execute on function public.set_member_role, public.deactivate_member, public.reactivate_member to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- org_domains — direct P2 writes, audited by trigger (REQ-TEN-007).
-- ═══════════════════════════════════════════════════════════════════════════
create function public.org_domains_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(new.org_id, 'domain.added', 'org_domain', new.id, null,
                               jsonb_build_object('domain', new.domain));
    return new;
  elsif tg_op = 'DELETE' then
    perform public.write_audit(old.org_id, 'domain.removed', 'org_domain', old.id,
                               jsonb_build_object('domain', old.domain), null);
    return old;
  else
    perform public.write_audit(new.org_id, 'domain.changed', 'org_domain', new.id,
                               jsonb_build_object('domain', old.domain),
                               jsonb_build_object('domain', new.domain));
    return new;
  end if;
end $$;
create trigger org_domains_audit after insert or update or delete on public.org_domains
  for each row execute function public.org_domains_audit();

-- ═══════════════════════════════════════════════════════════════════════════
-- Platform-admin RPCs — REQ-TEN-002, REQ-TEN-006. The org's own audit log
-- records what the platform did to it (DEC-014).
-- ═══════════════════════════════════════════════════════════════════════════
create function public.create_org(
  p_name               text,
  p_slug               text,
  p_certificate_prefix text,
  p_domains            text[],
  p_first_admin_email  text,
  p_seed_categories    boolean default true
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_admin uuid := public.assert_platform_admin();
  v_org   uuid;
  d       text;
begin
  if p_domains is null or cardinality(p_domains) = 0 then
    raise exception 'domains_required' using errcode = '22023';
  end if;
  insert into public.orgs (name, slug, certificate_prefix, created_by, first_admin_email)
  values (btrim(p_name), lower(btrim(p_slug)), upper(btrim(p_certificate_prefix)), v_admin,
          lower(btrim(p_first_admin_email))::extensions.citext)
  returning id into v_org;

  insert into public.org_settings (org_id) values (v_org);

  foreach d in array p_domains loop
    insert into public.org_domains (org_id, domain) values (v_org, d);
  end loop;

  if p_seed_categories then
    -- The set members already saw on the pre-launch form (02 §4.2).
    insert into public.categories (org_id, name)
    values (v_org, 'فني'), (v_org, 'إداري'), (v_org, 'إبداعي'), (v_org, 'درس من تجربة');
  end if;

  perform public.write_audit(v_org, 'org.created', 'org', v_org, null,
                             jsonb_build_object('name', btrim(p_name), 'slug', lower(btrim(p_slug)),
                                                'domains', to_jsonb(p_domains),
                                                'first_admin_email', lower(btrim(p_first_admin_email))),
                             null, 'platform_admin', null);
  return v_org;
end $$;

create function public.suspend_org(p_org uuid, p_reason text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.assert_platform_admin();
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 then
    raise exception 'reason_required' using errcode = '22023';
  end if;
  update public.orgs
     set status = 'suspended', suspended_at = now(), suspended_reason = btrim(p_reason)
   where id = p_org and status = 'active';
  if not found then
    raise exception 'org_not_found_or_suspended' using errcode = '42501';
  end if;
  perform public.write_audit(p_org, 'org.suspended', 'org', p_org,
                             jsonb_build_object('status', 'active'), jsonb_build_object('status', 'suspended'),
                             btrim(p_reason), 'platform_admin', null);
end $$;

create function public.reinstate_org(p_org uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_admin uuid := public.assert_platform_admin();
begin
  update public.orgs
     set status = 'active', suspended_at = null, suspended_reason = null
   where id = p_org and status = 'suspended';
  if not found then
    raise exception 'org_not_found_or_active' using errcode = '42501';
  end if;
  perform public.write_audit(p_org, 'org.reinstated', 'org', p_org,
                             jsonb_build_object('status', 'suspended'), jsonb_build_object('status', 'active'),
                             null, 'platform_admin', null);
end $$;
revoke execute on function public.create_org, public.suspend_org, public.reinstate_org from public, anon;
grant  execute on function public.create_org, public.suspend_org, public.reinstate_org to authenticated, service_role;

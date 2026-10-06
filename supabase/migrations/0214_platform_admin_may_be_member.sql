-- 0214 — A platform admin may also be a member of an organisation and use the app as one. DEC-268.
--
-- The owner's ruling, reversing 0212's §2 (DEC-266 ruling 2): the owner had asked to FIX the super admin's inability to
-- be a member, and 0212 enforced the opposite. This restores 0211's behaviour exactly:
--   · custom_access_token_hook() writes a platform admin's member claims when they have a member row (impersonation
--     still replaces them while it lasts);
--   · provision_member() provisions and binds a platform admin like anyone else;
--   · the trigger refusing a member row for a platform admin's address or auth user is dropped.
-- DEC-014 and invariant 8 are unchanged: the platform role itself still reads no org's data; a member row gives exactly
-- a member's (or an org admin's) access to that one org, through the ordinary policies.

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

  -- ★ 0214 (DEC-268, the owner's ruling, reversing 0212's): a platform admin MAY also be a member of an org and use the
  -- app as one — their member row carries its claims as anyone's does. Impersonation, below, still replaces them and
  -- drops member_id for its duration.
  if v_member then
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

drop trigger if exists members_not_platform_admin on public.members;
drop function if exists public.members_not_platform_admin();

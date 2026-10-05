-- 0203 · wave 27 (DEC-254 §2, DEC-255 §4, REQ-PRF-012, REQ-PRF-013, STORY-PRF-006) — a company carries its email
-- domains, and a member's company follows theirs.
--
-- ★ WHAT THIS FILE IS: the tables, the placement column, three helpers and `provision_member()`. The functions that
-- SAVE a company's domains, sweep members and place one by hand are `console`'s and follow in their own file.
--
-- ★ TWO LISTS, AND NEITHER VALIDATES THE OTHER (ruling 1). `org_domains` (0004) still decides who may join the org.
-- `company_domains` decides only which company a member lands in. A company may carry a domain the org's list does
-- not, and the reverse.
--
-- ★ WHO PLACED A MEMBER IS A COLUMN (ruling 6). `members.company_assigned_by` is 'domain' or 'admin', and null only
-- while nobody has ever placed the member. A sweep moves 'domain' and null; it never moves 'admin' — including an
-- admin's deliberate «no company» (null company, 'admin').
--
-- ★ KEPT BY A TRIGGER THAT NORMALISES, NOT A CHECK (DEC-255 §4). A check would break `anonymise_members()` (0158),
-- every fixture that inserts a member with a company, and `main`'s profile save in the gap before the code deploys.
-- The rule: whoever changes `company_id` WITHOUT naming a source is recorded as 'admin' — the conservative reading, a
-- sweep never undoes it. The definer functions that place by domain name their source in a transaction-local
-- setting, `kareem.company_source`, which no client can set through a column write.
--
-- ★ `provision_member()` NEVER RAISES AND NEVER BLOCKS FOR A COMPANY. The lookup is one function with its own
-- exception block: any failure leaves the company null and the sign-in proceeds. It takes the org's company-domains
-- lock SHARED, so a domain being saved at that instant either sees the new member or the member sees the new domain.
--
-- ★ NOT HERE, ON PURPOSE: the revoke of `company_id` from the member's own column grant (0004:310). `main`'s profile
-- save sends the column and would be refused whole; the revoke is pushed after this PR's code is on `main`
-- (DEC-254 §8.4, DEC-255 §6).
--
-- Additive for `main`: a new table nothing reads, a new column nothing names, and `provision_member()` placing a new
-- member where `main` left them with none — which `main`'s profile screen then simply shows.
--
-- | Test | Proves |
-- |---|---|
-- | `POL-company_domains.read_admin` | An admin reads their org's rows; a moderator, a member and another org's admin read none. |
-- | `POL-company_domains.no_client_write` | No client role inserts, updates or deletes: `42501`. |
-- | `CHK-company_domains.one_company_per_domain` | The same domain on two companies of one org is `23505`; on companies of two orgs it is accepted. |
-- | `CHK-company_domains.lowercase` | A mixed-case domain with a leading `@` is stored lowercase without it; a malformed one is `23514`. |
-- | `TRG-company_domains.same_org` | A domain row naming a company of another org is `23503`. |
-- | `TRG-members.company_source` | A company written with no source named is 'admin'; one written under `kareem.company_source = 'domain'` is 'domain'; a row that never had a company has null. |
-- | `RPC-provision_member.places_by_domain` | A first sign-in from a company's domain lands in that company with source 'domain'; no match leaves both null; a deactivated company places nobody. |
-- | `RPC-provision_member.binding_keeps_admin_choice` | A member added with a company keeps it at first sign-in whatever their domain; one added with none is placed by domain. |
-- | `RPC-provision_member.company_never_blocks` | With `company_for_domain()` made to raise, the sign-in still provisions, with no company. |

-- ── the placement column ────────────────────────────────────────────────────────────────────────────────────────────
create type public.company_source as enum ('domain', 'admin');

alter table public.members add column company_assigned_by public.company_source;
comment on column public.members.company_assigned_by is
  'Who placed this member in company_id: ''domain'' (their email domain, REQ-PRF-012) or ''admin'' (by hand, REQ-PRF-013 — '
  'never moved by a domain change, including a deliberate null company). NULL only while nobody has ever placed them. '
  'Kept by members_company_source(); in no column grant.';

create function public.members_company_source() returns trigger
language plpgsql set search_path = '' as $$
declare
  v_named text := nullif(current_setting('kareem.company_source', true), '');
begin
  if tg_op = 'INSERT' then
    new.company_assigned_by := case
      when v_named is not null then v_named::public.company_source
      when new.company_id is not null then 'admin'::public.company_source
      else null end;
    if new.company_id is null and new.company_assigned_by = 'domain' then
      new.company_assigned_by := null;
    end if;
    return new;
  end if;

  if new.company_id is distinct from old.company_id then
    new.company_assigned_by := coalesce(v_named::public.company_source, 'admin'::public.company_source);
    if new.company_id is null and new.company_assigned_by = 'domain' then
      new.company_assigned_by := null;
    end if;
  elsif v_named is not null then
    -- a placement by hand that confirms the company a member already has (or has none) still becomes the admin's
    new.company_assigned_by := v_named::public.company_source;
    if new.company_id is null and new.company_assigned_by = 'domain' then
      new.company_assigned_by := old.company_assigned_by;
    end if;
  else
    new.company_assigned_by := old.company_assigned_by;
  end if;
  return new;
end $$;

create trigger members_company_source before insert or update of company_id, company_assigned_by on public.members
  for each row execute function public.members_company_source();

-- ── company_domains ─────────────────────────────────────────────────────────────────────────────────────────────────
create table public.company_domains (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.orgs(id) on delete cascade,
  company_id  uuid not null references public.companies(id) on delete cascade,
  -- stored lowercase, no leading @ — normalised by trigger, checked here, exactly as org_domains (0004)
  domain      extensions.citext not null check (domain::text ~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$'),
  created_at  timestamptz not null default now(),
  -- ruling 3: one domain maps to at most one company PER ORG; two orgs may each map it
  unique (org_id, domain)
);
create index company_domains_company_idx on public.company_domains (company_id);

create trigger company_domains_normalise before insert or update on public.company_domains
  for each row execute function public.org_domains_normalise();

create function public.company_domains_same_org() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from public.companies c where c.id = new.company_id and c.org_id = new.org_id) then
    raise exception 'company_other_org' using errcode = '23503';
  end if;
  return new;
end $$;
create trigger company_domains_same_org before insert or update of company_id, org_id on public.company_domains
  for each row execute function public.company_domains_same_org();

alter table public.company_domains enable row level security;
revoke all on public.company_domains from anon, authenticated, service_role;
-- Admin-only, including read, as org_domains: which domains map where is a membership control. NO write policy and
-- NO write grant — `save_company()` (console's, definer) is the one writer, so the dialog's numbers are the save's.
create policy "company_domains_read_admin" on public.company_domains for select to authenticated
  using (org_id = public.auth_org_id() and public.is_org_admin());
grant select on public.company_domains to authenticated;

-- ── the three helpers every placer reads (contract 3) ───────────────────────────────────────────────────────────────
create function public.email_domain(p_email text) returns text
language sql immutable set search_path = '' as $$
  select split_part(lower(p_email), '@', 2)   -- exactly what provision_member() has computed since 0005
$$;

create function public.company_for_domain(p_org uuid, p_domain text) returns uuid
language sql stable security definer set search_path = '' as $$
  select d.company_id
    from public.company_domains d
    join public.companies c on c.id = d.company_id
   where d.org_id = p_org and d.domain::text = lower(p_domain) and c.deactivated_at is null   -- DEC-255 §4: a deactivated company places nobody
$$;

create function public.company_domains_lock_key(p_org uuid) returns bigint
language sql immutable set search_path = '' as $$
  select hashtextextended('company_domains:' || p_org::text, 0)
$$;

-- provision_member()'s one call: the shared lock, the lookup, and NEVER an error.
create function public.company_for_sign_in(p_org uuid, p_email text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_company uuid;
begin
  perform pg_advisory_xact_lock_shared(public.company_domains_lock_key(p_org));
  v_company := public.company_for_domain(p_org, public.email_domain(p_email));
  return v_company;
exception when others then
  return null;
end $$;

revoke execute on function public.email_domain(text), public.company_for_domain(uuid, text),
  public.company_domains_lock_key(uuid), public.company_for_sign_in(uuid, text),
  public.members_company_source(), public.company_domains_same_org() from public, anon, authenticated;

-- ── provision_member() — replaced whole from 0197; the three marked blocks are the only change ─────────────────────
create or replace function public.provision_member(p_org uuid default null) returns jsonb
language plpgsql security definer set search_path = '' as $$
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
end $$;
revoke execute on function public.provision_member from public, anon;
grant  execute on function public.provision_member to authenticated;

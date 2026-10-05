-- console · wave 27 (DEC-254 §2, DEC-255 §4, REQ-PRF-012, REQ-PRF-013, REQ-ADM-024, REQ-ADM-023; STORY-ADM-012, 013)
-- — a company carries its domains, the save asks before it moves anyone, and an admin may place one member by hand.
--
-- ★ FUNCTIONS ONLY. The table `company_domains`, the column `members.company_assigned_by` with its normalising trigger
-- `members_company_source()`, and the helpers `email_domain()`, `company_for_domain()` and `company_domains_lock_key()`
-- are the lead's (0203). This file reads them by those names and creates no table, column, policy or grant beyond the
-- execute grants of its own functions.
--
-- ★ THE SOURCE OF A PLACEMENT IS NAMED, NEVER INFERRED. 0203's trigger records a company written with no source as
-- 'admin'. A function here that places by domain says so in the transaction-local setting `kareem.company_source`
-- ('domain' or 'admin') around its one write, and clears it straight after, so nothing else in the transaction
-- inherits it.
--
-- ★ ONE LOCK. Every writer of a member's company here takes `pg_advisory_xact_lock(company_domains_lock_key(org))`
-- EXCLUSIVE; `provision_member()` (0203) takes it SHARED. So between a dry run and its confirm the population a save
-- derives from can change only through a writer that is serialised against the confirm, and the confirm re-derives
-- under the lock and compares a token over the member ids the admin was shown.
--
-- | Test | Proves |
-- |---|---|
-- | `RPC-save_company.admin_only` | A moderator and a member are refused `42501`; another org's company is `company_not_found`. |
-- | `RPC-save_company.dry_run_writes_nothing` | The dry run returns the two counts and the destination's NAME — never a member's — and writes no row. |
-- | `RPC-save_company.moves_exactly_the_preview` | The confirm moves exactly the members counted, with source 'domain'; the admin-placed are left. |
-- | `RPC-save_company.token` | A member who arrives between the dry run and the confirm makes the confirm answer `changed` with the new numbers, writing nothing. |
-- | `RPC-save_company.removal_unplaces_nobody` | Removing a domain leaves every member it placed where they are. |
-- | `RPC-save_company.refusals_name_the_domain` | A malformed domain and one on another company of the org come back per domain with their reason; nothing is written. |
-- | `RPC-save_company.deactivated_places_nobody` | Domains saved on a deactivated company move nobody (DEC-255 §4, Q3). |
-- | `RPC-save_company.audit` | `company.domain_added` / `company.domain_removed` per domain, `member.company_changed` per member moved; `company.created` / `.changed` / `.team_color_changed` still from their triggers. |
-- | `RPC-set_member_company.by_hand` | An admin's placement or removal is source 'admin', audited with the old and the new, and no later save moves it. |
-- | `RPC-add_member.company_source` | A company given while adding is 'admin'; none given and a matching domain is 'domain'; none at all is null. |

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1 · The derivation — one helper, read by the dry run and by the confirm, so the two cannot disagree
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- `moving`: members of the org whose address is on one of the domains, not already in the company, and not placed by
-- an admin — i.e. with no company and nobody's placement, or placed BY DOMAIN in another company (ruling 7, Q7).
-- `held`: the same match, placed by an admin (including an admin's deliberate «no company»).
-- A target company that is deactivated, or a create (`p_company` null) that is not yet a company, derives as itself —
-- the caller decides what a deactivated company does (it places nobody).
create function public.company_domain_moves(p_org uuid, p_company uuid, p_domains text[])
returns table (member_id uuid, company_id uuid, company_assigned_by public.company_source, domain text, held boolean)
language sql stable security definer set search_path = '' as $$
  select m.id, m.company_id, m.company_assigned_by, public.email_domain(m.email::text),
         m.company_assigned_by is not distinct from 'admin'::public.company_source
    from public.members m
   where m.org_id = p_org
     and public.email_domain(m.email::text) = any(p_domains)
     and (p_company is null or m.company_id is distinct from p_company)
$$;
revoke execute on function public.company_domain_moves(uuid, uuid, text[]) from public, anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2 · save_company() — the company, its domains, and the members they place; a dry run, then the confirm
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Envelopes (DEC-043: after the first write, an envelope, never a raise; before it, a refusal is an envelope too, so
-- the form can say WHICH domain and WHY):
--   { status: 'invalid', errors: [{ domain, reason: 'malformed' | 'taken' | 'too_many', company? }] }   nothing written
--   { status: 'preview', moving, held, token, company_name }                                              nothing written
--   { status: 'changed', moving, held, token, company_name }                                              nothing written
--   { status: 'saved',   company_id, moved, held }
-- The name in `preview` / `changed` is the DESTINATION's only (DEC-255 §4) — no member's name leaves this function.
create function public.save_company(
  p_company    uuid,
  p_name       text,
  p_team_color text,
  p_domains    text[],
  p_confirm    boolean default false,
  p_expected   text default null
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor      public.members := public.assert_fresh_admin();
  v_company  public.companies;
  v_name     text := btrim(coalesce(p_name, ''));
  v_domains  text[];
  v_current  text[];
  v_errors   jsonb := '[]'::jsonb;
  v_taken    record;
  v_d        text;
  v_moving   uuid[];
  v_held     uuid[];
  v_token    text;
  v_places   boolean;
  v_id       uuid;
  rec        record;
begin
  if p_company is not null then
    select * into v_company from public.companies c where c.id = p_company and c.org_id = actor.org_id;
    if v_company.id is null then
      raise exception 'company_not_found' using errcode = '42501';
    end if;
  end if;
  if v_name = '' then
    raise exception 'name_required' using errcode = '22023';
  end if;

  -- Normalised exactly as `org_domains_normalise()` stores them (0004), empties dropped, duplicates folded.
  select coalesce(array_agg(distinct d order by d), array[]::text[]) into v_domains
    from (select lower(ltrim(btrim(x), '@')) as d from unnest(coalesce(p_domains, array[]::text[])) x) s
   where d <> '';

  if cardinality(v_domains) > 20 then
    return jsonb_build_object('status', 'invalid', 'errors',
      jsonb_build_array(jsonb_build_object('domain', null, 'reason', 'too_many')));
  end if;
  foreach v_d in array v_domains loop
    if v_d !~ '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' then
      v_errors := v_errors || jsonb_build_object('domain', v_d, 'reason', 'malformed');
    end if;
  end loop;

  perform pg_advisory_xact_lock(public.company_domains_lock_key(actor.org_id));

  -- Ruling 3: one company per domain per org. The unique index is the boundary; this pass names the other company.
  for v_taken in
    select d.domain::text as domain, c.name
      from public.company_domains d join public.companies c on c.id = d.company_id
     where d.org_id = actor.org_id and d.domain::text = any(v_domains)
       and (p_company is null or d.company_id <> p_company)
  loop
    v_errors := v_errors || jsonb_build_object('domain', v_taken.domain, 'reason', 'taken', 'company', v_taken.name);
  end loop;
  if jsonb_array_length(v_errors) > 0 then
    return jsonb_build_object('status', 'invalid', 'errors', v_errors);
  end if;

  -- DEC-255 §4 (Q3): a deactivated company places nobody; its domains are still kept.
  v_places := v_company.id is null or v_company.deactivated_at is null;
  if v_places then
    select coalesce(array_agg(member_id order by member_id) filter (where not held), array[]::uuid[]),
           coalesce(array_agg(member_id order by member_id) filter (where held), array[]::uuid[])
      into v_moving, v_held
      from public.company_domain_moves(actor.org_id, p_company, v_domains);
  else
    v_moving := array[]::uuid[];
    v_held := array[]::uuid[];
  end if;
  v_token := md5(array_to_string(v_moving, ',') || '|' || array_to_string(v_held, ','));

  if not coalesce(p_confirm, false) then
    return jsonb_build_object('status', 'preview', 'moving', cardinality(v_moving), 'held', cardinality(v_held),
                              'token', v_token, 'company_name', v_name);
  end if;
  -- The numbers the admin confirmed are the numbers this save moves, or it writes nothing and asks again.
  if cardinality(v_moving) > 0 and p_expected is distinct from v_token then
    return jsonb_build_object('status', 'changed', 'moving', cardinality(v_moving), 'held', cardinality(v_held),
                              'token', v_token, 'company_name', v_name);
  end if;

  -- ── the writes ───────────────────────────────────────────────────────────────────────────────────────────────────
  -- The company row: its own triggers write company.created / company.changed / company.team_color_changed (0181, 0161).
  if p_company is null then
    insert into public.companies (org_id, name, team_color) values (actor.org_id, v_name, p_team_color)
    returning id into v_id;
  else
    v_id := p_company;
    update public.companies set name = v_name, team_color = p_team_color
     where id = v_id and (name is distinct from v_name or team_color is distinct from p_team_color);
  end if;

  select coalesce(array_agg(d.domain::text order by d.domain::text), array[]::text[]) into v_current
    from public.company_domains d where d.company_id = v_id;

  -- A removed domain is deleted and unplaces nobody (ruling 7): no member row is touched for it.
  for v_d in select x from unnest(v_current) x where x <> all(v_domains) loop
    delete from public.company_domains where company_id = v_id and domain = v_d::extensions.citext;
    perform public.write_audit(actor.org_id, 'company.domain_removed', 'company', v_id,
                               jsonb_build_object('domain', v_d), null, null, actor.org_role::text, actor.id);
  end loop;
  for v_d in select x from unnest(v_domains) x where x <> all(v_current) loop
    insert into public.company_domains (org_id, company_id, domain) values (actor.org_id, v_id, v_d::extensions.citext);
    perform public.write_audit(actor.org_id, 'company.domain_added', 'company', v_id, null,
                               jsonb_build_object('domain', v_d), null, actor.org_role::text, actor.id);
  end loop;

  for rec in
    select m.id, m.company_id, m.company_assigned_by, public.email_domain(m.email::text) as domain
      from public.members m
     where m.id = any(v_moving)
     order by m.id
       for update
  loop
    perform set_config('kareem.company_source', 'domain', true);
    update public.members set company_id = v_id where id = rec.id;
    perform set_config('kareem.company_source', '', true);
    perform public.write_audit(actor.org_id, 'member.company_changed', 'member', rec.id,
                               jsonb_build_object('company_id', rec.company_id, 'company_assigned_by', rec.company_assigned_by),
                               jsonb_build_object('company_id', v_id, 'company_assigned_by', 'domain', 'domain', rec.domain),
                               null, actor.org_role::text, actor.id);
  end loop;

  return jsonb_build_object('status', 'saved', 'company_id', v_id, 'moved', cardinality(v_moving),
                            'held', cardinality(v_held));
end $$;
revoke execute on function public.save_company(uuid, text, text, text[], boolean, text) from public, anon;
grant  execute on function public.save_company(uuid, text, text, text[], boolean, text) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3 · set_member_company() — the one writer of a member's company after creation (REQ-PRF-013)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- `p_company` null is «remove from the company»: company null with source 'admin', which no sweep re-places
-- (DEC-255 §4, Q1). The same company the member already has by domain becomes the admin's — pinned — and is audited.
create function public.set_member_company(p_member uuid, p_company uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  actor   public.members := public.assert_fresh_admin();
  target  public.members;
  v_off   timestamptz;
begin
  perform pg_advisory_xact_lock(public.company_domains_lock_key(actor.org_id));
  select * into target from public.members where id = p_member and org_id = actor.org_id for update;
  if target.id is null then
    raise exception 'member_not_found' using errcode = '42501';
  end if;
  if p_company is not null then
    select c.deactivated_at into v_off from public.companies c where c.id = p_company and c.org_id = actor.org_id;
    if not found then
      raise exception 'company belongs to another org' using errcode = '23503';
    end if;
    if v_off is not null then
      raise exception 'company_deactivated' using errcode = '22023';
    end if;
  end if;

  if target.company_id is not distinct from p_company
     and target.company_assigned_by is not distinct from 'admin'::public.company_source then
    return jsonb_build_object('status', 'unchanged', 'company_id', p_company);
  end if;

  perform set_config('kareem.company_source', 'admin', true);
  update public.members set company_id = p_company, company_assigned_by = 'admin' where id = target.id;
  perform set_config('kareem.company_source', '', true);

  perform public.write_audit(actor.org_id, 'member.company_changed', 'member', target.id,
                             jsonb_build_object('company_id', target.company_id, 'company_assigned_by', target.company_assigned_by),
                             jsonb_build_object('company_id', p_company, 'company_assigned_by', 'admin'),
                             null, actor.org_role::text, actor.id);
  return jsonb_build_object('status', 'saved', 'company_id', p_company);
end $$;
revoke execute on function public.set_member_company(uuid, uuid) from public, anon;
grant  execute on function public.set_member_company(uuid, uuid) to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4 · add_member() — 0197's, replaced whole; the marked block is the only change. Same signature, same grants.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- `add_members()` (0197) calls this by name for each line and is not replaced; the advisory lock is re-entrant within
-- the transaction, so a pasted list takes it once in effect.
create or replace function public.add_member(
  p_email        text,
  p_display_name text default null,
  p_company      uuid default null,
  p_job_title    text default null,
  p_role         public.org_role default 'member'
) returns public.members
language plpgsql security definer set search_path = '' as $$
declare
  actor     public.members := public.assert_fresh_admin();
  v_mail    extensions.citext;
  m         public.members;
  v_company uuid := p_company;
  v_source  text := '';
begin
  v_mail := lower(btrim(coalesce(p_email, '')))::extensions.citext;
  if v_mail::text = '' or v_mail::text !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'not_an_address' using errcode = '22023';
  end if;

  -- An addition never grants `admin` (DEC-244 §11): it would be a standing grant to whoever
  -- controls a mailbox. They are promoted after they arrive, by set_member_role().
  if p_role = 'admin' then
    raise exception 'role_not_allowed' using errcode = '22023';
  end if;

  if exists (select 1 from public.members x where x.org_id = actor.org_id and x.email = v_mail) then
    raise exception 'already_a_member' using errcode = '22023';
  end if;

  -- ★ wave 27 (DEC-254 §2.6, DEC-255 §4 Q4) — a company chosen here is a placement by hand ('admin'); with none
  -- chosen, the address's domain places them now ('domain'), so the admin's list is right the moment they add
  -- someone; with no match, nobody has placed them (null). Under the org's company-domains lock, so a domain being
  -- saved at this instant counts this person or this person sees the domain.
  perform pg_advisory_xact_lock(public.company_domains_lock_key(actor.org_id));
  if p_company is not null then
    v_source := 'admin';
  else
    v_company := public.company_for_domain(actor.org_id, public.email_domain(v_mail::text));
    if v_company is not null then
      v_source := 'domain';
    end if;
  end if;

  -- auth_user_id stays NULL: this is the row waiting for its auth user. Everything else is set,
  -- which is what makes them a member the admin can use immediately.
  perform set_config('kareem.company_source', v_source, true);
  insert into public.members (org_id, email, display_name, company_id, job_title, org_role, invited_by)
  values (actor.org_id, v_mail,
          nullif(btrim(coalesce(p_display_name, '')), ''),
          v_company,
          nullif(btrim(coalesce(p_job_title, '')), ''),
          p_role, actor.id)
  returning * into m;
  perform set_config('kareem.company_source', '', true);

  perform public.write_audit(m.org_id, 'member.added', 'member', m.id, null,
                             jsonb_build_object('email', m.email, 'org_role', m.org_role,
                                                'company_id', m.company_id,
                                                'company_assigned_by', m.company_assigned_by),
                             null, actor.org_role::text, actor.id);

  -- The payload names the MEMBER and carries no address (0139's rule): a forged or replayed job
  -- can mail nobody but this member.
  perform public.enqueue_job('send_member_invitation',
                             jsonb_build_object('org_id', m.org_id, 'member_id', m.id),
                             'invite:' || m.id::text);
  return m;
end $$;

-- 0211 — an admin may add another admin by email; an admin who has not signed in is never the last admin
--
-- REQ-TEN-009 (amended), REQ-TEN-005 · DEC-261 — the owner's ruling of 2026-10-05, reversing DEC-244 §11 and
-- DEC-254 §7: «the admin can add another admin by email».
--
-- Forward-only and additive: two `create or replace` over unchanged signatures, so every grant stands and
-- `main`'s app on this schema does nothing different — its form offers no `admin` and its Zod refuses one.
--
--   1 · add_member()      — 0204's definition, byte for byte, minus the `role_not_allowed` refusal.
--   2 · set_member_role() — 0005's definition; the last-admin guard now counts only admins who have SIGNED IN
--                           (`auth_user_id is not null`). Before this migration no admin row could exist without
--                           one, so the guard never had to ask. Now an admin added by email exists before they
--                           arrive, and the acting admin must not be able to demote themselves and leave the
--                           org with nobody who can sign in as its admin.
--
-- Policy rows (03 §8.2):
--   | `RPC-add_member.admin_by_email`   | An admin adds an address as `admin`; the row carries the role and binds
--     at first sign-in. A moderator and a member are still refused `42501` by `assert_fresh_admin()`. |
--   | `RPC-set_member_role.last_admin_arrived` | The last admin who has signed in cannot be demoted while every
--     other admin row is unbound: `last_admin`, `42501`. |

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · add_member()
-- ═══════════════════════════════════════════════════════════════════════════
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

  -- ★ 0211 (DEC-261, the owner's ruling): an admin MAY add another admin by email. DEC-244 §11's refusal is
  -- withdrawn. What it guarded against — a standing grant to whoever controls a mailbox — is the owner's accepted
  -- risk; what remains guarded is that an admin who has not arrived never counts as the org's last admin
  -- (set_member_role(), below).

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

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · set_member_role() — the last admin is the last one who can sign in
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.set_member_role(p_member uuid, p_role public.org_role) returns public.members
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
  -- ★ 0211: only an admin who has arrived counts. Demoting an unbound admin row is never refused by this guard —
  -- the actor is themselves a signed-in admin and stays one.
  if target.org_role = 'admin' and target.auth_user_id is not null and not exists (
    select 1 from public.members x
     where x.org_id = actor.org_id and x.org_role = 'admin' and x.status = 'active'
       and x.auth_user_id is not null and x.id <> target.id
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

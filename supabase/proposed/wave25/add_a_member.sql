-- add_a_member.sql — wave 25, M27. Proposed by the lead; promoted with a number once the
-- certificate hotfix has claimed its own (0194 is taken by 0194_certificate_mode_after_completion).
--
-- Serves:  REQ-TEN-009 (an admin adds a عضو, and they are a member at once)
--          REQ-TEN-010 (an added member is admitted where the domain list would refuse)
--          REQ-TEN-011 (first sign-in BINDS the waiting row; it never creates a second)
-- Decided: DEC-243 (the capability), DEC-244 (the shape — an invitation table was proposed and
--          withdrawn the same day: a row nothing may reference cannot «take effect»)
-- Cites:   0004 (members, members_org_immutable, members_company_same_org), 0005 (provision_member,
--          write_audit, assert_fresh_admin), 0006 (the access-token hook AND its existing
--          `grant select on public.members to supabase_auth_admin` — the reason this migration adds
--          no grant), 0007 (before_user_created_hook), 0025 (enqueue_job), 0056 (admin_list_members),
--          0139 (send_test_email — the shape this wave's mail job copies)
--
-- ── What this does NOT do, on purpose ───────────────────────────────────────────────────────────
--   * No new table and no new enum. DEC-244 withdrew ENT-member_invitations: an added person is a
--     `members` row from the moment the admin saves it, so every surface that lists members lists
--     them, every picker offers them, and they can be assigned as a presenter — which is the whole
--     requirement. A table beside `members` met «appear» and failed «take effect».
--   * No third `member_status`. «Has signed in» is the derived boolean `auth_user_id is not null`,
--     so the 54 `status = 'active'` sites in this schema keep their meaning untouched.
--   * No new grant. `0006` already grants `select on public.members` to `supabase_auth_admin`.
--   * No `auth.users` row is created here or anywhere. The person signs in with Google (REQ-AUT-001);
--     this migration only lets their row exist first.
--
-- ── 03 §8.2 rows this migration needs ──────────────────────────────────────────────────────────
--   | `RPC-add_member.admin_only` | A moderator and a member are refused `42501` by
--     `assert_fresh_admin()`; the role is re-read from the table against `claims_version`, so a
--     demoted admin's stale token cannot add anybody. |
--   | `RPC-add_member.no_admin_by_email` | `p_role` accepts `member` and `moderator` only. An
--     invitation is a standing grant to whoever controls a mailbox, so `admin` is granted to a
--     member who has ARRIVED, through `set_member_role()` (0005), which guards the last admin and
--     audits. `admin` is refused `22023`. |
--   | `RPC-add_member.refuses_an_existing_member` | An address already present in the org — bound or
--     not — is refused `already_a_member`, so the bind branch of `provision_member()` can never
--     race the insert branch. |
--   | `RPC-add_member.company_must_be_the_org_s` | Enforced by `members_company_same_org` (0004),
--     unchanged: a company of another org raises `23503`. |
--   | `RPC-remove_unbound_member.only_while_unbound` | The delete is refused `22023` the moment
--     `auth_user_id` is set. Once a person has arrived the only way out is `REQ-AUT-008`'s
--     deactivation, with its mandatory reason. |
--   | `RPC-resend_member_invitation.only_while_unbound` | A member who has signed in, or who is
--     deactivated, is refused — nothing is enqueued. |
--   | `POL-members.unbound_row_is_an_ordinary_row` | A null `auth_user_id` changes no policy. The
--     policy set of `members` (0004: `members_read_org`, `members_update_self`) and its column
--     grants are untouched, and `auth_user_id` is outside the grant, so no client role can read it
--     — an admin sees the derived boolean from `admin_list_members()` and never the binding. |
--   | `FN-provision_member.binds_once` | `where auth_user_id is null` in the bind is the lock: a
--     concurrent double sign-in binds exactly once and creates no second member. |
--   | `FN-provision_member.never_rebinds` | A bound row is matched by `auth_user_id` first, so a
--     DIFFERENT account presenting the same address still raises `email_already_member`. |
--   | `FN-before_user_created_hook.admits_an_added_member` | An `active`, unbound member row in an
--     `active` org admits a sign-up the domain list would refuse. |
--   | `FN-before_user_created_hook.still_fails_open` | The new read sits INSIDE the existing
--     exception block; any error returns the event unchanged. |

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · The two column changes (DEC-244 §3)
-- ═══════════════════════════════════════════════════════════════════════════
-- `unique` and `on delete cascade` are NOT touched: a Postgres unique constraint permits many
-- nulls, so the constraint keeps its exact meaning for every row that has a binding.
alter table public.members alter column auth_user_id drop not null;

-- Who added them. Null for everyone who arrived through the front door. `on delete set null`
-- because the record that matters is `audit_log`'s `member.added` row, which is append-only and
-- outlives any member (invariant 9) — this column is a convenience for the screen, not the
-- evidence, so it must never restrict a delete.
alter table public.members add column invited_by uuid references public.members(id) on delete set null;

comment on column public.members.auth_user_id is
  'The auth user. NULL means an admin added this person (DEC-244) and they have not signed in yet: '
  'the row is active and complete, and their first sign-in BINDS it. Never exposed to a client '
  'role — it is outside the column grant; admins read the derived boolean from admin_list_members().';
comment on column public.members.invited_by is
  'The admin who added this member, for the screen. audit_log holds the evidence (member.added).';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · admin_list_members() — one list, one kind of row, plus the derived boolean
-- ═══════════════════════════════════════════════════════════════════════════
-- `create or replace` cannot widen a `returns table`, so the old signature is dropped in this same
-- file — 0085's lesson: PostgREST must never see two overloads.
drop function if exists public.admin_list_members();
create function public.admin_list_members()
returns table (
  id                   uuid,
  email                extensions.citext,
  display_name         text,
  avatar_url           text,
  company_id           uuid,
  job_title            text,
  bio                  text,
  org_role             public.org_role,
  status               public.member_status,
  leaderboard_opt_out  boolean,
  deactivated_at       timestamptz,
  deactivated_reason   text,
  created_at           timestamptz,
  has_signed_in        boolean,
  invited_by           uuid
)
language sql stable security definer set search_path = '' as $$
  select m.id, m.email, m.display_name, m.avatar_url, m.company_id, m.job_title, m.bio,
         m.org_role, m.status, m.leaderboard_opt_out, m.deactivated_at, m.deactivated_reason,
         m.created_at,
         -- The binding itself never leaves this function (DEC-244 §2.5).
         (m.auth_user_id is not null) as has_signed_in,
         m.invited_by
    from public.members m
   where m.org_id = public.auth_org_id()
     and public.is_org_admin()
$$;
revoke execute on function public.admin_list_members from public, anon;
grant  execute on function public.admin_list_members to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · add_member() — REQ-TEN-009
-- ═══════════════════════════════════════════════════════════════════════════
create function public.add_member(
  p_email        text,
  p_display_name text default null,
  p_company      uuid default null,
  p_job_title    text default null,
  p_role         public.org_role default 'member'
) returns public.members
language plpgsql security definer set search_path = '' as $$
declare
  actor  public.members := public.assert_fresh_admin();
  v_mail extensions.citext;
  m      public.members;
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

  -- auth_user_id stays NULL: this is the row waiting for its auth user. Everything else is set,
  -- which is what makes them a member the admin can use immediately.
  insert into public.members (org_id, email, display_name, company_id, job_title, org_role, invited_by)
  values (actor.org_id, v_mail,
          nullif(btrim(coalesce(p_display_name, '')), ''),
          p_company,
          nullif(btrim(coalesce(p_job_title, '')), ''),
          p_role, actor.id)
  returning * into m;

  perform public.write_audit(m.org_id, 'member.added', 'member', m.id, null,
                             jsonb_build_object('email', m.email, 'org_role', m.org_role,
                                                'company_id', m.company_id),
                             null, actor.org_role::text, actor.id);

  -- The payload names the MEMBER and carries no address (0139's rule): a forged or replayed job
  -- can mail nobody but this member.
  perform public.enqueue_job('send_member_invitation',
                             jsonb_build_object('org_id', m.org_id, 'member_id', m.id),
                             'invite:' || m.id::text);
  return m;
end $$;
revoke execute on function public.add_member from public, anon;
grant  execute on function public.add_member to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · add_members() — the pasted list, with a per-line report
-- ═══════════════════════════════════════════════════════════════════════════
-- One call, one transaction, and a sub-transaction per line (plpgsql's exception block), so one
-- bad address reports itself instead of aborting the other nine.
create function public.add_members(p_emails text[], p_company uuid default null,
                                   p_role public.org_role default 'member')
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_line   text;
  v_out    jsonb := '[]'::jsonb;
  m        public.members;
begin
  perform public.assert_fresh_admin();
  foreach v_line in array coalesce(p_emails, array[]::text[]) loop
    if btrim(coalesce(v_line, '')) = '' then
      continue;
    end if;
    begin
      -- Named arguments, not positional: `add_member`'s fourth parameter is `p_job_title`, so
      -- a positional call here would write the ROLE into the job title. Caught by
      -- `add-a-member.test.ts`'s per-line report case.
      m := public.add_member(p_email => v_line, p_company => p_company, p_role => p_role);
      v_out := v_out || jsonb_build_object('email', btrim(v_line), 'outcome', 'added',
                                           'member_id', m.id);
    exception
      when others then
        v_out := v_out || jsonb_build_object('email', btrim(v_line),
                                             'outcome', coalesce(sqlerrm, 'failed'));
    end;
  end loop;
  return v_out;
end $$;
revoke execute on function public.add_members from public, anon;
grant  execute on function public.add_members to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 5 · resend_member_invitation() and remove_unbound_member()
-- ═══════════════════════════════════════════════════════════════════════════
create function public.resend_member_invitation(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor  public.members := public.assert_fresh_admin();
  target public.members;
begin
  select * into target from public.members
   where id = p_member and org_id = actor.org_id;
  if target.id is null then
    raise exception 'member_not_found' using errcode = '42501';
  end if;
  -- Nothing is sent to somebody who has already arrived, or who has been deactivated.
  if target.auth_user_id is not null or target.status <> 'active' then
    raise exception 'already_signed_in' using errcode = '22023';
  end if;
  perform public.write_audit(target.org_id, 'member.invite_resent', 'member', target.id, null,
                             jsonb_build_object('email', target.email),
                             null, actor.org_role::text, actor.id);
  perform public.enqueue_job('send_member_invitation',
                             jsonb_build_object('org_id', target.org_id, 'member_id', target.id),
                             'invite:' || target.id::text);
end $$;
revoke execute on function public.resend_member_invitation from public, anon;
grant  execute on function public.resend_member_invitation to authenticated;

-- A mistyped address is deleted, not deactivated with a reason (DEC-244 §7). It is safe by
-- construction: an unbound member has no attendance, ledger row, certificate, RSVP or comment,
-- because none of those can be created without a session. The audit row is written BEFORE the
-- delete and outlives it — audit_log.subject_id carries no foreign key, by design.
create function public.remove_unbound_member(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  actor  public.members := public.assert_fresh_admin();
  target public.members;
begin
  select * into target from public.members
   where id = p_member and org_id = actor.org_id;
  if target.id is null then
    raise exception 'member_not_found' using errcode = '42501';
  end if;
  if target.auth_user_id is not null then
    raise exception 'already_signed_in' using errcode = '22023';
  end if;
  perform public.write_audit(target.org_id, 'member.add_undone', 'member', target.id,
                             jsonb_build_object('email', target.email,
                                                'org_role', target.org_role),
                             null, null, actor.org_role::text, actor.id);
  delete from public.members where id = target.id;
end $$;
revoke execute on function public.remove_unbound_member from public, anon;
grant  execute on function public.remove_unbound_member to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 6 · provision_member() — one new branch: BIND, never insert (REQ-TEN-011)
-- ═══════════════════════════════════════════════════════════════════════════
-- Replaced whole from 0005. The only change is the block marked «DEC-244 §4», which sits between
-- «already a member» and the domain resolution — it must come BEFORE the domain match, because an
-- added person's domain is exactly what the list does not have.
--
-- REQ-AUT-002 is NOT amended: a member is still keyed to the auth user. The email is what the
-- admin addressed, used once, here, and never again.
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

    select * into v_org from public.orgs where id = m.org_id;
    perform public.write_audit(m.org_id, 'member.claimed', 'member', m.id, null,
                               jsonb_build_object('email', m.email, 'org_role', m.org_role),
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
-- 7 · before_user_created_hook() — one more reason to admit (REQ-TEN-010)
-- ═══════════════════════════════════════════════════════════════════════════
-- Replaced whole from 0007. ★ The new read sits INSIDE the existing begin/exception block and the
-- `when others then return event` is unchanged, so a failure here still admits every sign-in the
-- domain list would have allowed. This function is the single point of failure for all sign-in.
--
-- ★ NO NEW GRANT: `0006` already grants `select on public.members` to `supabase_auth_admin`.
create or replace function public.before_user_created_hook(event jsonb) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_email  text := lower(coalesce(event -> 'user' ->> 'email', ''));
  v_domain text;
begin
  if v_email = '' then
    return event;
  end if;
  v_domain := split_part(v_email, '@', 2);
  if exists (
    select 1
      from public.org_domains d
      join public.orgs o on o.id = d.org_id
     where lower(d.domain::text) = v_domain
       and o.status = 'active'
  ) then
    return event;
  end if;
  -- ★ DEC-244 §5 — an admin added this address: admit it, whatever the domain list says. The
  -- admission ends when the row is bound (they have arrived) or the member is deactivated, which
  -- makes REQ-AUT-008's deactivation the control that closes this door.
  if exists (
    select 1
      from public.members w
      join public.orgs o on o.id = w.org_id
     where lower(w.email::text) = v_email
       and w.auth_user_id is null
       and w.status = 'active'
       and o.status = 'active'
  ) then
    return event;
  end if;
  -- The message is an identifier the sign-in screen maps to Arabic copy
  -- that names no org and lists no domains (REQ-AUT-006).
  return jsonb_build_object(
    'error', jsonb_build_object('http_code', 403, 'message', 'domain_not_allowed')
  );
exception
  when others then
    return event;
end $$;

grant usage on schema public to supabase_auth_admin;
grant execute on function public.before_user_created_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.before_user_created_hook(jsonb) from public, anon, authenticated;
grant select on public.org_domains, public.orgs to supabase_auth_admin;

-- ═══════════════════════════════════════════════════════════════════════════
-- 8 · ★★ The active-member denominator counts the members who HAVE SIGNED IN
-- ═══════════════════════════════════════════════════════════════════════════
-- `DEC-244` §6, `REQ-LDR-006`. This is the one thing the nullable column would otherwise break,
-- and it would break it quietly, in data nobody is looking at — so it ships in the same change.
--
-- ★ `DEC-244` §6 said «four predicates in one function». MEASURED: it is **five predicates across
-- two**, because `0182` defines a second live counter. Corrected here; the `DECISIONS.md` entry
-- that records the correction is written when wave 25's PR opens, and it takes whatever number is
-- free then — this comment cites no number, because a cited-ahead id is the trap `CLAUDE.md`
-- names and it has already cost this repo twice (`DEC-177`, `DEC-180`):
--   * `snapshot_leaderboard()` (`0176`) — the org-wide denominator frozen into every snapshot, and
--     the two per-company counts that rank the company race.
--   * `evaluate_company_points()` (`0182`) — the denominators of `company_attendance_pct` and
--     `company_presenting_pct`, which AWARD points. Left alone, adding five colleagues by hand
--     would lower their own company's award at the next session completion.
--
-- ★ Why this is the right reading and not a convenience: `points_per_active_member` asks «how much
-- does this company's average member contribute». A person who has never signed in has not
-- declined to contribute — they have not been asked. Counting them penalises a company for an
-- admin's typing, and `A11`/`DEC-016` froze the denominator into the snapshot precisely so it
-- could not be rewritten by a side door. This is that door, closed before it is opened.
--
-- ★★ It is provably a NO-OP for everything that exists: `auth_user_id` is `not null` until §1 of
-- this file runs, so every member already satisfies the predicate and every stored snapshot and
-- live derivation is byte-identical. `add-a-member.test.ts` asserts it on the fixture.
--
-- Both functions are replaced WHOLE, as `0176` replaced `0081` — the house pattern, so the diff
-- is reviewable. Nothing else in either body changes.

create or replace function public.snapshot_leaderboard(
  p_org          uuid,
  p_kind         public.leaderboard_kind,
  p_period_start date default null,
  p_period_end   date default null,
  p_category_id  uuid default null,
  p_is_final     boolean default false
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_snapshot_id  uuid;
  v_active_count int;
  v_metric       public.company_metric;
  v_min          int;
begin
  select count(*) into v_active_count from public.members
   where org_id = p_org and status = 'active' and auth_user_id is not null;
  select company_metric, company_min_active_members into v_metric, v_min from public.org_settings where org_id = p_org;

  delete from public.leaderboard_snapshots
   where org_id = p_org and kind = p_kind
     and period_start is not distinct from p_period_start
     and period_end   is not distinct from p_period_end
     and category_id  is not distinct from p_category_id
     and not is_final;

  insert into public.leaderboard_snapshots (org_id, kind, period_start, period_end, category_id, metric, active_member_count, min_active_members, is_final)
  values (p_org, p_kind, p_period_start, p_period_end, p_category_id,
          case when p_kind = 'company' then v_metric else null end,
          v_active_count,
          case when p_kind = 'company' then v_min else null end,
          p_is_final)
  returning id into v_snapshot_id;

  if p_kind in ('monthly', 'seasonal') then
    insert into public.leaderboard_entries (org_id, snapshot_id, member_id, rank, points)
    select p_org, v_snapshot_id, totals.member_id, rank() over (order by totals.total desc), totals.total
      from (
        select member_id, sum(amount) as total
          from public.points_ledger
         where org_id = p_org
           and (p_period_start is null or occurred_at >= p_period_start::timestamptz)
           and (p_period_end   is null or occurred_at <  p_period_end::timestamptz)
         group by member_id
      ) totals
     where totals.total > 0;

  elsif p_kind = 'topic' then
    insert into public.leaderboard_entries (org_id, snapshot_id, member_id, rank, points)
    select p_org, v_snapshot_id, totals.member_id, rank() over (order by totals.total desc), totals.total
      from (
        select pl.member_id, sum(pl.amount) as total
          from public.points_ledger pl
          join public.sessions s on s.id = pl.session_id
         where pl.org_id = p_org and s.category_id = p_category_id
         group by pl.member_id
      ) totals
     where totals.total > 0;

  elsif p_kind = 'company' then
    insert into public.leaderboard_entries (org_id, snapshot_id, company_id, rank, points, points_per_active_member)
    select p_org, v_snapshot_id, agg.company_id,
           -- ★ wave 20, PR C (REQ-UIX-082): companies with at least the org's minimum of active members rank FIRST, the
           -- rest after them — every rank stays > 0 (0027:475), the cup's #1 is always eligible, and the minimum is
           -- frozen on the snapshot row above, so a final board never moves when the setting does.
           rank() over (order by (agg.active >= coalesce(v_min, 1)) desc,
                                 (case when v_metric = 'points_per_active_member' then agg.ppam else agg.total end) desc nulls last),
           agg.total, agg.ppam
      from (
        select c.id as company_id,
               coalesce(m_totals.total, 0) + coalesce(c_totals.total, 0) as total,
               (coalesce(m_totals.total, 0) + coalesce(c_totals.total, 0))::numeric / nullif(
                 (select count(*) from public.members mm where mm.org_id = p_org and mm.status = 'active'
                    and mm.auth_user_id is not null and mm.company_id = c.id),
                 0
               ) as ppam,
               (select count(*) from public.members mm where mm.org_id = p_org and mm.status = 'active'
                    and mm.auth_user_id is not null and mm.company_id = c.id) as active
          from public.companies c
          left join (
            select m.company_id, sum(pl.amount) as total
              from public.points_ledger pl
              join public.members m on m.id = pl.member_id
             where pl.org_id = p_org and m.company_id is not null
               and (p_period_start is null or pl.occurred_at >= p_period_start::timestamptz)
               and (p_period_end   is null or pl.occurred_at <  p_period_end::timestamptz)
             group by m.company_id
          ) m_totals on m_totals.company_id = c.id
          left join (
            select cl.company_id, sum(cl.amount) as total
              from public.company_points_ledger cl
             where cl.org_id = p_org
               and (p_period_start is null or cl.occurred_at >= p_period_start::timestamptz)
               and (p_period_end   is null or cl.occurred_at <  p_period_end::timestamptz)
             group by cl.company_id
          ) c_totals on c_totals.company_id = c.id
         where c.org_id = p_org and coalesce(m_totals.total, 0) + coalesce(c_totals.total, 0) <> 0
      ) agg;
  end if;

  return v_snapshot_id;
end $$;
revoke execute on function public.snapshot_leaderboard(uuid, public.leaderboard_kind, date, date, uuid, boolean)
  from public, anon, authenticated;
grant  execute on function public.snapshot_leaderboard(uuid, public.leaderboard_kind, date, date, uuid, boolean)
  to service_role;

create or replace function public.evaluate_company_points(p_session uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s       public.sessions;
  r_host  public.company_scoring_rules;
  r_att   public.company_scoring_rules;
  r_pres  public.company_scoring_rules;
  v_key   text;
  v_pts   int;
  rec     record;
begin
  select * into s from public.sessions where id = p_session;
  if not found then
    return;   -- the session row is gone; nothing to evaluate (DEC-059's terminal-row pattern)
  end if;

  select * into r_host from public.company_scoring_rules where org_id = s.org_id and action_key = 'company_hosting';
  select * into r_att  from public.company_scoring_rules where org_id = s.org_id and action_key = 'company_attendance_pct';
  select * into r_pres from public.company_scoring_rules where org_id = s.org_id and action_key = 'company_presenting_pct';

  -- Rule 1 — company_hosting: the company that OWNS THE PLACE of each of the session's days, once each (header).
  -- `r_host.id is not null`, not `r_host is not null`: a hosting rule's own shape leaves its percent fields NULL, and a
  -- composite IS NOT NULL is true only when every field is (0081's note, kept).
  if r_host.id is not null and r_host.enabled
     and not exists (select 1 from public.company_points_ledger l
                      where l.session_id = p_session and l.source = 'company_hosting') then
    for rec in
      select distinct v.company_id
        from public.session_days d
        join public.venues v on v.id = d.venue_id
        join public.companies c on c.id = v.company_id and c.org_id = s.org_id
       where d.session_id = p_session
         and c.deactivated_at is null
    loop
      v_key := format('company_hosting:session_delivered:%s:%s:v1', p_session, rec.company_id);
      insert into public.company_points_ledger
        (org_id, company_id, amount, source, source_id, session_id, reason, rule_key, rule_version, idempotency_key)
      values (s.org_id, rec.company_id, r_host.points, 'company_hosting', p_session, p_session,
              r_host.reason_ar, 'company_hosting', r_host.version, v_key)
      on conflict (idempotency_key) do nothing;
    end loop;
  end if;

  -- Rule 2 — company_attendance_pct: for every company with at least one
  -- checked-in member at THIS session, the share of that company's own
  -- active roster who attended (b, the open question in the header: scoped
  -- to any company, not just the session's host).
  if r_att.id is not null and r_att.enabled then
    for rec in
      -- ★ TWO CORRECTIONS, both named difference 2 (DEC-151 answer 3):
      --   * count(distinct ci.member_id), not count(*) — three check-ins on a
      --     three-day workshop are ONE member who attended, and count(*) would
      --     have tripled every company's share.
      --   * removed_at is null — 0088 corrected seven readers for DEC-141 and
      --     missed this one, so an admin's retracted check-in still counted
      --     toward its company's percentage. Byte-identical means no
      --     regression, not the preservation of a defect.
      -- Identical at n = 1 apart from the removal, which is the fix.
      select m.company_id,
             count(distinct ci.member_id) as attended,
             (select count(*) from public.members mm
               where mm.org_id = s.org_id and mm.status = 'active'
                 and mm.auth_user_id is not null and mm.company_id = m.company_id) as active
        from public.check_ins ci
        join public.members m on m.id = ci.member_id
       where ci.session_id = p_session and ci.removed_at is null and m.company_id is not null
       group by m.company_id
    loop
      if rec.active >= r_att.min_active_members then
        v_pts := least(r_att.cap_points, round((rec.attended::numeric / rec.active) * 100 * r_att.points_per_percent)::int);
        if v_pts > 0 then
          v_key := format('company_attendance_pct:session_completed:%s:%s:v1', p_session, rec.company_id);
          insert into public.company_points_ledger
            (org_id, company_id, amount, source, source_id, session_id, reason, rule_key, rule_version, idempotency_key, meta)
          values (s.org_id, rec.company_id, v_pts, 'company_attendance_pct', p_session, p_session,
                  r_att.reason_ar, 'company_attendance_pct', r_att.version, v_key,
                  jsonb_build_object('attended', rec.attended, 'active_members', rec.active,
                                      'percent', round((rec.attended::numeric / rec.active) * 100, 1)))
          on conflict (idempotency_key) do nothing;
        end if;
      end if;
    end loop;
  end if;

  -- Rule 3 — company_presenting_pct: same shape, over accepted
  -- session_presenters.
  if r_pres.id is not null and r_pres.enabled then
    for rec in
      select m.company_id,
             count(*) as presenting,
             (select count(*) from public.members mm
               where mm.org_id = s.org_id and mm.status = 'active'
                 and mm.auth_user_id is not null and mm.company_id = m.company_id) as active
        from public.session_presenters sp
        join public.members m on m.id = sp.member_id
       where sp.session_id = p_session and sp.accepted and m.company_id is not null
       group by m.company_id
    loop
      if rec.active >= r_pres.min_active_members then
        v_pts := least(r_pres.cap_points, round((rec.presenting::numeric / rec.active) * 100 * r_pres.points_per_percent)::int);
        if v_pts > 0 then
          v_key := format('company_presenting_pct:session_completed:%s:%s:v1', p_session, rec.company_id);
          insert into public.company_points_ledger
            (org_id, company_id, amount, source, source_id, session_id, reason, rule_key, rule_version, idempotency_key, meta)
          values (s.org_id, rec.company_id, v_pts, 'company_presenting_pct', p_session, p_session,
                  r_pres.reason_ar, 'company_presenting_pct', r_pres.version, v_key,
                  jsonb_build_object('presenting', rec.presenting, 'active_members', rec.active,
                                      'percent', round((rec.presenting::numeric / rec.active) * 100, 1)))
          on conflict (idempotency_key) do nothing;
        end if;
      end if;
    end loop;
  end if;
end $$;

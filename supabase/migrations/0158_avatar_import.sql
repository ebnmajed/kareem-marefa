-- 0158 · promoted by the lead from supabase/proposed/platform/0010_avatar_import.sql (e044e1e) — platform (wave 14): Google's photo copied into our storage, never hotlinked.
--
-- Serves:  01 REQ-PRF-008 (the import half), REQ-PRF-009, REQ-PRF-010, REQ-PRF-011,
--          REQ-NFR-014 · 11 §2.4 JOB-import_avatar · DEC-099, DEC-180 §3, DEC-182
-- Needs:   the lead's 0157 — enum `avatar_import_answer`, `members.avatar_import`,
--          `members.avatar_version`, the `avatars` bucket and `avatars_storage_read`.
--          This file writes NO table, column, bucket or policy.
--
-- ★ `members.avatar_url` STAYS GOOGLE'S SOURCE. `provision_member()` (0005:124)
--   refreshes it on every sign-in and nothing here renders it; these functions
--   read it only to tell the worker what to copy, through `avatar_job_target()`,
--   which only `service_role` may call.
--
-- ★ THE INVARIANT THE WRITERS HOLD: `avatar_version` is non-null only while
--   `avatar_import = 'accepted'` and both derivatives are stored. Every writer
--   below keeps it — a decline and an anonymisation clear it IN THE STATEMENT
--   that records them, so `avatars_storage_read` stops serving the picture at
--   once («removal is immediate», REQ-PRF-008) and the job deletes the bytes
--   after. `record_avatar_copy()` sets it only after the upload, and only if the
--   member still said yes to the very source that was copied.
--
-- ★ ONE JOB, ONE KEY. Every path enqueues `import_avatar` under `avatar:{id}` on
--   the `convert` queue, 3 attempts (11 §2.4). `enqueue_job()` replaces a pending
--   job, and the job reconciles storage to the row as it stands when it runs,
--   so a replaced job loses nothing.
--
-- 03 §8.2 rows: RPC-set_avatar_import.self_only, .decline_clears_version,
--   .no_source, .audited · RPC-my_avatar.self_only · RPC-avatar_job_target.worker_only
--   · RPC-record_avatar_copy.worker_only, .stale_when_declined, .stale_when_source_changed
--   · TRG-members_avatar_source_changed.accepted_only · RPC-anonymise_members.avatar
--   · RPC-avatar_member_orgs.worker_only

-- ═══════════════════════════════════════════════════════════════════════════
-- 1. The member's answer — «نستخدم صورتك من Google؟». Self only.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.set_avatar_import(p_answer public.avatar_import_answer) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  m public.members := public.assert_active_member();
begin
  if p_answer is null then
    raise exception 'answer_required' using errcode = '22023';
  end if;

  update public.members
     set avatar_import  = p_answer,
         avatar_version = case when p_answer = 'declined' then null else avatar_version end
   where id = m.id;

  -- Consent is evidence (REQ-NFR-012): the org's log says who answered what, when.
  perform public.write_audit(m.org_id, 'member.avatar_import_answered', 'member', m.id,
                             jsonb_build_object('answer', m.avatar_import),
                             jsonb_build_object('answer', p_answer),
                             null, m.org_role::text, m.id);

  -- After the first write, an outcome envelope — never a raise (DEC-043).
  if p_answer = 'declined' then
    -- Objects can exist only for a member who once said yes.
    if m.avatar_import = 'accepted' or m.avatar_version is not null then
      perform public.enqueue_job('import_avatar', jsonb_build_object('member_id', m.id),
                                 'avatar:' || m.id::text, null, 'convert', 3);
    end if;
    return jsonb_build_object('status', 'ok');
  end if;

  if m.avatar_url is null then
    return jsonb_build_object('status', 'no_source');
  end if;
  perform public.enqueue_job('import_avatar', jsonb_build_object('member_id', m.id),
                             'avatar:' || m.id::text, null, 'convert', 3);
  return jsonb_build_object('status', 'ok');
end $fn$;
revoke execute on function public.set_avatar_import(public.avatar_import_answer) from public, anon, service_role;
grant  execute on function public.set_avatar_import(public.avatar_import_answer) to authenticated;

-- The member's own state, for the prompt and /app/me/privacy. `avatar_import`
-- is in no client grant; this is its one reader. Never the source URL — only
-- whether there is one.
create function public.my_avatar() returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object(
    'answer', m.avatar_import,
    'has_source', m.avatar_url is not null,
    'version', m.avatar_version
  )
  from public.members m
  where m.id = public.auth_member_id() and m.org_id = public.auth_org_id() and m.status = 'active'
$fn$;
revoke execute on function public.my_avatar() from public, anon, service_role;
grant  execute on function public.my_avatar() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2. The worker's two doors (CLAUDE.md § Data access 6). service_role only.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.avatar_job_target(p_member uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object(
    'org_id', m.org_id,
    'answer', m.avatar_import,
    'source_url', m.avatar_url,
    'version', m.avatar_version,
    'anonymised', m.anonymised_at is not null
  )
  from public.members m
  where m.id = p_member
$fn$;
revoke execute on function public.avatar_job_target(uuid) from public, anon, authenticated;
grant  execute on function public.avatar_job_target(uuid) to service_role;

-- The copy is recorded only if it is still wanted: the member still says yes,
-- the source is still the one that was fetched, the member is not anonymised,
-- and the version moves forward. Otherwise `stale`, with the version the row
-- still holds, so the job keeps exactly that and deletes the rest.
create function public.record_avatar_copy(p_member uuid, p_version bigint, p_source text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v_version bigint;
begin
  update public.members
     set avatar_version = p_version
   where id = p_member
     and avatar_import = 'accepted'
     and anonymised_at is null
     and avatar_url is not distinct from p_source
     and (avatar_version is null or avatar_version < p_version)
  returning avatar_version into v_version;
  if v_version is not null then
    return jsonb_build_object('status', 'recorded', 'version', v_version);
  end if;
  select avatar_version into v_version from public.members where id = p_member;
  return jsonb_build_object('status', 'stale', 'version', v_version);
end $fn$;
revoke execute on function public.record_avatar_copy(uuid, bigint, text) from public, anon, authenticated;
grant  execute on function public.record_avatar_copy(uuid, bigint, text) to service_role;

-- The prefix assertion's second question for `avatars` (DEC-182): does the
-- member a path names belong to the org the path is filed under?
create function public.avatar_member_orgs(p_members uuid[]) returns table (member_id uuid, org_id uuid)
language sql stable security definer set search_path = '' as $fn$
  select m.id, m.org_id from public.members m where m.id = any (p_members)
$fn$;
revoke execute on function public.avatar_member_orgs(uuid[]) from public, anon, authenticated;
grant  execute on function public.avatar_member_orgs(uuid[]) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3. A changed source re-copies, for a member who said yes (REQ-PRF-001's
--    refresh). A trigger, so `provision_member()` — the lead's — is untouched.
--    Definer, because the writer it fires under may be anyone the table lets
--    update `avatar_url` — today only `provision_member()` and anonymisation.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.members_avatar_source_changed() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  perform public.enqueue_job('import_avatar', jsonb_build_object('member_id', new.id),
                             'avatar:' || new.id::text, null, 'convert', 3);
  return null;
end $fn$;
revoke execute on function public.members_avatar_source_changed() from public, anon, authenticated, service_role;

create trigger members_avatar_source_changed
  after update of avatar_url on public.members
  for each row
  when (old.avatar_url is distinct from new.avatar_url and new.avatar_import = 'accepted')
  execute function public.members_avatar_source_changed();

-- ═══════════════════════════════════════════════════════════════════════════
-- 4. anonymise_members — 0073's text, with the picture (REQ-PRF-011). Same
--    signature, same grants, the same summary keys (`anonymised`, `after_days`).
--    The row loses its answer and its version in the anonymising statement, so
--    the read stops at once; the job deletes every object under the prefix.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.anonymise_members() returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_days int;
  m      record;
  n      int := 0;
begin
  select days into v_days from public.retention_periods where data_class = 'deactivated_members';
  if v_days is null then
    raise exception 'retention_period_missing: deactivated_members' using errcode = '22023';
  end if;

  for m in
    select id, org_id, email, avatar_import, avatar_version from public.members
     where status = 'deactivated'
       and anonymised_at is null
       and deactivated_at < now() - make_interval(days => v_days)
  loop
    update public.members
       set display_name = null,
           -- The address must stay UNIQUE per org (0004's `unique (org_id, email)`)
           -- and must no longer be a person's. The member's own id is the one
           -- value guaranteed unique and already stored in the ledger.
           email          = ('anon+' || id::text || '@invalid.local')::extensions.citext,
           avatar_url     = null,
           avatar_import  = null,
           avatar_version = null,
           job_title      = null,
           bio            = null,
           company_id     = null,
           anonymised_at  = now()
     where id = m.id;

    -- Interests are a personal profile, not content anyone depends on.
    delete from public.member_interests where member_id = m.id;

    -- REQ-PRF-011: «no storage object remains». Only a member who once said
    -- yes can have one; the job deletes everything under their prefix.
    if m.avatar_import = 'accepted' or m.avatar_version is not null then
      perform public.enqueue_job('import_avatar', jsonb_build_object('member_id', m.id),
                                 'avatar:' || m.id::text, null, 'convert', 3);
    end if;

    perform public.write_audit(m.org_id, 'member.anonymised', 'member', m.id,
                               jsonb_build_object('had_email', true),
                               jsonb_build_object('anonymised', true),
                               'retention', 'system', null);
    n := n + 1;
  end loop;
  return jsonb_build_object('anonymised', n, 'after_days', v_days);
end $fn$;

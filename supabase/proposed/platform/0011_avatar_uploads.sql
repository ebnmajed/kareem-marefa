-- proposed · platform (wave 29, PR B) — the member's own picture: an upload, «من Google», a library pick, «أزل الصورة»,
-- an admin's takedown (DEC-280 §2 – §4, §8; DEC-281; REQ-PRF-008, REQ-PRF-010, REQ-PRF-011, REQ-PRF-016 … REQ-PRF-019,
-- REQ-ADM-010). For the lead to promote as `0223`.
--
-- Needs:   0157 (`avatars`, `avatars_storage_read`), 0158 (the import), 0221 (`avatar_key`, `avatar_source`, the
--          `members_avatar` trigger), 0222 (`avatar_uploads`, `avatar_upload_state`, `avatar-staging`). This file
--          writes NO table, column, bucket, policy or grant on a table — functions and one trigger's condition only.
--
-- ★ THE INVARIANT, WIDENED. 0158 held «`avatar_version` is non-null only while `avatar_import = 'accepted'`». An
--   upload breaks it, so it becomes: `avatar_version` is non-null only while a photo is stored, and `avatar_source`
--   says which — `google` (then the answer is `accepted`) or `upload` (whatever the answer). ★ A GOOGLE PATH NEVER
--   WRITES OVER AN UPLOAD: `record_avatar_copy()` refuses, the refresh trigger does not fire, and a «لا» on the
--   privacy page does not clear it. Only the member's own «من Google» clears an upload first.
-- ★ LEAVING A PHOTO DECLINES GOOGLE. A library pick, «أزل الصورة» and a takedown set an `accepted` answer to
--   `declined` — that answer is what keeps 0158's refresh trigger and an in-flight import alive, and left `accepted`
--   the next sign-in would copy Google over the avatar the member just chose. The flip is audited as the answer it is.
-- ★ «DELETED IN THE SAME TRANSACTION» is, as in 0158, «unreadable in the same statement»: the version moves or
--   clears, `avatars_storage_read` (0157) stops serving the old object at once, and the reconcile job — the only
--   thing that may delete from Storage — removes the bytes after.
-- ★ ONE QUEUE PER MEMBER (DEC-281 §1). Both avatar jobs run on `avatar:{member_id}`, 5 attempts: graphile runs a
--   named queue serially, so every write to one member's picture is serial, and no member waits behind a PDF on
--   `convert` or behind another member.
-- ★ NOT REPORTABLE (DEC-280 §8): nothing here touches `report_target` or `reports`.
--
-- 03 §8.2 rows (tests/rls/avatar-upload.test.ts, avatar-sheet.test.ts, avatar-takedown.test.ts):
--   | `RPC-begin_avatar_upload.self_only` · `.replaces_pending` · `.enqueues` | the caller's row; a second id replaces the first; one job |
--   | `RPC-record_avatar_upload.worker_only` · `.replaces_google_copy` · `.stale_when_cancelled` · `.stale_when_superseded` · `.stale_when_anonymised` | |
--   | `RPC-fail_avatar_upload.worker_only` · `.only_pending` | |
--   | `RPC-record_avatar_copy.never_over_upload` | a refresh never overwrites an upload |
--   | `TRG-members_avatar_source_changed.not_while_upload` | a changed source enqueues nothing while an upload is current |
--   | `RPC-set_avatar_import.decline_keeps_upload` · `.accept_keeps_upload` | |
--   | `RPC-request_avatar_google.replaces_upload` · `.no_source` · `.cancels_pending` · `.keeps_current_copy` | |
--   | `RPC-set_avatar_library.clears_photo` · `.invalid_key` · `.declines_and_audits` · `.cancels_pending` | |
--   | `RPC-remove_avatar_photo.clears` · `.no_photo` | |
--   | `RPC-take_down_avatar.admin_only` · `.audited` · `.library_refused` · `.reverts_to_key` | |
--   | `RPC-anonymise_members.upload` | version, key, source, answer null; the uploads row gone; the reconcile enqueued |
--   | `RPC-my_avatar.sheet_keys` · `RPC-my_avatar_upload.self_only` · `RPC-avatar_job_target.source_and_upload` | |
--   | `POL-avatars_storage_read.upload_current` | an upload's current version is served like a copy |
--   | `ENUM-report_target.no_picture` | unchanged |

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 0. Two internal helpers — no grant to anyone; called only by the definers below.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- The reconcile: `import_avatar` makes storage under a member's prefixes match the row as it stands when it runs.
create function public.enqueue_avatar_reconcile(p_member uuid) returns void
language plpgsql security definer set search_path = '' as $fn$
begin
  perform public.enqueue_job('import_avatar', jsonb_build_object('member_id', p_member),
                             'avatar:' || p_member::text, null, 'avatar:' || p_member::text, 5);
end $fn$;
revoke execute on function public.enqueue_avatar_reconcile(uuid) from public, anon, authenticated, service_role;

-- A member leaves their photo: the version clears (the trigger clears the source; the read stops at once), an
-- `accepted` answer becomes `declined`, a pending upload is cancelled, and the bytes are deleted after. Returns
-- whether there was anything to leave. The caller audits.
create function public.avatar_leave_photo(p_member uuid, p_key text) returns boolean
language plpgsql security definer set search_path = '' as $fn$
declare
  v_had_version boolean;
  v_had_pending boolean;
begin
  select avatar_version is not null into v_had_version from public.members where id = p_member for update;
  update public.avatar_uploads set state = 'cancelled', updated_at = now()
   where member_id = p_member and state = 'pending';
  v_had_pending := found;

  update public.members
     set avatar_key     = coalesce(p_key, avatar_key),
         avatar_version = null,
         avatar_import  = case when avatar_import = 'accepted' then 'declined'::public.avatar_import_answer
                               else avatar_import end
   where id = p_member;

  if v_had_version or v_had_pending then
    perform public.enqueue_avatar_reconcile(p_member);
  end if;
  return coalesce(v_had_version, false) or v_had_pending;
end $fn$;
revoke execute on function public.avatar_leave_photo(uuid, text) from public, anon, authenticated, service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 1. 0158's writers, widened — same names, same signatures, same grants.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- The prompt and /app/me/privacy. ★ A «لا» clears only a GOOGLE copy; a «نعم» never replaces an upload — the sheet's
-- «من Google» does (REQ-PRF-016: the sheet is the only place the picture changes; DEC-281 §3).
create or replace function public.set_avatar_import(p_answer public.avatar_import_answer) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  m public.members := public.assert_active_member();
begin
  if p_answer is null then
    raise exception 'answer_required' using errcode = '22023';
  end if;

  update public.members
     set avatar_import  = p_answer,
         avatar_version = case when p_answer = 'declined' and avatar_source = 'google' then null else avatar_version end
   where id = m.id;

  -- Consent is evidence (REQ-NFR-012): the org's log says who answered what, when.
  perform public.write_audit(m.org_id, 'member.avatar_import_answered', 'member', m.id,
                             jsonb_build_object('answer', m.avatar_import),
                             jsonb_build_object('answer', p_answer),
                             null, m.org_role::text, m.id);

  -- After the first write, an outcome envelope — never a raise (DEC-043).
  if p_answer = 'declined' then
    if m.avatar_source = 'google' or (m.avatar_import = 'accepted' and m.avatar_version is null) then
      perform public.enqueue_avatar_reconcile(m.id);
    end if;
    return jsonb_build_object('status', 'ok');
  end if;

  if m.avatar_url is null then
    return jsonb_build_object('status', 'no_source');
  end if;
  if m.avatar_source is distinct from 'upload' then
    perform public.enqueue_avatar_reconcile(m.id);
  end if;
  return jsonb_build_object('status', 'ok');
end $fn$;

-- The copy is recorded only if it is still wanted (0158) — ★ and never over an upload.
create or replace function public.record_avatar_copy(p_member uuid, p_version bigint, p_source text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v_version bigint;
begin
  update public.members
     set avatar_version = p_version,
         avatar_source  = 'google'
   where id = p_member
     and avatar_import = 'accepted'
     and anonymised_at is null
     and avatar_url is not distinct from p_source
     and avatar_source is distinct from 'upload'
     and (avatar_version is null or avatar_version < p_version)
  returning avatar_version into v_version;
  if v_version is not null then
    return jsonb_build_object('status', 'recorded', 'version', v_version);
  end if;
  select avatar_version into v_version from public.members where id = p_member;
  return jsonb_build_object('status', 'stale', 'version', v_version);
end $fn$;

-- The worker's door, with two more keys: which photo the stored object is, and the member's upload.
create or replace function public.avatar_job_target(p_member uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object(
    'org_id', m.org_id,
    'answer', m.avatar_import,
    'source_url', m.avatar_url,
    'version', m.avatar_version,
    'anonymised', m.anonymised_at is not null,
    'source', m.avatar_source,
    'upload', (select jsonb_build_object('id', u.upload_id, 'state', u.state)
                 from public.avatar_uploads u where u.member_id = m.id)
  )
  from public.members m
  where m.id = p_member
$fn$;

-- The member's own state, for the prompt, /app/me/privacy and the sheet. Never the source URL.
create or replace function public.my_avatar() returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object(
    'answer', m.avatar_import,
    'has_source', m.avatar_url is not null,
    'version', m.avatar_version,
    'key', m.avatar_key,
    'source', m.avatar_source
  )
  from public.members m
  where m.id = public.auth_member_id() and m.org_id = public.auth_org_id() and m.status = 'active'
$fn$;

-- A changed Google source re-copies — ★ never while an upload is current (REQ-PRF-018).
create or replace function public.members_avatar_source_changed() returns trigger
language plpgsql security definer set search_path = '' as $fn$
begin
  perform public.enqueue_avatar_reconcile(new.id);
  return null;
end $fn$;

drop trigger members_avatar_source_changed on public.members;
create trigger members_avatar_source_changed
  after update of avatar_url on public.members
  for each row
  when (old.avatar_url is distinct from new.avatar_url
        and new.avatar_import = 'accepted'
        and new.avatar_source is distinct from 'upload')
  execute function public.members_avatar_source_changed();

-- anonymise_members — 0162's text, with the upload: the row goes, and the reconcile purges both prefixes.
create or replace function public.anonymise_members() returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  v_days    int;
  m         record;
  n         int := 0;
  v_upload  boolean;
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

    -- wave 16 (0162, DEC-197): what the member had seen is a copy of source data
    -- that no one else reads; it goes with the person.
    delete from public.member_seen_marks where member_id = m.id;

    -- wave 29 (DEC-280): the upload bookkeeping goes with the person; the staged bytes with the job below.
    delete from public.avatar_uploads where member_id = m.id;
    v_upload := found;

    -- REQ-PRF-011: «no storage object remains». The job deletes everything under
    -- the member's `avatars` and `avatar-staging` prefixes.
    if m.avatar_import = 'accepted' or m.avatar_version is not null or v_upload then
      perform public.enqueue_avatar_reconcile(m.id);
    end if;

    perform public.write_audit(m.org_id, 'member.anonymised', 'member', m.id,
                               jsonb_build_object('had_email', true),
                               jsonb_build_object('anonymised', true),
                               'retention', 'system', null);
    n := n + 1;
  end loop;
  return jsonb_build_object('anonymised', n, 'after_days', v_days);
end $fn$;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 2. The sheet — four member writes and one read (contract 3). Self only; each one transaction.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- The upload's bytes have landed in `avatar-staging` under the caller's prefix (the route put them there as the
-- member). The path is re-derived by the worker from (org, member, upload) — the client never names one. The
-- picture changes only when the job records it.
create function public.begin_avatar_upload(p_upload uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  m public.members := public.assert_active_member();
begin
  if p_upload is null then
    return jsonb_build_object('status', 'invalid');
  end if;
  insert into public.avatar_uploads (member_id, org_id, upload_id, state, updated_at)
  values (m.id, m.org_id, p_upload, 'pending', now())
  on conflict (member_id) do update
     set upload_id = excluded.upload_id, state = 'pending', updated_at = now();

  perform public.enqueue_job('process_avatar_upload', jsonb_build_object('member_id', m.id),
                             'avatar-upload:' || m.id::text, null, 'avatar:' || m.id::text, 5);
  return jsonb_build_object('status', 'ok');
end $fn$;
revoke execute on function public.begin_avatar_upload(uuid) from public, anon, service_role;
grant  execute on function public.begin_avatar_upload(uuid) to authenticated;

-- The sheet's poll: the caller's own upload, only by its id.
create function public.my_avatar_upload(p_upload uuid) returns jsonb
language sql stable security definer set search_path = '' as $fn$
  select jsonb_build_object('state', u.state, 'version', m.avatar_version, 'key', m.avatar_key)
    from public.avatar_uploads u
    join public.members m on m.id = u.member_id
   where u.member_id = public.auth_member_id()
     and u.org_id = public.auth_org_id()
     and u.upload_id = p_upload
$fn$;
revoke execute on function public.my_avatar_upload(uuid) from public, anon, service_role;
grant  execute on function public.my_avatar_upload(uuid) to authenticated;

-- A library avatar, picked: the key changes and any photo goes with it (DEC-280 §2).
create function public.set_avatar_library(p_key text) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  m public.members := public.assert_active_member();
begin
  if p_key is null or not (p_key = any (public.avatar_library())) then
    return jsonb_build_object('status', 'invalid_key');
  end if;
  perform public.avatar_leave_photo(m.id, p_key);
  if m.avatar_import = 'accepted' then
    perform public.write_audit(m.org_id, 'member.avatar_import_answered', 'member', m.id,
                               jsonb_build_object('answer', 'accepted'),
                               jsonb_build_object('answer', 'declined'),
                               'library', m.org_role::text, m.id);
  end if;
  return jsonb_build_object('status', 'ok');
end $fn$;
revoke execute on function public.set_avatar_library(text) from public, anon, service_role;
grant  execute on function public.set_avatar_library(text) to authenticated;

-- «أزل الصورة»: the photo goes, the key the member holds shows (REQ-PRF-019). Immediate, no confirm.
create function public.remove_avatar_photo() returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  m public.members := public.assert_active_member();
begin
  if not public.avatar_leave_photo(m.id, null) then
    return jsonb_build_object('status', 'no_photo');
  end if;
  if m.avatar_import = 'accepted' then
    perform public.write_audit(m.org_id, 'member.avatar_import_answered', 'member', m.id,
                               jsonb_build_object('answer', 'accepted'),
                               jsonb_build_object('answer', 'declined'),
                               'removed', m.org_role::text, m.id);
  end if;
  return jsonb_build_object('status', 'ok');
end $fn$;
revoke execute on function public.remove_avatar_photo() from public, anon, service_role;
grant  execute on function public.remove_avatar_photo() to authenticated;

-- «من Google» from the sheet (REQ-PRF-018): the answer becomes `accepted`; ★ an upload is cleared in the same
-- statement; a Google copy already current stays until the fresh one lands; the import is enqueued.
create function public.request_avatar_google() returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  m public.members := public.assert_active_member();
begin
  if m.avatar_url is null then
    return jsonb_build_object('status', 'no_source');
  end if;

  update public.avatar_uploads set state = 'cancelled', updated_at = now()
   where member_id = m.id and state = 'pending';
  update public.members
     set avatar_import  = 'accepted',
         avatar_version = case when avatar_source = 'upload' then null else avatar_version end
   where id = m.id;

  if m.avatar_import is distinct from 'accepted' then
    perform public.write_audit(m.org_id, 'member.avatar_import_answered', 'member', m.id,
                               jsonb_build_object('answer', m.avatar_import),
                               jsonb_build_object('answer', 'accepted'),
                               'sheet', m.org_role::text, m.id);
  end if;
  perform public.enqueue_avatar_reconcile(m.id);
  return jsonb_build_object('status', 'ok');
end $fn$;
revoke execute on function public.request_avatar_google() from public, anon, service_role;
grant  execute on function public.request_avatar_google() to authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 3. The worker's two doors for an upload. service_role only.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- Recorded only while this upload is the member's pending one, the member is not anonymised and the version moves
-- forward — otherwise `stale`, with the version the row still holds, so the job keeps exactly that.
create function public.record_avatar_upload(p_member uuid, p_upload uuid, p_version bigint) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare v_version bigint;
begin
  update public.members m
     set avatar_version = p_version,
         avatar_source  = 'upload'
   where m.id = p_member
     and m.anonymised_at is null
     and (m.avatar_version is null or m.avatar_version < p_version)
     and exists (select 1 from public.avatar_uploads u
                  where u.member_id = p_member and u.upload_id = p_upload and u.state = 'pending')
  returning m.avatar_version into v_version;
  if v_version is not null then
    update public.avatar_uploads set state = 'done', updated_at = now()
     where member_id = p_member and upload_id = p_upload;
    return jsonb_build_object('status', 'recorded', 'version', v_version);
  end if;
  select avatar_version into v_version from public.members where id = p_member;
  return jsonb_build_object('status', 'stale', 'version', v_version);
end $fn$;
revoke execute on function public.record_avatar_upload(uuid, uuid, bigint) from public, anon, authenticated;
grant  execute on function public.record_avatar_upload(uuid, uuid, bigint) to service_role;

-- A refusal the sheet can read: `refused` (not PNG or JPEG) or `failed`. Only for that upload while pending.
create function public.fail_avatar_upload(p_member uuid, p_upload uuid, p_state public.avatar_upload_state) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
begin
  if p_state not in ('refused', 'failed') then
    raise exception 'invalid_state' using errcode = '22023';
  end if;
  update public.avatar_uploads set state = p_state, updated_at = now()
   where member_id = p_member and upload_id = p_upload and state = 'pending';
  return jsonb_build_object('status', case when found then 'recorded' else 'stale' end);
end $fn$;
revoke execute on function public.fail_avatar_upload(uuid, uuid, public.avatar_upload_state) from public, anon, authenticated;
grant  execute on function public.fail_avatar_upload(uuid, uuid, public.avatar_upload_state) to service_role;

-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 4. The takedown — an admin, from the member's row on SCR-049 (DEC-280 §4, §8; REQ-PRF-019; REQ-ADM-010).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ★ A library avatar cannot be taken down: `no_photo`, nothing written. The member's key is untouched, so they show
-- their library avatar at once — never initials. `accepted → declined`, so no refresh restores a Google copy.
create function public.take_down_avatar(p_member uuid) returns jsonb
language plpgsql security definer set search_path = '' as $fn$
declare
  actor public.members := public.assert_fresh_admin();
  t     public.members;
begin
  select * into t from public.members
   where id = p_member and org_id = actor.org_id and anonymised_at is null;
  if t.id is null then
    return jsonb_build_object('status', 'not_found');
  end if;
  if t.avatar_version is null then
    return jsonb_build_object('status', 'no_photo');
  end if;

  perform public.avatar_leave_photo(t.id, null);
  perform public.write_audit(actor.org_id, 'member.avatar_taken_down', 'member', t.id,
                             jsonb_build_object('source', t.avatar_source, 'version', t.avatar_version, 'answer', t.avatar_import),
                             jsonb_build_object('source', null,
                                                'answer', case when t.avatar_import = 'accepted' then 'declined'
                                                               else t.avatar_import::text end),
                             null, actor.org_role::text, actor.id);
  return jsonb_build_object('status', 'ok');
end $fn$;
revoke execute on function public.take_down_avatar(uuid) from public, anon, service_role;
grant  execute on function public.take_down_avatar(uuid) to authenticated;

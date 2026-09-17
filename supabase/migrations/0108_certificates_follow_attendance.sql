-- wave 9 (REQ-SES-017, DEC-150 contract 6, DEC-151 contract 5's third hook,
-- DEC-153) — CERTIFICATES FOLLOW ATTENDANCE. The lead's, as custodian of
-- `designer`, which is not spawned this wave (STATUS row L4).
--
-- REQ-SES-017: the certificate, like the points, is awarded once for the
-- session and by default only when the member attended EVERY day. «Attended»
-- has one definition — `scoring`'s `session_attendance_complete()` (0107) — and
-- this file points the certificate path at it in the three places that decided
-- it for themselves:
--
--   fan_out_certificates()   «every active check-in»      → every member the predicate holds for
--   issue_certificate()      «an active check-in exists»  → the predicate; `no_check_in` otherwise, as before
--   the staff screen's list  «check_ins of the session»   → session_complete_attendees(), below
--
-- ★ AT ONE DAY ALL THREE ARE WHAT THEY WERE. The predicate at one day IS «an
-- active check-in on the one day»: the same set fans out, the same error is
-- raised, the same names are listed. `tests/rls/designer-certificates.test.ts`,
-- `certificates-designs.test.ts`, `checkin-removal.test.ts` and
-- `checkin-late-job-hooks.test.ts` are the proof, unmodified.
--
-- ★ attendance_certificate_sync(p_session, p_member) — CONTRACT 5'S THIRD HOOK.
-- `checkin`'s three functions call it beside `scoring`'s two and decide nothing
-- about certificates. It exists because `remove_check_in()` chose the
-- certificate to revoke BY `check_in_id`, and at three days that is wrong:
-- removing day 1 must revoke a certificate that names day 3.
--   · attendance NOT complete → every live attendance certificate of that
--     member for that session is revoked, through `revoke_certificate()` — the
--     existing audited path, the fixed phrase, never the admin's own words.
--   · attendance complete, the session completed, certificates on, and NO
--     certificate row of that kind for that member → the issue job is enqueued
--     under 11 §2.5's own key, exactly as the fan-out would have.
-- ★ The second half is NAMED DIFFERENCE 3 (DEC-151), narrowed by DEC-153: a
-- member marked present AFTER the session completed gets their certificate.
-- The fan-out fires only on the edge into `completed`, so today such a member
-- never gets one — at one day too. Multi-day makes it ordinary: an admin
-- corrects the last day's list the next morning.
-- ★ WHAT IT DELIBERATELY DOES NOT DO: re-issue after a REVOCATION.
-- `certificates` is `unique (org_id, session_id, member_id, kind)` and
-- `issue_certificate()` returns the existing row EVEN IF REVOKED — so a member
-- removed and re-added keeps a revoked certificate and gets no new one. That
-- is wave 7's carry with its cause now known; lifting it means a partial
-- unique index and two rows per member on SCR-045, which is outside this wave.
--
-- Serves:  REQ-SES-017, REQ-CRT-001, REQ-CRT-003, REQ-CRT-011, REQ-CHK-009,
--          REQ-CHK-017
-- Cites:   0065 (fan_out_certificates, issue_certificate, revoke_certificate),
--          0088 (both re-created there for removed check-ins), 0099
--          (issue_certificate — THE LIVE TEXT this file re-creates, with one
--          block changed), 0107 (the predicate), 0025 (enqueue_job)
-- Docs:    DEC-150 contract 6, DEC-151, DEC-153; STATUS row L4
--
-- 03 §8.2 rows this adds:
--   | `RPC-fan_out_certificates.complete_attendance` | At completion an attendance certificate is fanned out to each member contract 6's predicate holds for — once per member, never once per check-in; a member who attended two days of three gets none; with `require_all_days = false` one day is enough. At one day: every active check-in, as before. |
--   | `RPC-issue_certificate.complete_attendance` | A late job for a member whose attendance is not complete raises `no_check_in` (42501), the error a member who never came raises; the certificate's `check_in_id` is the member's latest active check-in. |
--   | `RPC-attendance_certificate_sync.revokes_whichever_day` | Removing ANY day's check-in from a member holding a live attendance certificate revokes it, with the fixed phrase, whichever check-in the certificate names. |
--   | `RPC-attendance_certificate_sync.issues_when_completed_late` | A member whose attendance becomes complete after the session completed gets the issue job under `cert:<session>:<member>:attendance`; not while the session is still running, not with certificates off, and not when a certificate row already exists — a revoked one included (wave 7's carry). |
--   | `RPC-attendance_certificate_sync.never_fails_a_check_in` | Called from a member's own check-in it raises nothing, whatever the state of the session or of their attendance. Executable by no client role. |
--   | `RPC-session_complete_attendees.staff_only` | Staff of the session's org read the members whose attendance is complete; a member is refused 42501, another org's staff read nothing. |

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · the fan-out — once per member the predicate holds for
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.fan_out_certificates(p_session uuid) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  v_mode public.certificate_mode;
  v_rec  record;
  v_n    int := 0;
begin
  select certificate_mode into v_mode from public.sessions where id = p_session;
  -- D50: «معطّل» means nothing is generated at all, not generated and hidden.
  if v_mode is null or v_mode = 'off' then
    return 0;
  end if;

  for v_rec in
    -- Attendees: the CHECK-IN EVENT and nothing else (D24, REQ-CHK-009), a
    -- removed one excluded (DEC-141) — and, wave 9, a member whose attendance
    -- of the SESSION is complete (REQ-SES-017). `distinct`: three days are
    -- three check-ins and one certificate.
    select distinct c.member_id, 'attendance'::public.certificate_kind as kind
      from public.check_ins c
     where c.session_id = p_session and c.removed_at is null
       and public.session_attendance_complete(p_session, c.member_id)
    union
    -- Presenters: every ACCEPTED co-presenter (A5).
    select sp.member_id, 'presenter'::public.certificate_kind
      from public.session_presenters sp where sp.session_id = p_session and sp.accepted
  loop
    -- 11 §2.5's key, verbatim: one job per recipient per kind, so a re-run
    -- moves each rather than duplicating it.
    perform public.enqueue_job(
      'issue_certificates',
      jsonb_build_object('session_id', p_session, 'member_id', v_rec.member_id, 'kind', v_rec.kind),
      'cert:' || p_session::text || ':' || v_rec.member_id::text || ':' || v_rec.kind::text,
      null, 'render', 3
    );
    v_n := v_n + 1;
  end loop;
  return v_n;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · issue_certificate() — 0099's text, with the attendance block on the
--     predicate. Same signature, so `create or replace` keeps its grants.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.issue_certificate(
  p_session uuid, p_member uuid, p_kind public.certificate_kind,
  p_template_version uuid default null, p_font_hashes text[] default '{}'
) returns public.certificates
language plpgsql security definer set search_path = '' as $$
declare
  v_org      uuid;
  v_mode     public.certificate_mode;
  v_check_in uuid;
  v_name     text;
  v_version  uuid := p_template_version;
  v_scheme   public.brand_scheme := 'light';
  v_design   public.session_certificate_designs;
  v_row      public.certificates;
begin
  select s.org_id, s.certificate_mode into v_org, v_mode from public.sessions s where s.id = p_session;
  if v_org is null then
    raise exception 'unknown_session' using errcode = '42704';
  end if;
  if v_mode = 'off' then
    raise exception 'certificates_off' using errcode = '42501';
  end if;

  -- REQ-CRT-003: idempotent. Re-running the job returns what exists rather
  -- than allocating a second serial for the same person.
  select * into v_row from public.certificates c
   where c.org_id = v_org and c.session_id = p_session and c.member_id = p_member and c.kind = p_kind;
  if v_row.id is not null then
    return v_row;
  end if;

  if p_kind = 'attendance' then
    -- ★ RE-DERIVED, never taken from the payload — and, DEC-141, excludes a
    -- removed check-in. wave 9 (REQ-SES-017, DEC-150 contract 6): «attended»
    -- is `scoring`'s predicate — an active check-in on EVERY day unless the
    -- session relaxed it. A late job for a member who attended two days of
    -- three raises the SAME `no_check_in` a member who never came raises: a
    -- printed artefact asserting attendance is a statement the org has to be
    -- able to defend. AT ONE DAY the predicate is «an active check-in on the
    -- one day», which is exactly what the lines below tested before.
    if not public.session_attendance_complete(p_session, p_member) then
      raise exception 'no_check_in' using errcode = '42501';
    end if;
    -- The row `certificates.check_in_id` names (not null by CHECK, restrict by
    -- FK): the member's check-in on the LAST DAY THEY ATTENDED — by the day's
    -- own start, never by `created_at`, which is the transaction's start and
    -- so identical for rows written together (the trap `ad43ddb` fixed in the
    -- realtime suite the same morning). At one day, the only one.
    select c.id into v_check_in
      from public.check_ins c
      join public.session_days d on d.id = c.session_day_id
     where c.session_id = p_session and c.member_id = p_member and c.removed_at is null
     order by d.starts_at desc, c.created_at desc, c.id desc limit 1;
    if v_check_in is null then
      raise exception 'no_check_in' using errcode = '42501';
    end if;
  end if;

  -- The name AS PRINTED, frozen here. A member changing their display name
  -- later must not retroactively change a document someone is holding
  -- (REQ-CRT-014).
  select m.display_name into v_name from public.members m where m.id = p_member;
  if v_name is null then
    raise exception 'unknown_member' using errcode = '42704';
  end if;

  -- wave 8 (1): the design chosen for this session and kind, when there is
  -- one — its template's latest PUBLISHED version, and its scheme (DEC-128).
  select * into v_design from public.session_certificate_designs d where d.session_id = p_session and d.kind = p_kind;
  if v_design.id is not null then
    v_scheme := v_design.scheme;
    if v_version is null then
      v_version := public.certificate_template_latest_version(v_design.template_id);
    end if;
  end if;

  if v_version is null then
    -- The org's default certificate template for this kind, else the
    -- platform's. Pinned on the row, so reissuing in 2031 renders as today.
    -- wave 8 (2): published versions only — a draft is not a certificate.
    select v.id into v_version
      from public.design_templates t
      join public.design_template_versions v on v.template_id = t.id
     where t.purpose = 'certificate' and t.retired_at is null
       and t.family = (case when p_kind = 'presenter' then 'presenter' else 'attendance' end)
       and (t.org_id = v_org or t.org_id is null)
       and v.published_at is not null
     order by (t.org_id is not null) desc, t.is_default desc, v.version desc
     limit 1;
  end if;
  if v_version is null then
    raise exception 'no_certificate_template' using errcode = '42704';
  end if;

  insert into public.certificates (
    org_id, member_id, kind, session_id, check_in_id, serial, verification_code, state,
    template_version_id, font_hashes, recipient_name_snapshot, issued_at, scheme
  ) values (
    v_org, p_member, p_kind, p_session, v_check_in,
    -- ★ Inside this transaction. A rollback returns the number (DEC-010).
    public.allocate_serial(v_org),
    public.new_verification_code(),
    -- D50: automatic issues; review HOLDS, invisible and unemailed
    -- (REQ-CRT-004).
    case when v_mode = 'review' then 'held' else 'issued' end::public.certificate_state,
    v_version, coalesce(p_font_hashes, '{}'), v_name,
    case when v_mode = 'review' then null else now() end,
    -- wave 8 (3): the scheme, pinned (REQ-CRT-014, DEC-148).
    v_scheme
  ) returning * into v_row;

  perform public.write_audit(v_org, 'certificate.issued', 'certificate', v_row.id, null,
                             jsonb_build_object('kind', p_kind, 'serial', v_row.serial, 'state', v_row.state, 'scheme', v_row.scheme));
  return v_row;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · contract 5's third hook
-- ═══════════════════════════════════════════════════════════════════════════
create function public.attendance_certificate_sync(p_session uuid, p_member uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  s    public.sessions;
  cert public.certificates;
begin
  select * into s from public.sessions where id = p_session;
  if not found then
    return;                                  -- the terminal-row pattern (DEC-059)
  end if;

  if not public.session_attendance_complete(p_session, p_member) then
    -- Whichever check-in the certificate names. Reached only from
    -- `remove_check_in()`, an admin's RPC: recording a check-in can never make
    -- complete attendance incomplete. `revoke_certificate()` re-checks that
    -- itself, so the guard below is what keeps a member's own check-in from
    -- ever failing here rather than what authorises anything.
    if public.is_org_admin() then
      for cert in
        select * from public.certificates c
         where c.session_id = p_session and c.member_id = p_member
           and c.kind = 'attendance' and c.state <> 'revoked'
      loop
        perform public.revoke_certificate(cert.id, 'أُلغي تسجيل الحضور');
      end loop;
    end if;
    return;
  end if;

  -- Complete. While the session is still running there is nothing to do: the
  -- fan-out at completion will find this member. After it, nothing else will.
  if s.state not in ('completed', 'archived') or s.certificate_mode = 'off' then
    return;
  end if;
  -- ANY row, a revoked one included: issue_certificate() would return it
  -- unchanged, so a job would be a no-op that looks like work (the carry).
  if exists (select 1 from public.certificates c
              where c.session_id = p_session and c.member_id = p_member and c.kind = 'attendance') then
    return;
  end if;

  perform public.enqueue_job(
    'issue_certificates',
    jsonb_build_object('session_id', p_session, 'member_id', p_member, 'kind', 'attendance'),
    'cert:' || p_session::text || ':' || p_member::text || ':attendance',
    null, 'render', 3
  );
end $$;
revoke execute on function public.attendance_certificate_sync(uuid, uuid) from public, anon, authenticated;
grant  execute on function public.attendance_certificate_sync(uuid, uuid) to service_role;
comment on function public.attendance_certificate_sync(uuid, uuid) is
  'DEC-151 contract 5, third hook: a member''s attendance certificate follows session_attendance_complete(). Called by check_in(), mark_checked_in_manually() and remove_check_in(), which decide nothing about certificates.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 4 · who is eligible, for SCR-045's list — the predicate is executable by no
--     client role, so staff read it through this
-- ═══════════════════════════════════════════════════════════════════════════
create function public.session_complete_attendees(p_session uuid) returns setof uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_staff() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  return query
    select distinct c.member_id
      from public.check_ins c
      join public.sessions s on s.id = c.session_id
     where c.session_id = p_session
       and s.org_id = public.auth_org_id()          -- definer bypasses RLS: the 03 §1.3 re-read
       and c.removed_at is null
       and public.session_attendance_complete(p_session, c.member_id);
end $$;
revoke execute on function public.session_complete_attendees(uuid) from public, anon;
grant  execute on function public.session_complete_attendees(uuid) to authenticated;
comment on function public.session_complete_attendees(uuid) is
  'REQ-SES-017: the members whose attendance of a session is complete, for staff. At one day: everyone with an active check-in.';

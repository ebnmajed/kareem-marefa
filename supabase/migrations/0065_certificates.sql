-- promoted by the lead at wave-3 sync 10 · designer (wave 3, M6) — issuance, release, revocation.
-- Follows 0064.
--
-- Serves:  02 §4.12, 03 §5.8/§5.8a
--          REQ-CRT-001 … REQ-CRT-006, REQ-CRT-008, REQ-CRT-011, REQ-CRT-012,
--          REQ-CRT-014, 11 §2.5 (JOB-issue_certificates, key
--          `cert:{session_id}:{member_id}:{kind}`)
-- Cites:   D49, D50, D51, DEC-010 (the gapless serial), DEC-043 (an
--          envelope, never raise-after-write), DEC-049
--
-- 03 §8.2 ROWS THIS FILE NEEDS:
--   | `POL-certificates.fanout` | Completing a session with `certificate_mode <> 'off'` enqueues one job per checked-in attendee and per accepted presenter, with 11 §2.5's key; `off` enqueues none. |
--   | `POL-certificates.fanout.member` | The completion trigger fires for a non-owner caller too — it is `security definer`, like `rsvps_notify()` (0034). |
--   | `POL-issue_certificate.check_in` | An attendance certificate re-derives its `check_in_id` and is refused when the member never checked in (REQ-CHK-009). |
--   | `POL-issue_certificate.idempotent` | Running the job twice produces ONE certificate and consumes ONE serial. |
--   | `POL-issue_certificate.mode` | `automatic` issues; `review` HOLDS, invisible to the recipient and unemailed. |
--   | `POL-release_certificates.admin` | An admin releases held certificates; a moderator is refused; the release is audited and notifies once. |
--   | `POL-revoke_certificate.reason` | Revoking without a reason is refused; with one the state flips, it is audited, and the PDF is not deleted. |
--
-- ★ THE SERIAL IS ALLOCATED INSIDE THE ISSUING TRANSACTION (DEC-010). That
-- is the whole reason it is a locked counter row rather than a SEQUENCE: a
-- rolled-back issuance returns the number, and in a certificate register a
-- gap reads as a lost or hidden certificate.
--
-- ★ AN ATTENDANCE CERTIFICATE RE-DERIVES ITS CHECK-IN. The job's payload is
-- not trusted for it — 0055's table constraint already makes the column
-- mandatory, and this makes the VALUE correct rather than merely present.
-- REQ-CHK-009 is the one right that four separate things depend on, and it
-- is worth two independent guards.

-- ── the fan-out ────────────────────────────────────────────────────────────
create function public.fan_out_certificates(p_session uuid) returns int
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
    -- Attendees: the CHECK-IN EVENT and nothing else (D24, REQ-CHK-009). A
    -- manual check-in (A8) is a check-in, so this needs no branch for it.
    select c.member_id, 'attendance'::public.certificate_kind as kind
      from public.check_ins c where c.session_id = p_session
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
revoke execute on function public.fan_out_certificates(uuid) from public, anon, authenticated;
grant  execute on function public.fan_out_certificates(uuid) to service_role;

-- ★ SECURITY DEFINER, like 0034's `rsvps_notify()`. An invoker trigger that
-- enqueues fires as whoever completed the session and is refused by
-- `enqueue_job`'s own grant — which is exactly how the poster hooks turned
-- three wave-1 cases red at 0063's promotion.
create function public.sessions_certificate_hook() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  -- On the EDGE into completed, so a walk through several states fans out once.
  if new.state = 'completed' and old.state is distinct from 'completed' then
    perform public.fan_out_certificates(new.id);
  end if;
  return new;
end $$;

create trigger sessions_certificate_hook
  after update on public.sessions
  for each row execute function public.sessions_certificate_hook();

-- ── one certificate ────────────────────────────────────────────────────────
create function public.issue_certificate(
  p_session uuid,
  p_member  uuid,
  p_kind    public.certificate_kind,
  p_template_version uuid default null,
  p_font_hashes text[] default '{}'
) returns public.certificates
language plpgsql security definer set search_path = '' as $$
declare
  v_org      uuid;
  v_mode     public.certificate_mode;
  v_check_in uuid;
  v_name     text;
  v_version  uuid := p_template_version;
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
    -- ★ RE-DERIVED, never taken from the payload.
    select c.id into v_check_in from public.check_ins c
     where c.session_id = p_session and c.member_id = p_member limit 1;
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

  if v_version is null then
    -- The org's default certificate template for this kind, else the
    -- platform's. Pinned on the row, so reissuing in 2031 renders as today.
    select v.id into v_version
      from public.design_templates t
      join public.design_template_versions v on v.template_id = t.id
     where t.purpose = 'certificate' and t.retired_at is null
       and t.family = (case when p_kind = 'presenter' then 'presenter' else 'attendance' end)
       and (t.org_id = v_org or t.org_id is null)
     order by (t.org_id is not null) desc, t.is_default desc, v.version desc
     limit 1;
  end if;
  if v_version is null then
    raise exception 'no_certificate_template' using errcode = '42704';
  end if;

  insert into public.certificates (
    org_id, member_id, kind, session_id, check_in_id, serial, verification_code, state,
    template_version_id, font_hashes, recipient_name_snapshot, issued_at
  ) values (
    v_org, p_member, p_kind, p_session, v_check_in,
    -- ★ Inside this transaction. A rollback returns the number (DEC-010).
    public.allocate_serial(v_org),
    public.new_verification_code(),
    -- D50: automatic issues; review HOLDS, invisible and unemailed
    -- (REQ-CRT-004).
    case when v_mode = 'review' then 'held' else 'issued' end::public.certificate_state,
    v_version, coalesce(p_font_hashes, '{}'), v_name,
    case when v_mode = 'review' then null else now() end
  ) returning * into v_row;

  perform public.write_audit(v_org, 'certificate.issued', 'certificate', v_row.id, null,
                             jsonb_build_object('kind', p_kind, 'serial', v_row.serial, 'state', v_row.state));
  return v_row;
end $$;
revoke execute on function public.issue_certificate(uuid, uuid, public.certificate_kind, uuid, text[]) from public, anon, authenticated;
grant  execute on function public.issue_certificate(uuid, uuid, public.certificate_kind, uuid, text[]) to service_role;

-- ── release (REQ-CRT-004) ──────────────────────────────────────────────────
create function public.release_certificates(p_ids uuid[]) returns setof public.certificates
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := public.auth_org_id();
  v_row public.certificates;
begin
  if v_org is null or not public.is_org_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  for v_row in
    update public.certificates c
       set state = 'issued', issued_at = now(), released_by = public.auth_member_id()
     where c.id = any(p_ids) and c.org_id = v_org and c.state = 'held'
     returning *
  loop
    perform public.write_audit(v_org, 'certificate.released', 'certificate', v_row.id, null,
                               jsonb_build_object('serial', v_row.serial));
    -- The ONLY door to a member's inbox (08 §1). Never a direct insert,
    -- never enqueue_job('send_notification').
    perform public.notify(v_org, v_row.member_id, null,
                          jsonb_build_object('certificate_id', v_row.id, 'serial', v_row.serial, 'kind', v_row.kind),
                          'MSG-certificate_issued');
    return next v_row;
  end loop;
end $$;
revoke execute on function public.release_certificates(uuid[]) from public, anon;
grant  execute on function public.release_certificates(uuid[]) to authenticated;

/** The worker's announcement for an AUTOMATIC issuance, which has no admin
 *  to press a button. Separate from release() so the audit trail says which
 *  of the two happened. */
create function public.announce_certificate(p_certificate uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_row public.certificates;
begin
  select * into v_row from public.certificates where id = p_certificate;
  if v_row.id is null or v_row.state <> 'issued' then
    return;
  end if;
  perform public.notify(v_row.org_id, v_row.member_id, null,
                        jsonb_build_object('certificate_id', v_row.id, 'serial', v_row.serial, 'kind', v_row.kind),
                        'MSG-certificate_issued');
end $$;
revoke execute on function public.announce_certificate(uuid) from public, anon, authenticated;
grant  execute on function public.announce_certificate(uuid) to service_role;

-- ── revocation (REQ-CRT-011) ───────────────────────────────────────────────
create function public.revoke_certificate(p_certificate uuid, p_reason text) returns public.certificates
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid := public.auth_org_id();
  v_row public.certificates;
begin
  if v_org is null or not public.is_org_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  -- MANDATORY, and checked before the write so the message is about the
  -- reason rather than about a constraint.
  if p_reason is null or char_length(btrim(p_reason)) = 0 then
    raise exception 'reason_required' using errcode = '22023';
  end if;

  update public.certificates c
     set state = 'revoked', revoked_at = now(), revoked_by = public.auth_member_id(), revocation_reason = btrim(p_reason)
   where c.id = p_certificate and c.org_id = v_org and c.state <> 'revoked'
   returning * into v_row;

  if v_row.id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- The PDF is NOT deleted (REQ-CRT-011): /verify resolves by certificate
  -- identity, so an old printed copy keeps resolving — to «ملغاة».
  perform public.write_audit(v_org, 'certificate.revoked', 'certificate', p_certificate, null,
                             jsonb_build_object('serial', v_row.serial), btrim(p_reason));
  return v_row;
end $$;
revoke execute on function public.revoke_certificate(uuid, text) from public, anon;
grant  execute on function public.revoke_certificate(uuid, text) to authenticated;

-- ── what the worker needs to render one certificate ────────────────────────
create function public.certificate_render_context(p_certificate uuid)
returns table (
  certificate_id uuid, org_id uuid, member_id uuid, state public.certificate_state,
  serial text, verification_code text, issued_at timestamptz, recipient_name text,
  kind public.certificate_kind, session_title text, achievement_name text,
  org_name text, numerals public.numeral_system, org_time_zone text,
  template_version_id uuid, template_document jsonb, document_id uuid
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.org_id, c.member_id, c.state, c.serial, c.verification_code, c.issued_at,
         c.recipient_name_snapshot, c.kind, s.title, b.name, o.name,
         coalesce(os.numerals, 'western'), coalesce(os.time_zone, 'Asia/Riyadh'),
         c.template_version_id, v.document,
         (select d.id from public.design_documents d where d.bound_certificate_id = c.id limit 1)
    from public.certificates c
    join public.orgs o on o.id = c.org_id
    left join public.org_settings os on os.org_id = c.org_id
    left join public.sessions s on s.id = c.session_id
    left join public.badges b on b.id = c.badge_id
    join public.design_template_versions v on v.id = c.template_version_id
   where c.id = p_certificate
$$;
revoke execute on function public.certificate_render_context(uuid) from public, anon, authenticated;
grant  execute on function public.certificate_render_context(uuid) to service_role;

/** The document a certificate is rendered from, bound to it so the member
 *  can read it (03 §5.9b) and so a reissue finds the same row. */
create function public.record_certificate_document(p_certificate uuid, p_document jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_row public.certificates;
  v_id  uuid;
begin
  select * into v_row from public.certificates where id = p_certificate;
  if v_row.id is null then
    raise exception 'unknown_certificate' using errcode = '42704';
  end if;

  select d.id into v_id from public.design_documents d where d.bound_certificate_id = p_certificate limit 1;
  if v_id is not null then
    update public.design_documents set document = p_document where id = v_id;
    return v_id;
  end if;

  insert into public.design_documents (org_id, template_version_id, purpose, document, bound_certificate_id)
  values (v_row.org_id, v_row.template_version_id, 'certificate', p_document, p_certificate)
  returning id into v_id;
  return v_id;
end $$;
revoke execute on function public.record_certificate_document(uuid, jsonb) from public, anon, authenticated;
grant  execute on function public.record_certificate_document(uuid, jsonb) to service_role;

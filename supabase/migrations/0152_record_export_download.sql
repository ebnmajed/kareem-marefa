-- 0152 · wave 13 (DEC-176, DEC-177, DEC-178) — contract 3: every download of a
-- rendered artifact is audited, and refused to anyone who may not take it.
--
-- ★ Created from nothing. DEC-076 said «`0086` adds the audit action rows»;
-- `0086` is the manual check-in window and no download audit was ever written
-- (DEC-177). Before this file the one download that shipped —
-- `me/certificates`' bare `<a download>` — wrote no audit row at all.
--
-- The app cannot write `audit_log` (append-only, `service_role` revoked — P4,
-- invariant 9) and `write_audit()` is granted to `service_role` only (0005),
-- which is never on Vercel (invariant 7). So, as 0049's
-- `record_material_download()`: a SECURITY DEFINER function the app calls
-- FIRST, which re-derives the caller's right from the data and writes the
-- audit row; the route then signs and redirects (designer's one route,
-- `/api/designer/downloads/[artifactId]`).
--
-- ★ «Refused by policy» (REQ-DSG-027) lives HERE, not in Storage: a poster's
-- bytes have been readable by the whole org since DEC-173 (0145) and by
-- anonymous visitors through the public card (0080), by design. The route
-- passes ONLY the artifact id; the subject is derived from the rows, never
-- from the URL, so a forged link cannot choose a laxer branch.
--
--   session poster  → is_staff(), or an ACCEPTED, undeclined presenter of that session
--   certificate     → is_staff(), or its own member — not while `held`
--                     (REQ-CRT-013: invisible until released); still when
--                     `revoked` (REQ-CRT-011: the document exists, /verify says
--                     what it no longer claims)
--   any other doc   → is_org_admin() (a template draft, the studio's export panel;
--                     `documents_read` already limits these to admins)
--   unknown id, another org's, not `ready` → 42501, the same answer, so the
--                     function is no existence oracle
--
-- `file_name` is ASCII with Western digits (DEC-095): `poster-<preset>.<ext>`,
-- `certificate-<serial>.<ext>`, `design-<preset>.<ext>`. The route may prefix a
-- human title through the signer's `download` option.
--
-- Serves:  REQ-DSG-027, REQ-ADM-021 («each download writes an audit row naming
--          the actor, the session and what was taken»), REQ-CRT-013
-- Cites:   0005 (write_audit), 0049 (the pattern), 0055 (export_artifacts,
--          design_documents, certificates), 0145 (DEC-173)
--
-- 03 §8.2 rows this adds (tests/rls/session-downloads.test.ts):
--   | `RPC-record_export_download.poster` | admin ✓ · moderator ✓ · accepted presenter ✓ · a presenter not accepted ✗ · a plain member ✗ · another org's admin ✗ |
--   | `RPC-record_export_download.certificate` | its member ✓ · its member while held ✗ · its member when revoked ✓ · another member ✗ · admin ✓ · moderator ✓ |
--   | `RPC-record_export_download.document` | admin ✓ · moderator ✗ · member ✗ |
--   | `RPC-record_export_download.refusals` | unknown id ✗ · not ready ✗ · one audit row per admitted call · none per refused · anon cannot execute |

create function public.record_export_download(p_artifact uuid)
returns table (storage_path text, file_name text)
language plpgsql security definer set search_path = '' as $$
declare
  v_org          uuid;
  v_document     uuid;
  v_preset       text;
  v_format       text;
  v_path         text;
  v_status       text;
  v_cert_id      uuid;
  v_session      uuid;
  v_cert_member  uuid;
  v_cert_state   text;
  v_cert_serial  text;
  v_subject      text;
  v_ok           boolean;
  v_name         text;
begin
  select ea.org_id, ea.document_id, ea.preset, ea.format::text, ea.storage_path, ea.status::text, d.bound_certificate_id
    into v_org, v_document, v_preset, v_format, v_path, v_status, v_cert_id
    from public.export_artifacts ea
    join public.design_documents d on d.id = ea.document_id
   where ea.id = p_artifact
     and ea.org_id = public.auth_org_id();

  if not found or v_status <> 'ready' or v_path is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  select sp.session_id into v_session
    from public.session_posters sp
   where sp.document_id = v_document;

  if v_session is not null then
    v_subject := 'session_poster';
    v_ok := public.is_staff()
         or exists (select 1 from public.session_presenters p
                     where p.session_id = v_session
                       and p.member_id = public.auth_member_id()
                       and p.accepted
                       and p.declined_at is null);
    v_name := 'poster-' || v_preset || '.' || v_format;
  elsif v_cert_id is not null then
    select c.member_id, c.state::text, c.serial, c.session_id
      into v_cert_member, v_cert_state, v_cert_serial, v_session
      from public.certificates c
     where c.id = v_cert_id and c.org_id = v_org;
    v_subject := 'certificate';
    v_ok := v_cert_member is not null
        and (public.is_staff()
             or (v_cert_member = public.auth_member_id() and v_cert_state <> 'held'));
    v_name := 'certificate-' || coalesce(v_cert_serial, 'file') || '.' || v_format;
  else
    v_subject := 'document';
    v_ok := public.is_org_admin();
    v_name := 'design-' || v_preset || '.' || v_format;
  end if;

  if not coalesce(v_ok, false) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  perform public.write_audit(
    v_org, 'export_artifact.downloaded', 'export_artifact', p_artifact,
    null,
    jsonb_strip_nulls(jsonb_build_object(
      'subject', v_subject,
      'session_id', v_session,
      'certificate_id', v_cert_id,
      'document_id', v_document,
      'preset', v_preset,
      'format', v_format)),
    null, null, public.auth_member_id()
  );

  return query select v_path, v_name;
end $$;

revoke all on function public.record_export_download(uuid) from public, anon;
grant execute on function public.record_export_download(uuid) to authenticated;

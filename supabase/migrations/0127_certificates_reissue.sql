-- designer (wave 10, row D1) — CERTIFICATES, RE-ISSUED.
--
-- A member removed and re-added gets a NEW certificate under the next serial;
-- the revoked one keeps its serial and keeps verifying as revoked. That is
-- wave 7's carry, whose cause DEC-153 named and left standing: `certificates`
-- was `unique (org_id, session_id, member_id, kind)` and `issue_certificate()`
-- opened with «return the existing row» — a REVOKED row included — so the
-- second issuance was a no-op that looked like work.
--
-- ★ NOT EVERY REVOCATION IS A REMOVAL'S, and this file's whole difficulty is
-- there. An admin may revoke a certificate FOR CAUSE while the member's
-- attendance is still complete — a wrong name, a document issued in error,
-- something the org has to be able to stand behind. Nothing may quietly put a
-- replacement in that member's hands: not the sync hook on the next attendance
-- change, not a re-run fan-out, not a late job. So the two revocations have to
-- be told apart IN THE DATA.
--
-- THE FIXED PHRASE IS NOT A DISCRIMINATOR, for four reasons:
--   1. `revocation_reason` is display copy — what the member reads on SCR-023
--      and the admin on SCR-045. Keying behaviour on a sentence means a
--      wording fix silently re-arms automatic re-issue for every revocation
--      ever written with the old words.
--   2. It is forgeable by an ordinary admin: `revokeInput.reason` is free
--      text, min 3 / max 500. An admin who happens to type the removal's
--      phrase while revoking for cause would get a replacement they never
--      meant to allow. A discriminator a user can type is not one.
--   3. It is a RENDERING of a fact, not the fact. CLAUDE.md's naming rule —
--      enums are Postgres enum types, never `text` + check — is the same
--      argument one level up: a category is a column.
--   4. `tests/rls/checkin-removal.test.ts:179` PINS «أُلغي تسجيل الحضور», and
--      `0120`'s own 03 §8.2 row repeats it. The phrase must stay exactly as it
--      is, which is one more reason not to overload it with meaning.
-- `revoked_by` cannot tell them apart either: `remove_check_in()` runs as the
-- admin and calls the sync inside that transaction, so `auth_member_id()` is
-- the same person on both paths. And the audit log must not be the source —
-- `audit_log` is append-only EVIDENCE (invariant 9); making behaviour depend
-- on reading it turns evidence into state, and a retention pass would then
-- change what the product does.
--
-- Serves:  REQ-CRT-003, REQ-CRT-008, REQ-CRT-011, REQ-CHK-017, REQ-SES-017
-- Cites:   0055 (the table, its uniques, allocate_serial), 0065
--          (revoke_certificate — THE LIVE TEXT this file re-creates, with one
--          column added), 0099 + 0108 (issue_certificate and
--          attendance_certificate_sync — the live text, each with one block
--          changed), 0107 (the predicate), 0025 (enqueue_job), DEC-010
-- Docs:    DEC-160 §6 and contract 10, DEC-153 (the carry this lifts),
--          DEC-151; STATUS row D1
--
-- ★ ADDITIVE, because `main` runs on it first (contract 3). `main`'s worker
-- calls `issue_certificate()` on its UNCHANGED five-argument signature and
-- gets either a row it renders as it renders any other, or 42501 — which it
-- already reads as «no longer eligible — nothing issued» and returns from
-- WITHOUT retrying. `main`'s app calls `revoke_certificate(p_certificate,
-- p_reason)` and takes `p_cause`'s default, and that default is `for_cause`
-- precisely BECAUSE every application caller of this RPC is an admin's
-- deliberate revocation. The old two-argument signature is dropped in this
-- same file, so PostgREST never sees two overloads (0085's lesson).
--
-- 03 §8.2 rows this adds:
--   | `POL-certificates.live_once` | A second LIVE certificate for one (org, session, member, kind) is refused 23505 by `certificates_live_once`; a second REVOKED row is accepted, which is what lets a re-issue keep the first one on the register. |
--   | `RPC-issue_certificate.replacement_after_removal` | A member whose certificate was revoked BY A REMOVAL, then re-added, is issued a second certificate under the NEXT serial; its `check_in_id` is the new check-in; the first keeps its serial and still verifies as revoked, without its reason. |
--   | `RPC-issue_certificate.no_replacement_after_for_cause` | A certificate revoked FOR CAUSE is never replaced — not by the sync hook, not by a re-run fan-out, not by a late job. `issue_certificate()` raises `revoked_for_cause` (42501) BEFORE `allocate_serial()`, so the org's serial counter does not move. |
--   | `RPC-revoke_certificate.records_its_cause` | Every revocation records why it happened: the removal path passes `attendance_removed`, every other caller takes `for_cause`. A revocation written before this file reads as `for_cause` — final — through `coalesce`. |
--   | `RPC-attendance_certificate_sync.reissues_after_removal` | Attendance complete again on a completed session with certificates on, holding only a removal-revoked certificate, enqueues the issue job under 11 §2.5's key; holding a for-cause-revoked one enqueues nothing; holding a LIVE one still enqueues nothing. |

-- ═══════════════════════════════════════════════════════════════════════════
-- LEAD DDL (DEC-160) — contract 10. The lead's four statements, carried here
-- verbatim so the constraint and the functions that depend on it move in ONE
-- file (DEC-151's pattern). The lead confirmed the constraint's catalogue name
-- from `pg_constraint`; the other two uniques — `certificates_org_id_serial_key`
-- and `certificates_verification_code_key` — stay.
-- ═══════════════════════════════════════════════════════════════════════════
create type public.certificate_revocation_cause as enum ('for_cause', 'attendance_removed');

-- Nullable, and read everywhere through `coalesce(…, 'for_cause')`. Not
-- `not null default 'for_cause'`: the column is meaningless on a LIVE row and
-- would state a cause for every certificate that has none. No check pairing it
-- with `state = 'revoked'` either — that would validate existing rows, which
-- means backfilling a cause onto rows revoked before this file, a cause we
-- cannot honestly know. `coalesce` reads those as FINAL, the conservative
-- direction. How many there are is a production read in the owner's order; if
-- it is not zero, what to do with them is a scoped, owner-run statement
-- (DEC-023), never this migration.
alter table public.certificates
  add column revocation_cause public.certificate_revocation_cause;

-- The live-row rule, which the table constraint used to be. Created BEFORE the
-- drop, so there is never an instant with no uniqueness at all. `state` is
-- `not null default 'held'` (0055:286), so the predicate is total; `<>
-- 'revoked'` matches the phrase already used at 0087:354, 0105:576 and
-- 0108:247. A plain `create unique index` takes a `share` lock for its
-- duration — volume is hundreds a month (A24), so the table is tiny and this
-- is not worth `concurrently`, which could not run in a migration anyway.
create unique index certificates_live_once
  on public.certificates (org_id, session_id, member_id, kind)
  where state <> 'revoked';

alter table public.certificates
  drop constraint certificates_org_id_session_id_member_id_kind_key;

-- ═══════════════════════════════════════════════════════════════════════════
-- 1 · revoke_certificate() — 0065's text, with the cause recorded.
--     Dropped and re-created because a parameter is added; the grants are
--     RESTATED VERBATIM, because a re-created function starts with PUBLIC
--     execute and that is the 0002 trap.
-- ═══════════════════════════════════════════════════════════════════════════
drop function public.revoke_certificate(uuid, text);
create function public.revoke_certificate(
  p_certificate uuid, p_reason text,
  -- ★ Trailing and defaulted, so `main`'s two-argument call resolves to this
  -- one function. `for_cause` is the right default and not merely the safe
  -- one: every caller that passes two arguments is an admin revoking through
  -- SCR-045, which IS a revocation for cause.
  p_cause public.certificate_revocation_cause default 'for_cause'
) returns public.certificates
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
     set state = 'revoked', revoked_at = now(), revoked_by = public.auth_member_id(), revocation_reason = btrim(p_reason),
         revocation_cause = p_cause
   where c.id = p_certificate and c.org_id = v_org and c.state <> 'revoked'
   returning * into v_row;

  if v_row.id is null then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- The PDF is NOT deleted (REQ-CRT-011): /verify resolves by certificate
  -- identity, so an old printed copy keeps resolving — to «ملغاة».
  -- The cause is audited beside the serial: an admin reading the log later
  -- must be able to see WHICH kind of revocation this was, for the same
  -- reason the column exists.
  perform public.write_audit(v_org, 'certificate.revoked', 'certificate', p_certificate, null,
                             jsonb_build_object('serial', v_row.serial, 'cause', p_cause), btrim(p_reason));
  return v_row;
end $$;
revoke execute on function public.revoke_certificate(uuid, text, public.certificate_revocation_cause) from public, anon;
grant  execute on function public.revoke_certificate(uuid, text, public.certificate_revocation_cause) to authenticated;
comment on function public.revoke_certificate(uuid, text, public.certificate_revocation_cause) is
  'REQ-CRT-011. DEC-160 §6: records WHY the certificate was revoked. `attendance_removed` may be replaced when attendance becomes complete again; `for_cause` never is.';

-- ═══════════════════════════════════════════════════════════════════════════
-- 2 · issue_certificate() — 0108's text, with the idempotency block on the
--     live row and a second guard for the revocation that must never be
--     replaced. Same signature, so `create or replace` keeps its grants
--     (service_role only, 0065:173-174 — the worker is the only caller).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.issue_certificate(
  p_session uuid, p_member uuid, p_kind public.certificate_kind,
  p_template_version uuid default null, p_font_hashes text[] default '{}'
) returns public.certificates
language plpgsql security definer set search_path = '' as $$
declare
  v_org        uuid;
  v_mode       public.certificate_mode;
  v_check_in   uuid;
  v_name       text;
  v_version    uuid := p_template_version;
  v_scheme     public.brand_scheme := 'light';
  v_design     public.session_certificate_designs;
  v_row        public.certificates;
  v_constraint text;
begin
  select s.org_id, s.certificate_mode into v_org, v_mode from public.sessions s where s.id = p_session;
  if v_org is null then
    raise exception 'unknown_session' using errcode = '42704';
  end if;
  if v_mode = 'off' then
    raise exception 'certificates_off' using errcode = '42501';
  end if;

  -- REQ-CRT-003: idempotent over a LIVE row. Re-running the job returns what
  -- exists rather than allocating a second serial for the same person.
  -- ★ wave 10 (DEC-160 §6): a REVOKED row is no longer «exists». A member
  -- removed and re-added earns a second certificate under the NEXT serial,
  -- and the first keeps its serial and keeps verifying as revoked. That is
  -- DEC-153's carry, and this line is where it is lifted.
  select * into v_row from public.certificates c
   where c.org_id = v_org and c.session_id = p_session and c.member_id = p_member and c.kind = p_kind
     and c.state <> 'revoked';
  if v_row.id is not null then
    return v_row;
  end if;

  -- ★ …but not after a revocation FOR CAUSE. An admin who revoked a
  -- certificate deliberately is never overruled by a job, whatever the
  -- member's attendance says afterwards. 42501 is the errcode the worker
  -- already treats as «no longer eligible — nothing issued»: the ABSENCE of a
  -- certificate is the correct outcome here, and no retry changes it.
  -- ★ RAISED BEFORE allocate_serial(), which is called in the insert's value
  -- list below — so a refused re-issue consumes no number. The RLS case
  -- asserts `certificate_serial_counters` is unchanged across it, rather than
  -- trusting this comment.
  if exists (select 1 from public.certificates c
              where c.org_id = v_org and c.session_id = p_session and c.member_id = p_member and c.kind = p_kind
                and c.state = 'revoked'
                and coalesce(c.revocation_cause, 'for_cause') = 'for_cause') then
    raise exception 'revoked_for_cause' using errcode = '42501';
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
    -- so identical for rows written together. At one day, the only one.
    -- ★ After a removal and a re-add this resolves to the NEW check-in, so the
    -- replacement certificate names the attendance it actually attests.
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

  begin
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
  exception when unique_violation then
    -- ★ Two jobs for one member passed the select above concurrently. The
    -- partial index is the AUTHORITY; the early return is only the first line
    -- of defence, and the job key — which de-duplicates PENDING work, not
    -- outcomes — is the second. DEC-010 survives: the counter is a ROW, so
    -- this subtransaction's rollback RETURNS the serial a SEQUENCE would have
    -- burned. The diagnostics guard is what keeps this from swallowing a
    -- `certificates_org_id_serial_key` collision, which would be a real
    -- defect rather than a race.
    -- `CONSTRAINT_NAME` is the item's name; Postgres fills it with the INDEX's
    -- name for a bare unique index, which is what `certificates_live_once` is.
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint <> 'certificates_live_once' then raise; end if;
    select * into v_row from public.certificates c
     where c.org_id = v_org and c.session_id = p_session and c.member_id = p_member and c.kind = p_kind
       and c.state <> 'revoked';
    if v_row.id is null then raise; end if;
    -- The loser returns the winner's row and writes no second audit line.
    return v_row;
  end;

  perform public.write_audit(v_org, 'certificate.issued', 'certificate', v_row.id, null,
                             jsonb_build_object('kind', p_kind, 'serial', v_row.serial, 'state', v_row.state, 'scheme', v_row.scheme));
  return v_row;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- 3 · attendance_certificate_sync() — 0108's text, with the «ANY row» guard
--     narrowed to match. Contract 5's third hook: `check_in()`,
--     `mark_checked_in_manually()` and `remove_check_in()` call it and decide
--     nothing about certificates themselves.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.attendance_certificate_sync(p_session uuid, p_member uuid) returns void
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
        -- ★ `attendance_removed`: this revocation MAY be replaced if the
        -- member's attendance becomes complete again. The phrase is the fixed
        -- one and is unchanged — the admin's own words never reach the member
        -- (REQ-CHK-017) — and the CAUSE travels in its own column beside it
        -- rather than being read back out of the sentence.
        perform public.revoke_certificate(cert.id, 'أُلغي تسجيل الحضور', 'attendance_removed');
      end loop;
    end if;
    return;
  end if;

  -- Complete. While the session is still running there is nothing to do: the
  -- fan-out at completion will find this member. After it, nothing else will.
  if s.state not in ('completed', 'archived') or s.certificate_mode = 'off' then
    return;
  end if;
  -- ★ wave 10 (DEC-160 §6). A LIVE row means there is nothing to do — a job
  -- would be a no-op that looks like work. A row revoked BY A REMOVAL no
  -- longer stops the issue: that is the carry, lifted here and in
  -- `issue_certificate()` together. A row revoked FOR CAUSE still stops it,
  -- and always will.
  if exists (select 1 from public.certificates c
              where c.session_id = p_session and c.member_id = p_member and c.kind = 'attendance'
                and (c.state <> 'revoked'
                     or coalesce(c.revocation_cause, 'for_cause') = 'for_cause')) then
    return;
  end if;

  perform public.enqueue_job(
    'issue_certificates',
    jsonb_build_object('session_id', p_session, 'member_id', p_member, 'kind', 'attendance'),
    -- 11 §2.5's key, unchanged. A COMPLETED graphile job is deleted, so the
    -- key is free again after the first issuance — which is exactly what lets
    -- a second issuance run under it, and why no new key shape is needed.
    'cert:' || p_session::text || ':' || p_member::text || ':attendance',
    null, 'render', 3
  );
end $$;

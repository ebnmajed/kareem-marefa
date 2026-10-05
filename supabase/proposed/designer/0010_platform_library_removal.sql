-- designer (wave 27, M29) — THE REMOVAL: the platform library leaves; every lookup reads the org's own.
-- M2. ★★ PROMOTED ONLY AFTER PR C'S CODE IS ON `main`, in the follow-up PR (DEC-255, D9) — never in PR C's chain.
-- In PR C it lives here and is proven by `applyProposed()` (tests/rls/templates-platform-removal.test.ts).
--
-- Serves:  REQ-DSG-035 (no platform template an org reads, no way to publish across orgs), REQ-DSG-008 as amended,
--          REQ-CRT-014 (a version a certificate or document references is retired, never deleted), REQ-CRT-015
-- Cites:   DEC-254 §3.3, §3.4 · DEC-255 (D2 the raise, D3 the repoint, D4 the drops, D10 the lookup) · 0193 (the shape
--          of `remove_platform_template()`) · 0099:126-133 (the «locked» rule, copied)
--
-- 03 §8.2 ROWS THIS FILE NEEDS:
--   | `MIG-platform_removal.raises_first` | An org that cannot resolve a fallback template stops the migration before any platform row or design changes. |
--   | `MIG-platform_removal.repoint` | An UNLOCKED session design naming a platform template now names the org's own template of the same family and orientation, audited `certificate.design_set` as `system`; a LOCKED one is left. |
--   | `RPC-remove_platform_template.deleted` | A platform template nothing references is deleted, its versions with it. |
--   | `RPC-remove_platform_template.retired` | A live one a certificate, a document or a session design references is retired, `is_default` cleared, the reference untouched. |
--   | `RPC-remove_platform_template.kept_retired` | An already-retired one still referenced is reported and not written. |
--   | `RPC-remove_platform_template.not_callable` | Owner-only. |
--   | `RPC-issue_certificate.org_only` · `RPC-issue_achievement_certificate.org_only` · `RPC-poster_render_context.org_only` · `RPC-set_certificate_design.org_only` | No platform branch remains. |
--
-- ★ THE ORDER IS THE SAFETY (DEC-254 §3.3), and it is the file's order:
--   1. RAISE if any org cannot resolve every template the code falls back on — `org_missing_templates()`, the ONE
--      predicate (0008), the same function the retire guard calls. Nothing has changed yet.
--   2. REPOINT the unlocked session designs that name a platform template (D3). Before the removal, because
--      `session_certificate_designs.template_id` is `on delete restrict` (0099:63) and a retired template a session
--      still names would keep issuing — `certificate_template_latest_version()` ignores `retired_at` (0099:86-91).
--   3. DELETE OR RETIRE every platform row, a notice per row (0193's pattern, one difference: an already-retired row
--      is TRIED again — the old `talk` 0193 retired for two documents that no longer exist).
--   4. NARROW the four lookups to the org's own, through `org_template_version()`.
--   5. DROP the five platform-library functions and `supersede_baseline_template()` (D4).
-- ★ The two policies (`templates_read`, `template_versions_read`) and the D5 constraint are the LEAD's and are not in
--   this file (tables, policies and grants are the lead's). They belong after step 3.
--
-- ★ WHAT IS NOT DONE, however the instruction reads: no `cascade`; no certificate detached from its version; no
--   `template_version_id` nulled; no `recipient_name_snapshot` or `font_hashes` touched; no `design_document` deleted
--   to clear the way; held certificates are NOT re-pinned — an admin re-pins them with «طبّق على المحجوزة»
--   (`redesign_held_certificates()`), and until then their platform version is retired, not deleted.
--
-- ★ `main`'S APP AND WORKER ON THIS SCHEMA (pushed after C merged, so `main` IS PR C's code): the DAL already reads
--   `scope = 'org'` only, so nothing on a screen moves; issuance and posters already resolved the org's own (0127's and
--   0128's org-first order, and every org holds a default since M1). What changes is that a platform row can no longer
--   be reached at all.

-- ═══ 1 · RAISE FIRST ═══
do $$
declare v_missing text;
begin
  select string_agg(o.slug || ':' || m.purpose::text || '/' || m.family, ', ' order by o.slug, m.purpose, m.family)
    into v_missing
    from public.orgs o
    cross join lateral public.org_missing_templates(o.id) m;
  if v_missing is not null then
    raise exception 'org_without_template: %', v_missing using errcode = '23514';
  end if;
end $$;

-- ═══ 2 · REPOINT the unlocked session designs (D3) ═══
-- «Locked» is `set_certificate_design()`'s own rule (0099:126-133), copied rather than re-derived: a certificate of
-- this kind has been issued or revoked for this session. A locked design is left — its template is retired in step 3.
do $$
declare
  v_design record;
  v_target uuid;
begin
  for v_design in
    select d.id, d.org_id, d.session_id, d.kind, d.template_id, d.scheme, t.family,
           (l.document #>> '{master,width}')::numeric >= (l.document #>> '{master,height}')::numeric as landscape
      from public.session_certificate_designs d
      join public.design_templates t on t.id = d.template_id and t.scope = 'platform'
      cross join lateral (
        select v.document from public.design_template_versions v
         where v.template_id = t.id order by v.version desc limit 1
      ) l
     where not exists (
       select 1 from public.certificates c
        where c.session_id = d.session_id and c.kind = d.kind and c.state in ('issued', 'revoked')
     )
     order by d.org_id, d.session_id, d.kind
  loop
    -- The org's own template of the same family AND orientation, live and published: its default first.
    select t.id into v_target
      from public.design_templates t
      cross join lateral (
        select v.document from public.design_template_versions v
         where v.template_id = t.id and v.published_at is not null order by v.version desc limit 1
      ) l
     where t.org_id = v_design.org_id and t.purpose = 'certificate' and t.family = v_design.family
       and t.retired_at is null
       and ((l.document #>> '{master,width}')::numeric >= (l.document #>> '{master,height}')::numeric) is not distinct from v_design.landscape
     order by t.is_default desc, t.created_at, t.id
     limit 1;
    if v_target is null then
      -- Never a guess at another orientation: an org that deleted its own counterpart by hand is a case to look at.
      raise exception 'no_counterpart for session % kind % (%)', v_design.session_id, v_design.kind, v_design.family
        using errcode = '23514';
    end if;

    update public.session_certificate_designs set template_id = v_target where id = v_design.id;
    perform public.write_audit(v_design.org_id, 'certificate.design_set', 'session', v_design.session_id,
                               jsonb_build_object('template_id', v_design.template_id, 'scheme', v_design.scheme),
                               jsonb_build_object('kind', v_design.kind, 'template_id', v_target, 'scheme', v_design.scheme));
    raise notice 'repoint session % % -> %', v_design.session_id, v_design.kind, v_target;
  end loop;
end $$;

-- ═══ 3 · DELETE OR RETIRE every platform row ═══
create or replace function public.remove_platform_template(p_template uuid)
returns table (outcome text, refused_by text)
language plpgsql security definer set search_path = '' as $fn$
declare
  v_row public.design_templates;
begin
  select * into v_row from public.design_templates t where t.id = p_template;
  if v_row.id is null then
    return query select 'absent'::text, null::text;
    return;
  end if;
  -- 0193's guard, kept (0193:99-102): an org's own template is its property and never removed by a platform step.
  if v_row.scope <> 'platform' then
    raise exception 'not_a_platform_template' using errcode = '42501';
  end if;

  -- ★ A subtransaction, not a pre-flight count (0193:76-79): `restrict` raises 23503 at once, and the exception
  -- block is the only race-free way to learn the answer. ★ Tried for a RETIRED row too — the one difference from
  -- `supersede_baseline_template()`, which returned `already_retired` without trying.
  begin
    delete from public.design_templates where id = p_template;
    return query select 'deleted'::text, null::text;
  exception when foreign_key_violation then
    -- REQ-CRT-014, structurally: something a member holds, a document or a session design still names it.
    if v_row.retired_at is null then
      update public.design_templates set retired_at = now(), is_default = false where id = p_template;
      return query select 'retired'::text, sqlerrm;
    else
      return query select 'kept_retired'::text, sqlerrm;
    end if;
  end;
end $fn$;
revoke execute on function public.remove_platform_template(uuid) from public, anon, authenticated, service_role;

comment on function public.remove_platform_template(uuid) is
  'DEC-254 §3.4 — remove one PLATFORM design template: delete where the database permits, retire where on-delete-restrict refuses (REQ-CRT-014), report which. Owner-only.';

do $$
declare
  v_old     record;
  v_outcome text;
  v_refused text;
begin
  for v_old in
    select t.id, t.purpose::text as purpose, t.family, t.name
      from public.design_templates t
     where t.scope = 'platform'
     order by t.purpose, t.family, t.created_at, t.id
  loop
    select r.outcome, r.refused_by into v_outcome, v_refused from public.remove_platform_template(v_old.id) r;
    raise notice 'remove % % % (%) -> % %', v_old.purpose, v_old.family, v_old.name, v_old.id, v_outcome, coalesce(v_refused, '');
  end loop;
end $$;

-- ═══ 4 · NARROW the four lookups (D10) ═══
-- Each body is its live definition re-stated VERBATIM but for the lookup, which now goes through
-- `org_template_version()`. Same signatures, so `create or replace` keeps every grant.

-- issue_certificate() — 0127:160-318.
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
    -- ★ wave 27 (DEC-254 §3, DEC-255 D10): the ORG's template for this kind — there is no platform library and no
    -- «else the platform's». `org_template_version()` is the one lookup, and `org_missing_templates()` (the same
    -- function) has proven every org resolves it before this file touched a platform row. Pinned on the row, so
    -- reissuing in 2031 renders as today; published versions only — a draft is not a certificate.
    v_version := public.org_template_version(
      v_org, 'certificate', (case when p_kind = 'presenter' then 'presenter' else 'attendance' end)
    );
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

-- issue_achievement_certificate() — 0066:39-116.
create or replace function public.issue_achievement_certificate(
  p_member   uuid,
  p_badge    uuid default null,
  p_snapshot uuid default null,
  p_font_hashes text[] default '{}'
) returns public.certificates
language plpgsql security definer set search_path = '' as $$
declare
  v_org     uuid;
  v_name    text;
  v_version uuid;
  v_row     public.certificates;
begin
  if (p_badge is null) = (p_snapshot is null) then
    raise exception 'exactly_one_source' using errcode = '22023';
  end if;

  select m.org_id, m.display_name into v_org, v_name from public.members m where m.id = p_member;
  if v_org is null then
    raise exception 'unknown_member' using errcode = '42704';
  end if;

  -- The source must belong to the same org. Re-derived here rather than
  -- trusted from the caller: this function is service_role's and the
  -- payload of a job is not an authority (04 §5.3).
  if p_badge is not null then
    if not exists (select 1 from public.badges b
                    where b.id = p_badge and b.org_id = v_org and b.retired_at is null and b.issues_certificate) then
      raise exception 'badge_does_not_issue' using errcode = '42501';
    end if;
  else
    if not exists (select 1 from public.leaderboard_snapshots s
                    where s.id = p_snapshot and s.org_id = v_org and s.is_final) then
      raise exception 'snapshot_not_final' using errcode = '42501';
    end if;
  end if;

  -- REQ-CRT-003's idempotence, for this shape of certificate.
  select * into v_row from public.certificates c
   where c.org_id = v_org and c.member_id = p_member and c.kind = 'achievement'
     and c.badge_id is not distinct from p_badge
     and c.snapshot_id is not distinct from p_snapshot;
  if v_row.id is not null then
    return v_row;
  end if;

  -- ★ wave 27 (DEC-254 §3, DEC-255 D10): the org's own, through the one lookup — no platform fallback.
  v_version := public.org_template_version(v_org, 'certificate', 'achievement');
  if v_version is null then
    raise exception 'no_certificate_template' using errcode = '42704';
  end if;

  insert into public.certificates (
    org_id, member_id, kind, badge_id, snapshot_id, serial, verification_code, state,
    template_version_id, font_hashes, recipient_name_snapshot, issued_at
  ) values (
    v_org, p_member, 'achievement', p_badge, p_snapshot,
    public.allocate_serial(v_org),
    public.new_verification_code(),
    -- ★ The one difference between the two sources. A leaderboard
    -- certificate waits for an admin (REQ-CRT-012); a badge certificate
    -- does not, because awarding the badge was already the decision.
    case when p_snapshot is not null then 'held' else 'issued' end::public.certificate_state,
    v_version, coalesce(p_font_hashes, '{}'), v_name,
    case when p_snapshot is not null then null else now() end
  ) returning * into v_row;

  perform public.write_audit(v_org, 'certificate.issued', 'certificate', v_row.id, null,
                             jsonb_build_object('kind', 'achievement', 'serial', v_row.serial, 'state', v_row.state,
                                                'badge_id', p_badge, 'snapshot_id', p_snapshot));
  return v_row;
end $$;

-- poster_render_context() — 0128:42-99.
create or replace function public.poster_render_context(p_session uuid)
returns table (
  session_id uuid, org_id uuid, title text, abstract text, starts_at timestamptz,
  session_time_zone text, venue_name text, venue_address text, presenters text[],
  org_name text, org_time_zone text,
  poster_id uuid, document_id uuid, mode public.poster_mode, binding public.poster_binding,
  template_version_id uuid, template_document jsonb,
  -- ★ TRAILING, and every column above is 0082's in 0082's order: `main`'s
  -- `regenerate_poster.ts` runs `select *` into a typed row and reads NAMED
  -- fields, so an extra key arrives and is never read. Its bindings are
  -- today's, so its fingerprint is today's, and the artifact cache does not
  -- churn (REQ-DSG-013).
  days jsonb
)
language sql stable security definer set search_path = '' as $$
  select s.id, s.org_id, s.title, s.abstract, s.starts_at,
         s.time_zone,
         coalesce(v.name, s.custom_venue_name),
         coalesce(v.address, s.custom_venue_address),
         -- A5: every ACCEPTED co-presenter, in the order they were named.
         coalesce((select array_agg(m.display_name order by sp.created_at)
                     from public.session_presenters sp
                     join public.members m on m.id = sp.member_id
                    where sp.session_id = s.id and sp.accepted), '{}'),
         o.name, coalesce(os.time_zone, 'Asia/Riyadh'),
         p.id, p.document_id, p.mode, p.binding,
         tv.id, tv.document,
         -- ★ BY `position` — the chronological rank the database derives and
         -- renumbers by trigger (DEC-150). Never ordered by `created_at`,
         -- which is the transaction's start and identical for rows written
         -- together, and never reduced to a min or a max here or in the
         -- caller. `[]` for a session whose days have not been written yet,
         -- which the runtime reads as «use the session's own instant».
         coalesce((select jsonb_agg(jsonb_build_object('startsAt', d.starts_at, 'endsAt', d.ends_at) order by d.position)
                     from public.session_days d where d.session_id = s.id), '[]'::jsonb)
    from public.sessions s
    join public.orgs o on o.id = s.org_id
    left join public.org_settings os on os.org_id = s.org_id
    left join public.venues v on v.id = s.venue_id
    left join public.session_posters p on p.session_id = s.id
    -- The template the automatic path binds to: the org's default for the
    -- `talk` family, else the platform's. 02 has no session-TYPE column, so
    -- a per-family default cannot be chosen automatically; the admin picks
    -- one on SCR-043 and that choice is what `session_posters.document_id`
    -- then records (REQ-DSG-002's «تلقائي» is a default, not a ceiling).
    -- ★ wave 27 (DEC-254 §3, DEC-255 D10): the org's own `talk`, through the one lookup — no platform fallback,
    -- and a published version only, as every other lookup already asked.
    left join lateral (
      select v2.id, v2.document
        from public.design_template_versions v2
       where v2.id = public.org_template_version(s.org_id, 'poster', 'talk')
    ) tv on true
   where s.id = p_session
$$;
revoke execute on function public.poster_render_context(uuid) from public, anon, authenticated;
grant  execute on function public.poster_render_context(uuid) to service_role;

-- set_certificate_design() — 0099:96-148.
create or replace function public.set_certificate_design(
  p_session  uuid,
  p_kind     public.certificate_kind,
  p_template uuid,
  p_scheme   public.brand_scheme
) returns public.session_certificate_designs
language plpgsql security definer set search_path = '' as $$
declare
  actor    public.members := public.assert_fresh_admin();
  v_before public.session_certificate_designs;
  v_row    public.session_certificate_designs;
begin
  if not exists (select 1 from public.sessions s where s.id = p_session and s.org_id = actor.org_id) then
    raise exception 'not_authorized' using errcode = '42501';
  end if;
  if p_kind not in ('attendance', 'presenter') or p_scheme is null then
    raise exception 'design_invalid' using errcode = '22023';
  end if;

  -- The family IS the kind: an attendance certificate carries «شهادة حضور»
  -- in its own document. And the template must be this org's — ★ wave 27, there
  -- is no platform library (DEC-254 §3) — live, with something published to pin.
  if not exists (
    select 1 from public.design_templates t
     where t.id = p_template and t.purpose = 'certificate' and t.family = p_kind::text
       and t.retired_at is null and t.org_id = actor.org_id
  ) or public.certificate_template_latest_version(p_template) is null then
    raise exception 'template_invalid' using errcode = '22023';
  end if;

  -- ★ Locked once any certificate of this kind has reached a member. A held
  -- one is invisible and unemailed (REQ-CRT-004), so it may still change —
  -- that is what `redesign_held_certificates()` is for.
  if exists (
    select 1 from public.certificates c
     where c.session_id = p_session and c.kind = p_kind and c.state in ('issued', 'revoked')
  ) then
    raise exception 'design_locked' using errcode = '55000';
  end if;

  select * into v_before from public.session_certificate_designs d where d.session_id = p_session and d.kind = p_kind;

  insert into public.session_certificate_designs (org_id, session_id, kind, template_id, scheme, updated_by)
  values (actor.org_id, p_session, p_kind, p_template, p_scheme, actor.id)
  on conflict (session_id, kind) do update
    set template_id = excluded.template_id, scheme = excluded.scheme, updated_by = excluded.updated_by
  returning * into v_row;

  perform public.write_audit(actor.org_id, 'certificate.design_set', 'session', p_session,
                             case when v_before.id is null then null else jsonb_build_object('template_id', v_before.template_id, 'scheme', v_before.scheme) end,
                             jsonb_build_object('kind', p_kind, 'template_id', p_template, 'scheme', p_scheme));
  return v_row;
end $$;

-- ═══ 5 · DROP the platform library (D4) ═══
-- SCR-083 and `platform-templates.ts` are gone with PR C; nothing calls these.
drop function public.promote_template_to_platform(uuid, text);        -- 0069:676
drop function public.retire_platform_template(uuid, boolean);         -- 0069:717 — with false it could RESTORE a live platform row
drop function public.set_platform_template_default(uuid);             -- 0069:757
drop function public.platform_template_library();                     -- 0096:49 (replacing 0069:783)
drop function public.platform_promotable_versions(uuid);              -- 0072:35
drop function public.supersede_baseline_template(uuid);               -- 0193:88 — replaced by remove_platform_template()

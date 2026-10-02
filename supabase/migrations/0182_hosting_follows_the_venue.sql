-- 0182 · promoted by the lead (wave 22, DEC-232 §1.1–§1.2) from supabase/proposed/scoring/hosting_follows_the_venue.sql, unchanged below this line.
-- proposed by `scoring` (wave 22, PR A) · DEC-230 §2, DEC-232 §1.1–1.2, REQ-PTS-016, STORY-PTS-008 —
-- hosting points follow THE OWNER OF THE PLACE.
--
-- ★ 0081's header put the host on the session (`sessions.host_company_id`) because «a venue is often reused by many
-- different hosting companies». The owner's model answers it (DEC-230 §2): hosting is WHOSE BUILDING THIS IS, which does
-- not vary. A presenter from company A in a room owned by company B earns A the presenting rule and B the hosting rule.
--
-- Re-created from 0113:563 (the live definition — no later migration replaces it) with RULE 1 ALONE changed. Rules 2
-- and 3 are 0113's text, verbatim. Same signature, so 0081's grants stand (service_role only) and `main`'s worker call
-- (`worker/src/tasks/evaluate_no_shows.ts`) resolves to this function unchanged.
--
-- Rule 1, as the owner ruled it:
--   * ★ A venue owned by NO company — and a custom venue, which has no venue row — rewards NO company. That is the
--     owner's rule («if the location is owned by no company, no company is rewarded»), not a gap. Do not "fix" it.
--   * ★ A DEACTIVATED company earns nothing, even while it owns the venue (DEC-232 §1.2). The venue hosts for nobody
--     until its owner changes or the company is reactivated.
--   * ★ A multi-day session credits EACH DISTINCT OWNER of its days' venues ONCE (DEC-232 §1.1) — identical to «the
--     first day's owner» whenever the days share one, which is every one-day session.
--   * ★ `sessions.host_company_id` is SUPERSEDED and deliberately not read (DEC-230 §2.3). The column stays.
--   * ★ One hosting evaluation per session, ever: a session that already holds a company_hosting row — written under
--     0081's rule before this one, or by an earlier run of this one — is not credited again. The idempotency key (shape
--     unchanged) is the second line of defence. Awarded rows never move (invariant 9).
--   * The venue's owner is read AT EVALUATION (completion); a venue that changes owner later moves nothing written.
--
-- `main` in the gap (DEC-231 §7): every venue's company is null until the owner names it, so no hosting row is written
-- for a session completing between the push and the merge — correct by rule, and never paid later (evaluation runs once).
--
-- 03 §8.2 rows proven by tests/rls/scoring-venue-hosting.test.ts:
--   RPC-evaluate_company_points.hosting                  — the company owning the venue of each of the session's days,
--                                                           once each; the rule's points, version and reason.
--   RPC-evaluate_company_points.hosting_no_owner          — no owner, or a custom venue: no hosting row, by rule.
--   RPC-evaluate_company_points.hosting_inactive_owner    — a deactivated owner: no hosting row.
--   RPC-evaluate_company_points.host_company_id_not_read  — sessions.host_company_id credits nobody.
--   RPC-evaluate_company_points.hosting_once_per_session  — a session already holding a hosting row is not credited again.

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
               where mm.org_id = s.org_id and mm.status = 'active' and mm.company_id = m.company_id) as active
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
               where mm.org_id = s.org_id and mm.status = 'active' and mm.company_id = m.company_id) as active
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

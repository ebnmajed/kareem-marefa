-- designer (wave 3, M6) — achievement certificates: badges and frozen
-- leaderboard snapshots.
--
-- Serves:  REQ-CRT-012, REQ-CRT-008, REQ-LDR-006, 02 §4.12, 03 §5.8,
--          11 §2.5 (JOB-issue_certificates)
-- Cites:   D49, OQ-020, DEC-010, DEC-046 (wave 3 hooks into M4 from SQL only)
-- Follows: 0065.
--
-- Three things worth knowing before reading it:
--
--  1. BADGES ARE OPT-IN AND ALREADY HAVE THEIR COLUMN. `badges.issues_
--     certificate` was created by `scoring` in 0027 and defaults to false
--     (D49, OQ-020). This file adds no column to a wave-2 table; it adds a
--     trigger that reads that one, which is what DEC-046 permits.
--
--  2. A SNAPSHOT CERTIFICATE IS ALWAYS `held`. REQ-CRT-012 says leaderboard
--     certificates are «released by an admin», and that is the difference
--     from a badge certificate: awarding the badge WAS the decision, so a
--     badge certificate issues outright. The two paths therefore reach
--     different states from the same function, by their source.
--
--  3. ★ «TOP 3 MONTHLY AND TOP 3 ANNUAL» IS READ AS «the top 3 of any FINAL
--     member-ranked snapshot». `leaderboard_kind` has no `annual` member —
--     it is `all_time, monthly, seasonal, topic, company` (0027) — and
--     0042 fills `leaderboard_entries` with member ranks for `monthly`,
--     `seasonal` and `topic` only. Inventing an enum value to match the
--     prose would be a schema change to another track's table; reading
--     «annual» as a `seasonal` snapshot whose period is a year needs no
--     schema at all and issues the right three people either way. `topic`
--     is excluded: a per-category board is not one of the two the
--     requirement names, and including it would issue a certificate for
--     every category every month. FLAGGED to the lead as an assumption.
--
--     REQ-LDR-006 is what makes this safe: the snapshot is FROZEN, so a
--     later leaderboard change cannot reissue a different winner for a
--     closed period. The certificate pins `snapshot_id`, not a live query.

-- ── one achievement certificate ────────────────────────────────────────────
create function public.issue_achievement_certificate(
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

  select v.id into v_version
    from public.design_templates t
    join public.design_template_versions v on v.template_id = t.id
   where t.purpose = 'certificate' and t.retired_at is null and t.family = 'achievement'
     and (t.org_id = v_org or t.org_id is null)
     and v.published_at is not null
   order by (t.org_id is not null) desc, t.is_default desc, v.version desc
   limit 1;
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
revoke execute on function public.issue_achievement_certificate(uuid, uuid, uuid, text[]) from public, anon, authenticated;
grant  execute on function public.issue_achievement_certificate(uuid, uuid, uuid, text[]) to service_role;

-- ── the badge hook ─────────────────────────────────────────────────────────
-- `security definer set search_path = ''`, and the RLS test drives it AS AN
-- ADMIN through `award_badge_manually()` — an invoker trigger here would be
-- refused by `enqueue_job`'s own grant the moment anything but the owner
-- awarded a badge, which is exactly how 0063's poster hooks failed.
--
-- The job key puts the BADGE in the slot 11 §2.5 gives the session:
-- `cert:{badge_id}:{member_id}:achievement`. An achievement certificate has
-- no session, and the key's job is to make a re-award idempotent, which the
-- source id does just as well.
create function public.member_badges_certificate_hook() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from public.badges b
              where b.id = new.badge_id and b.retired_at is null and b.issues_certificate) then
    perform public.enqueue_job('issue_certificates',
      jsonb_build_object('member_id', new.member_id, 'kind', 'achievement', 'badge_id', new.badge_id),
      'cert:' || new.badge_id::text || ':' || new.member_id::text || ':achievement',
      null, 'render', 3);
  end if;
  return new;
end $$;

create trigger member_badges_certificate
  after insert on public.member_badges
  for each row execute function public.member_badges_certificate_hook();

-- ── the leaderboard hook ───────────────────────────────────────────────────
create function public.fan_out_snapshot_certificates(p_snapshot uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_rec record;
  v_count int := 0;
begin
  for v_rec in
    select e.member_id
      from public.leaderboard_entries e
      join public.leaderboard_snapshots s on s.id = e.snapshot_id
     where e.snapshot_id = p_snapshot
       and s.is_final
       and s.kind in ('monthly', 'seasonal')
       -- Top 3. `rank()` ties share a number, so a three-way tie for first
       -- issues three certificates and nobody is silently dropped — which
       -- is the right failure for a recognition programme.
       and e.rank <= 3
       and e.member_id is not null
  loop
    perform public.enqueue_job('issue_certificates',
      jsonb_build_object('member_id', v_rec.member_id, 'kind', 'achievement', 'snapshot_id', p_snapshot),
      'cert:' || p_snapshot::text || ':' || v_rec.member_id::text || ':achievement',
      null, 'render', 3);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;
revoke execute on function public.fan_out_snapshot_certificates(uuid) from public, anon, authenticated;
grant  execute on function public.fan_out_snapshot_certificates(uuid) to service_role;

-- ★ THE TRIGGER IS ON `leaderboard_entries`, STATEMENT-LEVEL, and that is
-- forced by the order 0042 writes in: it inserts the snapshot row FIRST and
-- the ranks after, so a row trigger on `leaderboard_snapshots` would fan out
-- over an empty entries table and issue nothing. A statement-level trigger
-- with a transition table sees the whole bulk insert exactly once —
-- per-row it would run the top-3 query once per member of the org.
--
-- Provisional snapshots are filtered out inside the fan-out (`s.is_final`),
-- not here: 0042 writes provisional and final snapshots through the same
-- insert, and the freeze is the property that matters (REQ-LDR-006).
create function public.leaderboard_entries_certificate_hook() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_snapshot uuid;
begin
  for v_snapshot in select distinct snapshot_id from inserted loop
    perform public.fan_out_snapshot_certificates(v_snapshot);
  end loop;
  return null;
end $$;

create trigger leaderboard_entries_certificate
  after insert on public.leaderboard_entries
  referencing new table as inserted
  for each statement execute function public.leaderboard_entries_certificate_hook();

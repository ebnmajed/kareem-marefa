-- wave 7 (DEC-141) — every function outside `checkin`'s own ownership that
-- reads `check_ins` directly, corrected to exclude a removed row, or (the
-- member's own data export) to show the removal honestly. Cross-track SQL
-- hooks, approved by the lead for promotion: `scoring`'s `award_points()`,
-- `evaluate_streaks()`, `evaluate_badges()`; `designer`'s
-- `issue_certificate()`, `fan_out_certificates()`; `notify`'s
-- `send_rating_prompt()`; `platform`'s `build_data_export_payload()`. Each
-- is a one-clause change to an existing function, re-created verbatim
-- otherwise — never a rewrite of an RPC another track owns.
--
-- The late-job race this file's first two hooks close (docs/plan/notes/
-- checkin.md §1): `award_points()`/`issue_certificate()` both RE-DERIVE
-- from `check_ins` at the moment they run rather than trusting their job
-- payload (0065's own stated principle) — a delayed job for an
-- already-removed check-in now skips/refuses exactly as it already does
-- for a check-in that never existed. No new failure mode.
--
-- The other five hooks are the reader-inventory's remaining findings:
-- `evaluate_streaks()`/`evaluate_badges()`'s `check_ins_count` are
-- FORWARD-LOOKING ONLY (DEC-141 ruling 4 — this is not "reversing" an
-- award, it is correctly computing a count that has not crystallised into
-- one yet); `send_rating_prompt()` should not invite a removed member to
-- rate a session they are now on record as not having attended;
-- `build_data_export_payload()` does the OPPOSITE of every other hook here —
-- it must SHOW the removal, not hide it, because a member's own data export
-- is a personal historical record (REQ-PRF-006) and a silently vanished
-- check-in is less honest than one marked corrected.
--
-- Serves:  REQ-PTS-011/012, REQ-CRT-004, REQ-REC-001…003/005, REQ-PRF-006
-- Cites:   0028 (award_points), 0065 (issue_certificate, fan_out_certificates),
--          0035 (send_rating_prompt), 0041 (evaluate_streaks, evaluate_badges),
--          0073 (build_data_export_payload)
-- Docs:    docs/plan/notes/checkin.md "Wave 7 plan", "reader inventory (Correction A)"
--
-- 03 §8.2 rows this adds:
--   | `RPC-award_points.skips_removed_check_in` | A late `award_points('check_in', …)` call for a check-in removed before it ran writes nothing, silently — the same shape as a capped or cooled-down rule. |
--   | `RPC-issue_certificate.no_check_in_when_removed` | A late `issue_certificates` job for a removed check-in raises `no_check_in`, the same refusal as for a member who never checked in. |
--   | `RPC-fan_out_certificates.excludes_removed` | The completion fan-out does not enqueue an attendance certificate for a member whose check-in was removed before completion. |
--   | `RPC-send_rating_prompt.excludes_removed` | A member whose check-in was removed is not prompted to rate the session. |
--   | `RPC-evaluate_streaks.excludes_removed` | A removed check-in does not count toward a streak period not yet awarded; an already-awarded streak_awards row is untouched. |
--   | `RPC-evaluate_badges.excludes_removed` | A removed check-in does not count toward the `check_ins_count` badge metric for a badge not yet granted; an already-granted member_badges row is untouched. |
--   | `RPC-build_data_export_payload.shows_removal` | A member's own data export includes a removed check-in, with `removed_at`/`removal_reason` populated — never dropped from the list. |

-- ═══════════════════════════════════════════════════════════════════════════
-- award_points() — re-created. `scoring`'s (0028).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.award_points(
  p_rule       text,
  p_member     uuid,
  p_source     public.ledger_source,
  p_source_id  uuid,
  p_session    uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  r    public.scoring_rules;
  used int;
  key  text;
begin
  select * into r from public.scoring_rules
   where org_id = (select org_id from public.members where id = p_member)
     and action_key = p_rule;
  if r is null or not r.enabled then
    return;
  end if;

  -- ★ DEC-141's late-job race: the check-in this award is keyed to was
  -- removed (REQ-CHK-017) before this job ran. Skip silently, the same
  -- shape as a capped or cooled-down rule — remove_check_in() already wrote
  -- the compensating reversal for whatever WAS awarded; there is nothing
  -- for this call to add.
  if p_source = 'check_in' and exists (
    select 1 from public.check_ins where id = p_source_id and removed_at is not null
  ) then
    return;
  end if;

  if r.cap_per_session is not null and p_session is not null then
    select coalesce(sum(amount), 0) into used from public.points_ledger
     where member_id = p_member and session_id = p_session and rule_key = p_rule;
    if used >= r.cap_per_session * r.points then
      return;
    end if;
  end if;

  if r.cooldown is not null and exists (
       select 1 from public.points_ledger
        where member_id = p_member and rule_key = p_rule
          and occurred_at > now() - r.cooldown) then
    return;
  end if;

  key := format('%s:%s:%s:%s:v1', p_rule, p_source, p_source_id, p_member);

  insert into public.points_ledger (org_id, member_id, amount, source, source_id, session_id,
                                    reason, rule_key, rule_version, idempotency_key)
  values ((select org_id from public.members where id = p_member),
          p_member, r.points, p_source, p_source_id, p_session,
          r.reason_ar, p_rule, r.version, key)
  on conflict (idempotency_key) do nothing;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- issue_certificate() — re-created. `designer`'s (0065).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.issue_certificate(
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

  select * into v_row from public.certificates c
   where c.org_id = v_org and c.session_id = p_session and c.member_id = p_member and c.kind = p_kind;
  if v_row.id is not null then
    return v_row;
  end if;

  if p_kind = 'attendance' then
    -- ★ DEC-141: excludes a removed check-in. A late job for one now raises
    -- the SAME `no_check_in` it already raises for a member who never
    -- checked in at all.
    select c.id into v_check_in from public.check_ins c
     where c.session_id = p_session and c.member_id = p_member and c.removed_at is null limit 1;
    if v_check_in is null then
      raise exception 'no_check_in' using errcode = '42501';
    end if;
  end if;

  select m.display_name into v_name from public.members m where m.id = p_member;
  if v_name is null then
    raise exception 'unknown_member' using errcode = '42704';
  end if;

  if v_version is null then
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
    public.allocate_serial(v_org),
    public.new_verification_code(),
    case when v_mode = 'review' then 'held' else 'issued' end::public.certificate_state,
    v_version, coalesce(p_font_hashes, '{}'), v_name,
    case when v_mode = 'review' then null else now() end
  ) returning * into v_row;

  perform public.write_audit(v_org, 'certificate.issued', 'certificate', v_row.id, null,
                             jsonb_build_object('kind', p_kind, 'serial', v_row.serial, 'state', v_row.state));
  return v_row;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- fan_out_certificates() — re-created, defensively. `designer`'s (0065).
-- Fires on the edge into `completed`; a removal at that exact instant is a
-- vanishingly unlikely race, but "re-derive, don't trust a stale read" is
-- the standing rule and costs one clause here.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.fan_out_certificates(p_session uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  v_mode public.certificate_mode;
  v_rec  record;
  v_n    int := 0;
begin
  select certificate_mode into v_mode from public.sessions where id = p_session;
  if v_mode is null or v_mode = 'off' then
    return 0;
  end if;

  for v_rec in
    select c.member_id, 'attendance'::public.certificate_kind as kind
      from public.check_ins c where c.session_id = p_session and c.removed_at is null
    union
    select sp.member_id, 'presenter'::public.certificate_kind
      from public.session_presenters sp where sp.session_id = p_session and sp.accepted
  loop
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
-- send_rating_prompt() — re-created. `notify`'s (0035).
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.send_rating_prompt(p_session uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare
  s       public.sessions;
  m       record;
  v_count int := 0;
begin
  select * into s from public.sessions where id = p_session;
  if not found or s.state <> 'completed' then
    return 0;
  end if;

  for m in
    select ci.member_id
      from public.check_ins ci
     where ci.session_id = p_session
       and ci.removed_at is null
       and not exists (select 1 from public.ratings rt where rt.session_id = p_session and rt.member_id = ci.member_id)
  loop
    perform public.notify(
      s.org_id, m.member_id, 'ratings',
      jsonb_build_object('session_id', p_session, 'title', s.title),
      'MSG-rating_prompt');
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- evaluate_streaks() — re-created. `scoring`'s (0041). Forward-looking
-- only: the count a not-yet-awarded period is judged against excludes a
-- removed check-in; an already-inserted streak_awards row (and the points
-- it already paid) is untouched — DEC-141 ruling 4.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.evaluate_streaks() returns void
language plpgsql security definer set search_path = '' as $$
declare
  r record;
  v_period  date;
  v_count   int;
  v_award   uuid;
begin
  for r in
    select sr.id as rule_id, sr.org_id, sr.required_count, m.id as member_id, os.time_zone
      from public.streak_rules sr
      join public.org_settings os on os.org_id = sr.org_id
      join public.members m on m.org_id = sr.org_id and m.status = 'active'
     where sr.enabled
  loop
    v_period := date_trunc('month', (now() at time zone r.time_zone))::date;

    select count(*) into v_count from public.check_ins c
     where c.member_id = r.member_id
       and c.removed_at is null
       and date_trunc('month', (c.arrived_at at time zone r.time_zone))::date = v_period;

    if v_count >= r.required_count then
      v_award := null;
      insert into public.streak_awards (org_id, member_id, rule_id, period_start)
      values (r.org_id, r.member_id, r.rule_id, v_period)
      on conflict (member_id, rule_id, period_start) do nothing
      returning id into v_award;

      if v_award is not null then
        perform public.award_points('streak_month', r.member_id, 'streak', v_award, null);
      end if;
    end if;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- evaluate_badges() — re-created. `scoring`'s (0041). Same forward-looking
-- principle as evaluate_streaks() above, for the `check_ins_count` metric.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.evaluate_badges() returns void
language plpgsql security definer set search_path = '' as $$
declare
  b record;
  m record;
  v_metric        text;
  v_value         numeric;
  v_gte           numeric;
  v_min_sessions  numeric;
  v_sessions_done numeric;
begin
  for b in select * from public.badges where retired_at is null
  loop
    v_metric := b.rule ->> 'metric';
    if v_metric is null or v_metric = 'manual' then continue; end if;
    v_gte := (b.rule ->> 'gte')::numeric;

    for m in select id from public.members where org_id = b.org_id and status = 'active'
    loop
      if exists (select 1 from public.member_badges where member_id = m.id and badge_id = b.id) then
        continue;
      end if;

      v_value := case v_metric
        when 'check_ins_count' then
          (select count(*)::numeric from public.check_ins where member_id = m.id and removed_at is null)
        when 'sessions_delivered_count' then
          (select count(*)::numeric from public.session_presenters sp
             join public.sessions s on s.id = sp.session_id
            where sp.member_id = m.id and sp.accepted and s.state = 'completed')
        when 'ratings_submitted_count' then
          (select count(*)::numeric from public.ratings where member_id = m.id)
        when 'streak_awards_count' then
          (select count(*)::numeric from public.streak_awards where member_id = m.id)
        when 'presenter_rating_avg' then
          (select avg(r.session_stars) from public.ratings r
             join public.session_presenters sp on sp.session_id = r.session_id
            where sp.member_id = m.id and sp.accepted)
        else null
      end;
      if v_value is null then continue; end if;

      if v_metric = 'presenter_rating_avg' then
        v_min_sessions := coalesce((b.rule ->> 'min_sessions')::numeric, 0);
        select count(distinct sp.session_id)::numeric into v_sessions_done
          from public.session_presenters sp join public.sessions s on s.id = sp.session_id
         where sp.member_id = m.id and sp.accepted and s.state = 'completed';
        if v_sessions_done < v_min_sessions then continue; end if;
      end if;

      if v_value >= v_gte then
        insert into public.member_badges (org_id, member_id, badge_id)
        values (b.org_id, m.id, b.id)
        on conflict (member_id, badge_id) do nothing;
      end if;
    end loop;
  end loop;
end $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- build_data_export_payload() — re-created. `platform`'s (0073). The
-- OPPOSITE direction from every hook above: a removed check-in is still IN
-- the member's own export, now carrying `removed_at`/`removal_reason` —
-- REQ-PRF-006's export is a personal historical record, and a silently
-- vanished row is less honest than a marked correction.
-- ═══════════════════════════════════════════════════════════════════════════
create or replace function public.build_data_export_payload(p_member uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $fn$
declare m public.members;
begin
  select * into m from public.members where id = p_member;
  if m.id is null then
    raise exception 'member_not_found' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'generated_at', now(),
    'member', jsonb_build_object(
      'id', m.id, 'email', m.email, 'display_name', m.display_name,
      'job_title', m.job_title, 'bio', m.bio, 'org_role', m.org_role,
      'status', m.status, 'created_at', m.created_at
    ),
    'org', (select jsonb_build_object('name', o.name, 'slug', o.slug) from public.orgs o where o.id = m.org_id),
    'interests', (
      select coalesce(jsonb_agg(c.name order by c.name), '[]'::jsonb)
        from public.member_interests i join public.categories c on c.id = i.category_id
       where i.member_id = m.id
    ),
    'rsvps', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'session', s.title, 'starts_at', s.starts_at, 'status', r.status, 'reserved_at', r.reserved_at
             ) order by r.reserved_at), '[]'::jsonb)
        from public.rsvps r join public.sessions s on s.id = r.session_id
       where r.member_id = m.id
    ),
    'check_ins', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'session', s.title, 'arrived_at', ci.arrived_at, 'method', ci.method,
               'removed_at', ci.removed_at, 'removal_reason', ci.removal_reason
             ) order by ci.arrived_at), '[]'::jsonb)
        from public.check_ins ci join public.sessions s on s.id = ci.session_id
       where ci.member_id = m.id
    ),
    'comments', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'session', s.title, 'body', c.body, 'created_at', c.created_at,
               'in_reply_to', (
                 select pm.display_name from public.comments pc
                   join public.members pm on pm.id = pc.author_id
                  where pc.id = c.parent_id
               )
             ) order by c.created_at), '[]'::jsonb)
        from public.comments c join public.sessions s on s.id = c.session_id
       where c.author_id = m.id and c.deleted_at is null
    ),
    'photos', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'session', s.title, 'storage_path', p.storage_path, 'created_at', p.created_at
             ) order by p.created_at), '[]'::jsonb)
        from public.photos p join public.sessions s on s.id = p.session_id
       where p.uploader_id = m.id
    ),
    'ratings_given', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'session', s.title, 'session_stars', r.session_stars, 'presenter_stars', r.presenter_stars,
               'comment', r.comment, 'submitted_at', r.submitted_at
             ) order by r.submitted_at), '[]'::jsonb)
        from public.ratings r join public.sessions s on s.id = r.session_id
       where r.member_id = m.id
    ),
    'points_ledger', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'amount', l.amount, 'source', l.source, 'reason', l.reason, 'occurred_at', l.occurred_at
             ) order by l.occurred_at), '[]'::jsonb)
        from public.points_ledger l where l.member_id = m.id
    ),
    'certificates', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'serial', c.serial, 'kind', c.kind, 'state', c.state, 'issued_at', c.issued_at
             ) order by c.issued_at), '[]'::jsonb)
        from public.certificates c where c.member_id = m.id
    )
  );
end $fn$;

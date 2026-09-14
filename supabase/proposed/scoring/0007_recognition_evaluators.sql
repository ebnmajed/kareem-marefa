-- scoring/0007_recognition_evaluators.sql — evaluate_streaks(),
-- evaluate_badges(), evaluate_levels_perks() (11 §2.3, REQ-REC-002,
-- REQ-REC-003, REQ-REC-005, REQ-REC-006). STORY-REC-001…004.
--
-- All three are service_role-only, idempotent, and safe to run on any
-- schedule (nightly per 11 §2.3; evaluate_levels_perks also on balance
-- change once a caller wires that trigger — the RPC itself does not care
-- which caller invoked it or how often).
--
-- 03 §8.2 rows this adds:
--   RPC-evaluate_streaks.idempotent      — a member who already has a
--     period's streak_awards row is never awarded twice for it.
--   RPC-evaluate_badges.idempotent       — member_badges' unique constraint
--     makes a re-run a no-op; a `manual` metric badge is never
--     auto-awarded (only an admin RPC can grant it — not yet built).
--   RPC-evaluate_levels_perks.no_demotion — a member's current_level_id
--     never moves to a lower sort_order (REQ-REC-003).
--   RPC-evaluate_levels_perks.perk_materialisation — member_perks reflects
--     level/badge state without a recursive check on the RSVP hot path.
--   RPC-*.service_role_only              — no client role may call any of
--     the three.

-- ═══════════════════════════════════════════════════════════════════════════
-- evaluate_streaks — REQ-REC-005, A10. Month boundaries in the ORG's time
-- zone (A20) — evaluating in UTC shifts the boundary by three hours in
-- Asia/Riyadh and occasionally awards the wrong month.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.evaluate_streaks() returns void
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
revoke execute on function public.evaluate_streaks() from public, anon, authenticated;
grant  execute on function public.evaluate_streaks() to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- evaluate_badges — REQ-REC-001, REQ-REC-002. `rule ->> 'metric' = 'manual'`
-- (the `annual` badge) is skipped entirely: it is granted only through an
-- admin RPC (SCR-054, a later story), never automatically.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.evaluate_badges() returns void
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
          (select count(*)::numeric from public.check_ins where member_id = m.id)
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
revoke execute on function public.evaluate_badges() from public, anon, authenticated;
grant  execute on function public.evaluate_badges() to service_role;

-- ═══════════════════════════════════════════════════════════════════════════
-- evaluate_levels_perks — REQ-REC-003, REQ-REC-004, REQ-REC-006…008.
-- Levels are never lowered by an evaluation; perks are re-materialised into
-- member_perks so the RSVP hot path stays one indexed lookup.
-- ═══════════════════════════════════════════════════════════════════════════
create function public.evaluate_levels_perks() returns void
language plpgsql security definer set search_path = '' as $$
declare
  bal      record;
  v_target public.levels;
  v_cur    public.levels;
begin
  for bal in select member_id, org_id, total_points, current_level_id from public.points_balances
  loop
    select * into v_target from public.levels
     where org_id = bal.org_id and threshold_points <= bal.total_points
     order by threshold_points desc
     limit 1;
    if v_target is null then continue; end if;

    if bal.current_level_id is null then
      update public.points_balances set current_level_id = v_target.id where member_id = bal.member_id;
    else
      select * into v_cur from public.levels where id = bal.current_level_id;
      if v_cur is null or v_target.sort_order > v_cur.sort_order then
        update public.points_balances set current_level_id = v_target.id where member_id = bal.member_id;
      end if;
    end if;
  end loop;

  insert into public.member_perks (org_id, member_id, perk_id)
  select p.org_id, pb.member_id, p.id
    from public.perks p
    join public.points_balances pb on pb.org_id = p.org_id and pb.current_level_id is not null
    join public.levels lvl on lvl.id = pb.current_level_id
   where p.enabled
     and (
       (p.required_level_id is not null and exists (
          select 1 from public.levels rl where rl.id = p.required_level_id and rl.sort_order <= lvl.sort_order
       ))
       or (p.required_badge_id is not null and exists (
          select 1 from public.member_badges mb where mb.member_id = pb.member_id and mb.badge_id = p.required_badge_id
       ))
     )
  on conflict (member_id, perk_id) do nothing;
end $$;
revoke execute on function public.evaluate_levels_perks() from public, anon, authenticated;
grant  execute on function public.evaluate_levels_perks() to service_role;

-- wave 12 (REQ-PTS-015, DEC-172, DEC-174) — streaks and badges that count
-- attended sessions count COMPLETED ones, so no award follows a check-in
-- before its session ends. Independent of 0006–0008.
--
-- Both re-created from 0113 with one predicate added to the attendance count:
-- `sessions.state in ('completed', 'archived')`. `sessions_delivered_count`
-- and `presenter_rating_avg` are verbatim — the first already reads
-- `state = 'completed'`, and neither counts attendance.
--
-- Serves:  REQ-PTS-015, REQ-REC-002, REQ-REC-005
-- Cites:   0113 section 7 (both bodies), 0088 (the removed_at filter)
-- Docs:    docs/plan/notes/scoring.md "Wave 12 plan" A4
--
-- 03 §8.2 rows this adds:
--   | `RPC-evaluate_streaks.counts_completed_sessions` | Check-ins at sessions not yet completed do not count toward a streak; the same sessions completed do. |
--   | `RPC-evaluate_badges.counts_completed_sessions` | The same for the `check_ins_count` badge metric. |

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

    -- ★ REQ-PTS-015: a COMPLETED session. Attendance at a session still
    -- running has earned nothing yet, so it cannot complete a streak either.
    -- The bucket stays the check-in's own month (DEC-174 carries the month-end
    -- gap; this changes which sessions count, not when).
    select count(distinct c.session_id) into v_count from public.check_ins c
      join public.sessions s on s.id = c.session_id
     where c.member_id = r.member_id
       and c.removed_at is null
       and s.state in ('completed', 'archived')
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

-- evaluate_badges() — re-created from 0088, the `check_ins_count` metric
-- counting distinct sessions. Every other metric is untouched.
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
          -- ★ DISTINCT SESSIONS, not check-in rows: three check-ins on one
          -- three-day workshop are one session attended. Identical at n = 1,
          -- where a member has one active check-in per session.
          -- ★ REQ-PTS-015: completed sessions only — `first_check_in` now
          -- arrives the night after the session ends, with its points.
          (select count(distinct c.session_id)::numeric from public.check_ins c
             join public.sessions s on s.id = c.session_id
            where c.member_id = m.id and c.removed_at is null
              and s.state in ('completed', 'archived'))
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

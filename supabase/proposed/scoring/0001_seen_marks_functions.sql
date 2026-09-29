-- scoring · wave 16 (DEC-195 §2.6, DEC-197 §6, REQ-UIX-047, REQ-UIX-048) — the two
-- writers of `member_seen_marks` (0162, the lead's table).
--
-- ★ A CURSOR, NOT A LOG. The page READS the caller's mark and decides, on the
-- server, whether moments 3 to 5 have an occurrence. The client that SHOWED a
-- moment calls one of these when it is done — with exactly the values it
-- showed — so a row written between the render and this call is still unseen
-- next time. Nothing here is called while a page renders.
--
-- `security invoker`: RLS is the boundary (0162's own-row policies), so neither
-- needs a definer. Each checks its arguments BEFORE its one write, so a refusal
-- has nothing to roll back (DEC-043). Last write wins: two tabs acknowledging
-- out of order can at worst replay one moment once, which is written down in
-- `docs/plan/notes/scoring.md` rather than paid for with a sequence column.
--
-- 03 §8.2 rows:
--   | `RPC-mark_points_seen.own_row` | Writes the caller's own mark, inserting it the first time; never another member's. |
--   | `RPC-mark_points_seen.foreign_level` | A level of another org is refused with 22023 and nothing is written. |
--   | `RPC-mark_board_seen.one_board` | Touches only the named board's columns; the others and the points cursor are unchanged. |
--   | `RPC-mark_board_seen.unknown_board` | A board other than all_time, monthly or company is refused with 22023. |
--   | `RPC-mark_board_seen.fraction_clamped` | A company fraction outside 0–1 is stored clamped. |
--   | `RPC-mark_seen.anon` | anon cannot execute either function. |

create function public.mark_points_seen(p_entry uuid, p_total int, p_level uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_member uuid := public.auth_member_id();
  v_org    uuid := public.auth_org_id();
begin
  if v_member is null or v_org is null then
    raise exception 'mark_points_seen: no member session' using errcode = '42501';
  end if;
  if p_level is not null and not exists (select 1 from public.levels l where l.id = p_level and l.org_id = v_org) then
    raise exception 'mark_points_seen: level % is not of this org', p_level using errcode = '22023';
  end if;

  insert into public.member_seen_marks (member_id, org_id, points_entry_id, points_total, level_id)
  values (v_member, v_org, p_entry, p_total, p_level)
  on conflict (member_id) do update
    set points_entry_id = excluded.points_entry_id,
        points_total    = excluded.points_total,
        level_id        = excluded.level_id;
end $$;
revoke execute on function public.mark_points_seen(uuid, int, uuid) from public, anon;
grant  execute on function public.mark_points_seen(uuid, int, uuid) to authenticated;

create function public.mark_board_seen(p_board text, p_period date, p_rank int, p_company uuid, p_fraction numeric)
returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_member   uuid := public.auth_member_id();
  v_org      uuid := public.auth_org_id();
  v_rank     int := case when p_rank > 0 then p_rank end;
  v_fraction numeric := case when p_fraction is null then null else greatest(0, least(1, p_fraction)) end;
begin
  if v_member is null or v_org is null then
    raise exception 'mark_board_seen: no member session' using errcode = '42501';
  end if;
  if p_board is null or p_board not in ('all_time', 'monthly', 'company') then
    raise exception 'mark_board_seen: unknown board %', p_board using errcode = '22023';
  end if;
  if p_company is not null and not exists (select 1 from public.companies c where c.id = p_company and c.org_id = v_org) then
    raise exception 'mark_board_seen: company % is not of this org', p_company using errcode = '22023';
  end if;

  if p_board = 'all_time' then
    insert into public.member_seen_marks (member_id, org_id, all_time_rank)
    values (v_member, v_org, v_rank)
    on conflict (member_id) do update set all_time_rank = excluded.all_time_rank;
  elsif p_board = 'monthly' then
    insert into public.member_seen_marks (member_id, org_id, monthly_period, monthly_rank)
    values (v_member, v_org, p_period, v_rank)
    on conflict (member_id) do update
      set monthly_period = excluded.monthly_period,
          monthly_rank   = excluded.monthly_rank;
  else
    insert into public.member_seen_marks (member_id, org_id, company_period, company_id, company_rank, company_fraction)
    values (v_member, v_org, p_period, p_company, v_rank, v_fraction)
    on conflict (member_id) do update
      set company_period   = excluded.company_period,
          company_id       = excluded.company_id,
          company_rank     = excluded.company_rank,
          company_fraction = excluded.company_fraction;
  end if;
end $$;
revoke execute on function public.mark_board_seen(text, date, int, uuid, numeric) from public, anon;
grant  execute on function public.mark_board_seen(text, date, int, uuid, numeric) to authenticated;

-- scoring · wave 20, PR B (DEC-216 §2.2, DEC-217 §3.3, §4.3, REQ-UIX-078) — `mark_board_seen()` learns the week.
--
-- The boards' first window, «هذا الأسبوع», is summed live (0171); its movement is «منذ زيارتك الأخيرة», read against
-- the caller's own weekly pair on `member_seen_marks` (0169). This is the pair's one writer: the client that SHOWED
-- the week's rank calls it with what it showed, never a render (DEC-195 §2.6). `create or replace` with the SAME
-- signature (0163), so no caller changes and PostgREST sees no second overload.
--
-- ★ The weekly period must be the CURRENT week — `org_week()`'s `week_start` (0171) — and is refused with 22023
-- otherwise, BEFORE the write (DEC-043): a tab left open across Friday midnight must not record last week's rank as
-- this week's. The other three boards are byte-for-byte 0163's.
--
-- `security invoker`, as 0163: the table's own-row policies are the boundary, and the grant is table-level
-- (0162:66), so invariant 6 needs no new grant (0169's header).
--
-- Additive for `main`: `main` never sends `weekly`; the three boards it sends behave exactly as before.
--
-- 03 §8.2 rows:
--   | `RPC-mark_board_seen.weekly` | Writes the caller's own weekly period and rank, touching no other board's columns. |
--   | `RPC-mark_board_seen.weekly_current` | A weekly period other than the current `org_week()` start — or none — is refused with 22023, and nothing is written. |
--   | `RPC-mark_board_seen.unknown_board` (amended) | A board other than all_time, monthly, company or weekly is refused with 22023. |

create or replace function public.mark_board_seen(p_board text, p_period date, p_rank int, p_company uuid, p_fraction numeric)
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
  if p_board is null or p_board not in ('all_time', 'monthly', 'company', 'weekly') then
    raise exception 'mark_board_seen: unknown board %', p_board using errcode = '22023';
  end if;
  if p_company is not null and not exists (select 1 from public.companies c where c.id = p_company and c.org_id = v_org) then
    raise exception 'mark_board_seen: company % is not of this org', p_company using errcode = '22023';
  end if;
  if p_board = 'weekly' and (p_period is null or p_period is distinct from (select w.week_start from public.org_week() w)) then
    raise exception 'mark_board_seen: % is not this week', p_period using errcode = '22023';
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
  elsif p_board = 'weekly' then
    insert into public.member_seen_marks (member_id, org_id, weekly_period, weekly_rank)
    values (v_member, v_org, p_period, v_rank)
    on conflict (member_id) do update
      set weekly_period = excluded.weekly_period,
          weekly_rank   = excluded.weekly_rank;
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

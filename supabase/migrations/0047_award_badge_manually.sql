-- promoted by the lead at wave-2 sync 9 · scoring/0011_award_badge_manually.sql — award_badge_manually() (05 §5.1,
-- REQ-REC-001, REQ-REC-002). SCR-054's manual half: the `annual` badge's
-- `rule ->> 'metric' = 'manual'` is deliberately skipped by
-- evaluate_badges() (0041) — this is the only door it can come through.
--
-- Also usable for any other badge an admin wants to grant by hand
-- (member_badges.awarded_by / award_reason already model that generally,
-- 02 §4.10) — not limited to `annual`.
--
-- 03 §8.2 rows this adds:
--   RPC-award_badge_manually.admin_only — a moderator and a stale admin
--     are refused.
--   RPC-award_badge_manually.reason_mandatory — an empty reason raises
--     before anything is written (member_badges' own check constraint
--     backs this up structurally).
--   RPC-award_badge_manually.idempotent — awarding the same badge twice
--     to the same member is a no-op, not an error.
create function public.award_badge_manually(p_member uuid, p_badge uuid, p_reason text)
returns public.member_badges
language plpgsql security definer set search_path = '' as $$
declare
  admin  public.members := public.assert_fresh_admin();
  target public.members;
  badge  public.badges;
  row    public.member_badges;
begin
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'reason_required' using errcode = '23514';
  end if;

  select * into target from public.members where id = p_member and org_id = admin.org_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  select * into badge from public.badges where id = p_badge and org_id = admin.org_id and retired_at is null;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;

  insert into public.member_badges (org_id, member_id, badge_id, awarded_by, award_reason)
  values (admin.org_id, p_member, p_badge, admin.id, btrim(p_reason))
  on conflict (member_id, badge_id) do nothing
  returning * into row;

  if row.id is null then
    select * into row from public.member_badges where member_id = p_member and badge_id = p_badge;
  end if;

  perform public.write_audit(admin.org_id, 'badge.manual_award', 'member_badges', row.id,
           null, jsonb_build_object('member_id', p_member, 'badge_id', p_badge), p_reason, null, admin.id);

  return row;
end $$;
revoke execute on function public.award_badge_manually(uuid, uuid, text) from public, anon;
grant  execute on function public.award_badge_manually(uuid, uuid, text) to authenticated;

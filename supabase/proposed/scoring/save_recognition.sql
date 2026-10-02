-- proposed by `scoring` (wave 22, PR B) · DEC-231 §3, DEC-232 §3, §5.2, REQ-UIX-091, REQ-UIX-101, REQ-REC-001, -003,
-- -005, -006 — SCR-054's one Save: levels, badges (created or edited, retired or restored), perks and streak rules, in
-- ONE transaction, answering with what it wrote. And `badge_holder_counts()`, the «مُنحت» column.
--
-- SECURITY INVOKER, as `save_scoring_catalogue()`: `0027`'s grants and `p2_admin_*` policies decide, unchanged. Every
-- write is recorded by `recognition_history()` (0123) — one row per changed column, a `created` row for a new badge —
-- and the receipt is those rows, found by this transaction's instant (DEC-232 §3.2). A no-op writes nothing.
--
-- ★ `streak_rules.bonus_points` is NOT written (DEC-232 §4, row 2): nothing reads it; a streak pays
-- `scoring_rules.streak_month`, edited on SCR-053.
-- ★ Levels are written so `unique (org_id, threshold_points)` never sees a transient duplicate: after the climb check
-- (each threshold above the one before it, by `sort_order`), raises are written top-down and lowers bottom-up.
-- ★ Retiring never revokes a held badge (REQ-REC-001): `retired_at` only; restoring clears it.
--
-- Refusals, all before the first write:
--   42501 not_authorized · P0002 not_found:<id> · 40001 stale:<id> (the row changed since the form read it)
--   22023 threshold_order:<level id> · 23505 threshold_taken:<level id>
--
-- 03 §8.2 rows proven by tests/rls/recognition-save.test.ts:
--   RPC-save_recognition.admin_only · .one_transaction · .receipt · .no_op · .stale · .levels_climb · .levels_swap
--   · .badge_created · .retire_keeps_holders · .bonus_points_untouched; RPC-badge_holder_counts.own_org.

create function public.save_recognition(p_levels jsonb default '[]', p_badges jsonb default '[]',
                                        p_perks jsonb default '[]', p_streaks jsonb default '[]')
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_org     uuid := public.auth_org_id();
  r         jsonb;
  l         record;
  v_prev    int;
  v_prev_id uuid;
  v_wrote   jsonb;
begin
  if v_org is null or not public.is_org_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- 1 · Every check, before any write: the rows exist in the caller's org and were not changed since the form read them.
  for r in select * from jsonb_array_elements(coalesce(p_levels, '[]')) loop
    if not exists (select 1 from public.levels where id = (r ->> 'id')::uuid and org_id = v_org) then
      raise exception 'not_found:%', r ->> 'id' using errcode = 'P0002';
    end if;
    if not exists (select 1 from public.levels where id = (r ->> 'id')::uuid and updated_at = (r ->> 'updated_at')::timestamptz) then
      raise exception 'stale:%', r ->> 'id' using errcode = '40001';
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_badges, '[]')) loop
    continue when r ->> 'id' is null;
    if not exists (select 1 from public.badges where id = (r ->> 'id')::uuid and org_id = v_org) then
      raise exception 'not_found:%', r ->> 'id' using errcode = 'P0002';
    end if;
    if not exists (select 1 from public.badges where id = (r ->> 'id')::uuid and updated_at = (r ->> 'updated_at')::timestamptz) then
      raise exception 'stale:%', r ->> 'id' using errcode = '40001';
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_perks, '[]')) loop
    if not exists (select 1 from public.perks where id = (r ->> 'id')::uuid and org_id = v_org) then
      raise exception 'not_found:%', r ->> 'id' using errcode = 'P0002';
    end if;
    if not exists (select 1 from public.perks where id = (r ->> 'id')::uuid and updated_at = (r ->> 'updated_at')::timestamptz) then
      raise exception 'stale:%', r ->> 'id' using errcode = '40001';
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_streaks, '[]')) loop
    if not exists (select 1 from public.streak_rules where id = (r ->> 'id')::uuid and org_id = v_org) then
      raise exception 'not_found:%', r ->> 'id' using errcode = 'P0002';
    end if;
    if not exists (select 1 from public.streak_rules where id = (r ->> 'id')::uuid and updated_at = (r ->> 'updated_at')::timestamptz) then
      raise exception 'stale:%', r ->> 'id' using errcode = '40001';
    end if;
  end loop;

  -- The ladder after the save must still climb with `sort_order` (REQ-REC-003). An equal neighbour is «taken».
  v_prev := null;
  for l in
    select lv.id, coalesce((x.v ->> 'threshold_points')::int, lv.threshold_points) as t
      from public.levels lv
      left join lateral (select v from jsonb_array_elements(coalesce(p_levels, '[]')) v where (v ->> 'id')::uuid = lv.id) x on true
     where lv.org_id = v_org
     order by lv.sort_order
  loop
    if v_prev is not null and l.t <= v_prev then
      if l.t = v_prev then
        raise exception 'threshold_taken:%', l.id using errcode = '23505';
      end if;
      raise exception 'threshold_order:%', l.id using errcode = '22023';
    end if;
    v_prev := l.t;
    v_prev_id := l.id;
  end loop;

  -- 2 · The writes — only where a value differs.
  -- Levels: raises top-down, then lowers (and renames) bottom-up.
  for r in
    select v from jsonb_array_elements(coalesce(p_levels, '[]')) v
      join public.levels lv on lv.id = (v ->> 'id')::uuid
     where (v ->> 'threshold_points')::int > lv.threshold_points
     order by lv.sort_order desc
  loop
    update public.levels set threshold_points = (r ->> 'threshold_points')::int, name = btrim(r ->> 'name')
     where id = (r ->> 'id')::uuid;
  end loop;
  for r in
    select v from jsonb_array_elements(coalesce(p_levels, '[]')) v
      join public.levels lv on lv.id = (v ->> 'id')::uuid
     order by lv.sort_order asc
  loop
    update public.levels set threshold_points = (r ->> 'threshold_points')::int, name = btrim(r ->> 'name')
     where id = (r ->> 'id')::uuid
       and (threshold_points, name) is distinct from ((r ->> 'threshold_points')::int, btrim(r ->> 'name'));
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_badges, '[]')) loop
    if r ->> 'id' is null then
      insert into public.badges (org_id, key, name, description, issues_certificate, rule)
      values (v_org, 'custom_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 12), btrim(r ->> 'name'),
              nullif(btrim(coalesce(r ->> 'description', '')), ''), (r ->> 'issues_certificate')::boolean, r -> 'rule');
    else
      update public.badges
         set name               = btrim(r ->> 'name'),
             description        = nullif(btrim(coalesce(r ->> 'description', '')), ''),
             issues_certificate = (r ->> 'issues_certificate')::boolean,
             rule               = r -> 'rule',
             retired_at         = case when (r ->> 'retired')::boolean then coalesce(retired_at, now()) end
       where id = (r ->> 'id')::uuid
         and (name, description, issues_certificate, rule, retired_at is not null) is distinct from
             (btrim(r ->> 'name'), nullif(btrim(coalesce(r ->> 'description', '')), ''),
              (r ->> 'issues_certificate')::boolean, r -> 'rule', (r ->> 'retired')::boolean);
    end if;
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_perks, '[]')) loop
    update public.perks
       set enabled           = (r ->> 'enabled')::boolean,
           required_level_id = (r ->> 'required_level_id')::uuid,
           required_badge_id = (r ->> 'required_badge_id')::uuid
     where id = (r ->> 'id')::uuid
       and (enabled, required_level_id, required_badge_id) is distinct from
           ((r ->> 'enabled')::boolean, (r ->> 'required_level_id')::uuid, (r ->> 'required_badge_id')::uuid);
  end loop;

  for r in select * from jsonb_array_elements(coalesce(p_streaks, '[]')) loop
    update public.streak_rules
       set required_count = (r ->> 'required_count')::int,
           enabled        = (r ->> 'enabled')::boolean
     where id = (r ->> 'id')::uuid
       and (required_count, enabled) is distinct from ((r ->> 'required_count')::int, (r ->> 'enabled')::boolean);
  end loop;

  -- 3 · The receipt.
  select coalesce(jsonb_agg(h.scope || '.' || h.field order by h.scope, h.field), '[]')
    into v_wrote
    from public.scoring_config_history h
   where h.org_id = v_org
     and h.scope in ('levels', 'badges', 'perks', 'streaks')
     and h.changed_at = now()
     and h.actor_id is not distinct from public.auth_member_id();

  return jsonb_build_object('at', case when jsonb_array_length(v_wrote) > 0 then to_jsonb(now()) end, 'wrote', v_wrote);
end $$;
revoke execute on function public.save_recognition(jsonb, jsonb, jsonb, jsonb) from public, anon;
grant execute on function public.save_recognition(jsonb, jsonb, jsonb, jsonb) to authenticated;
comment on function public.save_recognition(jsonb, jsonb, jsonb, jsonb) is
  'REQ-UIX-101, REQ-UIX-091. SCR-054''s one Save, invoker, one transaction; returns {at, wrote}. Never writes streak_rules.bonus_points (DEC-232 §4).';

-- «مُنحت»: how many members hold each badge of the caller's org — a count, never who. Invoker: `member_badges` is
-- org-readable (0027 `p1_org_read`), so this is a group-by PostgREST cannot express, not a widening.
create function public.badge_holder_counts()
returns table (badge_id uuid, holders int)
language sql stable security invoker set search_path = '' as $$
  select mb.badge_id, count(*)::int
    from public.member_badges mb
   where mb.org_id = public.auth_org_id()
   group by mb.badge_id
$$;
revoke execute on function public.badge_holder_counts() from public, anon;
grant execute on function public.badge_holder_counts() to authenticated;

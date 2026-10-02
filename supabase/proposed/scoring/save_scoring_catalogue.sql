-- proposed by `scoring` (wave 22, PR B) · DEC-231 §3, DEC-232 §3, REQ-UIX-091, REQ-UIX-100, REQ-PTS-004, REQ-PTS-005 —
-- SCR-053's one Save: the catalogue and the company rules, in ONE transaction, answering with what it wrote.
--
-- ★ WHY A FUNCTION. Read mode stages every change until «احفظ»; one Save may touch many rules. N PostgREST updates would
-- leave half a save written when the fifth fails. This function is the save, whole or not at all.
--
-- ★ SECURITY INVOKER — the authority is exactly today's: `0027`'s column grant on `scoring_rules` and `0081`'s on
-- `company_scoring_rules`, under each table's `p2_admin_update`. A moderator and a member are refused before any write.
-- `action_key` and `actor` stay outside the grant, so the catalogue stays fixed (REQ-PTS-010).
--
-- ★ «IT SAVED» IS THE SERVER'S RECEIPT (DEC-232 §3.2). The return is `{at, wrote}`: `wrote` is the history rows this
-- save wrote — found by the save's own transaction instant, `changed_at = now()`, which the history triggers (0027,
-- 0081) stamp in the same transaction — as `<action_key>.<field>`; `at` is that instant, or null when nothing changed.
-- ★ A save that changes nothing writes NOTHING: a row is updated only when a value differs, so no `version` bump and no
-- history row is written for a no-op (today's dialog bumped the version on every press — a setting that silently wrote).
--
-- Refusals, all raised BEFORE the first write (a write-then-raise would roll its own write back — DEC-043 — but there is
-- nothing to roll back if every check comes first):
--   42501 not_authorized          — not an admin of the caller's org
--   P0002 not_found:<id>          — a rule id the caller's org does not hold
--   40001 stale:<action_key>      — the form was read at another version: someone saved in between (DEC-232 §3.3)
--   22023 sign_mismatch:<action_key> — a reward saved negative, or a deduction positive (REQ-PTS-008)
--
-- 03 §8.2 rows proven by tests/rls/scoring-catalogue-save.test.ts:
--   RPC-save_scoring_catalogue.admin_only       — a moderator and a member are refused; nothing is written.
--   RPC-save_scoring_catalogue.one_transaction  — a refusal on the last rule writes none of the earlier ones.
--   RPC-save_scoring_catalogue.receipt          — `wrote` names every history row this save wrote, and nothing else.
--   RPC-save_scoring_catalogue.no_op            — an unchanged form writes no row and no version; `at` is null.
--   RPC-save_scoring_catalogue.stale            — a form read at an older version is refused.
--   RPC-save_scoring_catalogue.sign             — a reward cannot be saved negative, nor a deduction positive.
--   RPC-save_scoring_catalogue.forward_only     — a written ledger row keeps its amount and rule_version.

create function public.save_scoring_catalogue(p_rules jsonb default '[]', p_company jsonb default '[]')
returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_org   uuid := public.auth_org_id();
  r       jsonb;
  cur     public.scoring_rules;
  ccur    public.company_scoring_rules;
  v_wrote jsonb;
begin
  if v_org is null or not public.is_org_admin() then
    raise exception 'not_authorized' using errcode = '42501';
  end if;

  -- 1 · Every check, before any write.
  for r in select * from jsonb_array_elements(coalesce(p_rules, '[]')) loop
    select * into cur from public.scoring_rules where id = (r ->> 'id')::uuid and org_id = v_org;
    if not found then
      raise exception 'not_found:%', r ->> 'id' using errcode = 'P0002';
    end if;
    if cur.version <> (r ->> 'version')::int then
      raise exception 'stale:%', cur.action_key using errcode = '40001';
    end if;
    if (cur.action_key in ('no_show', 'late_cancellation', 'comment_removed', 'photo_removed') and (r ->> 'points')::int > 0)
       or (cur.action_key not in ('no_show', 'late_cancellation', 'comment_removed', 'photo_removed') and (r ->> 'points')::int < 0) then
      raise exception 'sign_mismatch:%', cur.action_key using errcode = '22023';
    end if;
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_company, '[]')) loop
    select * into ccur from public.company_scoring_rules where id = (r ->> 'id')::uuid and org_id = v_org;
    if not found then
      raise exception 'not_found:%', r ->> 'id' using errcode = 'P0002';
    end if;
    if ccur.version <> (r ->> 'version')::int then
      raise exception 'stale:%', ccur.action_key using errcode = '40001';
    end if;
  end loop;

  -- 2 · The writes — only where a value differs.
  for r in select * from jsonb_array_elements(coalesce(p_rules, '[]')) loop
    update public.scoring_rules
       set points          = (r ->> 'points')::int,
           enabled         = (r ->> 'enabled')::boolean,
           cap_per_session = (r ->> 'cap_per_session')::int,
           cooldown        = case when coalesce((r ->> 'cooldown_seconds')::int, 0) = 0 then null
                                  else make_interval(secs => (r ->> 'cooldown_seconds')::int) end,
           reason_ar       = btrim(r ->> 'reason_ar')
     where id = (r ->> 'id')::uuid and org_id = v_org
       and (points, enabled, cap_per_session, cooldown, reason_ar) is distinct from
           ((r ->> 'points')::int, (r ->> 'enabled')::boolean, (r ->> 'cap_per_session')::int,
            case when coalesce((r ->> 'cooldown_seconds')::int, 0) = 0 then null
                 else make_interval(secs => (r ->> 'cooldown_seconds')::int) end,
            btrim(r ->> 'reason_ar'));
  end loop;
  for r in select * from jsonb_array_elements(coalesce(p_company, '[]')) loop
    update public.company_scoring_rules
       set enabled            = (r ->> 'enabled')::boolean,
           points             = (r ->> 'points')::int,
           points_per_percent = (r ->> 'points_per_percent')::numeric,
           cap_points         = (r ->> 'cap_points')::int,
           min_active_members = (r ->> 'min_active_members')::int
     where id = (r ->> 'id')::uuid and org_id = v_org
       and (enabled, points, points_per_percent, cap_points, min_active_members) is distinct from
           ((r ->> 'enabled')::boolean, (r ->> 'points')::int, (r ->> 'points_per_percent')::numeric,
            (r ->> 'cap_points')::int, (r ->> 'min_active_members')::int);
  end loop;

  -- 3 · The receipt: exactly the history rows this transaction wrote, by its own instant and its own author.
  select coalesce(jsonb_agg(k.action_key || '.' || h.field order by k.action_key, h.field), '[]')
    into v_wrote
    from public.scoring_config_history h
    join (select id, action_key from public.scoring_rules where org_id = v_org
          union all
          select id, action_key from public.company_scoring_rules where org_id = v_org) k on k.id = h.entity_id
   where h.org_id = v_org
     and h.scope in ('scoring', 'company_scoring')
     and h.field <> 'version'
     and h.changed_at = now()
     and h.actor_id is not distinct from public.auth_member_id();

  return jsonb_build_object('at', case when jsonb_array_length(v_wrote) > 0 then to_jsonb(now()) end, 'wrote', v_wrote);
end $$;
revoke execute on function public.save_scoring_catalogue(jsonb, jsonb) from public, anon;
grant execute on function public.save_scoring_catalogue(jsonb, jsonb) to authenticated;
comment on function public.save_scoring_catalogue(jsonb, jsonb) is
  'REQ-UIX-100, REQ-UIX-091. SCR-053''s one Save, invoker (the grants decide), one transaction; returns {at, wrote}, the history rows it wrote — empty when nothing changed (DEC-232 §3).';

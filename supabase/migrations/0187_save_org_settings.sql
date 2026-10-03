-- 0187 · promoted by the lead (wave 22, DEC-232) from supabase/proposed/notify/save_org_settings.sql, unchanged below this line.
-- notify (wave 22, SCR-063) — one save of the settings page, in one transaction, answering what it wrote.
--
-- Serves:  REQ-UIX-102, REQ-UIX-091 (the saved mark from the record the save wrote), REQ-TEN-008 (every change in the
--          history with actor, time, old and new value), REQ-TEN-007 (a domain added or removed, audited),
--          REQ-ADM-023 · DEC-231 §3, DEC-232 §3 and §5.1
-- Cites:   0004 (org_settings, its column grant and `org_settings_history()`; orgs' `grant update (name)`; org_domains
--          and its policies) · 0005 (`org_domains_audit()`) · 0175 (company_min_active_members' grant) · the lead's
--          audit migration (`org.renamed`)
--
-- ★ SECURITY INVOKER, ON PURPOSE. Every write below is one the admin could make directly: `p2_admin_update` and the
-- column grant on `org_settings`, `orgs_update_own` and `grant update (name)` on `orgs`, the admin policies on
-- `org_domains`. Running as the caller keeps every one of them — a moderator or a member is refused by the same rules
-- as a direct write, and nothing here can write a column the grant does not name. What the function adds is the
-- transaction: settings, name and domains commit together or not at all, so a refused domain never leaves half a save.
--
-- ★ NOTHING IS RECORDED HERE. The records are the triggers': `org_settings_history()` writes one history row per
-- CHANGED column, `org_domains_audit()` one `domain.added` / `domain.removed` per row, the lead's `orgs_rename_audit()`
-- one `org.renamed`. Nothing is written twice (DEC-231 §4).
--
-- ★ THE RECEIPT. `org_settings_history()` stamps `changed_at` with the transaction's `now()`, so this save's history rows
-- are exactly those with `changed_at = now()` on this org's settings row. `audit_log.occurred_at` is `clock_timestamp()`,
-- not `now()`, so its rows are found by what this save touched instead: the org and the domain rows it wrote, by this
-- actor, from this transaction's start. `wrote` is that list; empty means the save changed nothing (DEC-232 §3.2). `at` travels as jsonb's ISO text, so the
-- microseconds survive the trip (a JS Date keeps milliseconds).
--
-- ★ ONLY WHAT CHANGED, AND NEVER OVER ANOTHER ADMIN'S SAVE (D-N4). `p_changes` holds only the fields the admin edited;
-- `p_expected` the values the page opened with for those same fields. The settings row is locked, and a field whose
-- stored value no longer equals its expected one is reported `stale` before anything is written. A column not in
-- `p_changes` is set to itself, which writes no history row.
--
-- ★ WRITE-THEN-RAISE (DEC-043): every refusal this function makes is decided BEFORE its first write and returned as an
-- envelope. A constraint the database enforces after a write (a check on a column, the domain's shape) raises and rolls
-- the whole save back — which is the point of one transaction. The action validates every field first, so that path
-- is a defect, not a flow.

create function public.save_org_settings(
  p_changes        jsonb,
  p_expected       jsonb,
  p_name           text    default null,
  p_expected_name  text    default null,
  p_add_domains    text[]  default '{}',
  p_remove_domains uuid[]  default '{}'
) returns jsonb
language plpgsql security invoker set search_path = '' as $$
declare
  v_org     uuid := public.auth_org_id();
  v_now     timestamptz := now();
  v_row     jsonb;
  v_id      uuid;
  v_key     text;
  v_stale   text[] := '{}';
  v_allowed text[] := array[
    'time_zone', 'check_in_rotation_seconds', 'check_in_grace_seconds', 'max_co_presenters', 'company_metric',
    'priority_rsvp_hours', 'limit_document_mb', 'limit_audio_mb', 'limit_image_mb', 'limit_poster_mb',
    'allow_jpeg_export', 'email_from_name', 'email_reply_to', 'rating_min_aggregate', 'company_min_active_members'];
  v_name    text;
  v_left    int;
  v_wrote   jsonb;
  v_subjects uuid[] := '{}';
begin
  if v_org is null or not public.is_org_admin() then
    return jsonb_build_object('ok', false, 'error', 'not_permitted');
  end if;
  p_changes := coalesce(p_changes, '{}'::jsonb);
  p_expected := coalesce(p_expected, '{}'::jsonb);

  for v_key in select jsonb_object_keys(p_changes) loop
    if not (v_key = any (v_allowed)) then
      return jsonb_build_object('ok', false, 'error', 'unknown_field', 'field', v_key);
    end if;
  end loop;

  select s.id, to_jsonb(s) into v_id, v_row from public.org_settings s where s.org_id = v_org for update;
  if v_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_written');
  end if;

  for v_key in select jsonb_object_keys(p_changes) loop
    if (v_row -> v_key) is distinct from (p_expected -> v_key) then
      v_stale := v_stale || v_key;
    end if;
  end loop;

  if p_name is not null then
    select o.name into v_name from public.orgs o where o.id = v_org for update;
    if v_name is distinct from p_expected_name then
      v_stale := v_stale || 'name'::text;
    end if;
  end if;

  if cardinality(p_remove_domains) > 0 or cardinality(p_add_domains) > 0 then
    if exists (select 1 from unnest(p_remove_domains) r
                where not exists (select 1 from public.org_domains d where d.id = r and d.org_id = v_org)) then
      v_stale := v_stale || 'domains'::text;
    end if;
    select count(*) into v_left
      from public.org_domains d
     where d.org_id = v_org and not (d.id = any (p_remove_domains));
    -- The last domain is never removed: with none, nobody new can join (REQ-TEN-007, DEC-232 §5.1).
    if v_left + cardinality(p_add_domains) = 0 then
      return jsonb_build_object('ok', false, 'error', 'domain_last');
    end if;
  end if;

  if cardinality(v_stale) > 0 then
    return jsonb_build_object('ok', false, 'error', 'stale', 'fields', to_jsonb(v_stale));
  end if;

  -- ── the writes ────────────────────────────────────────────────────────────────────────────────────────────────────
  if p_changes <> '{}'::jsonb then
    update public.org_settings s set
      time_zone                  = case when p_changes ? 'time_zone' then p_changes ->> 'time_zone' else s.time_zone end,
      check_in_rotation_seconds  = case when p_changes ? 'check_in_rotation_seconds' then (p_changes ->> 'check_in_rotation_seconds')::int else s.check_in_rotation_seconds end,
      check_in_grace_seconds     = case when p_changes ? 'check_in_grace_seconds' then (p_changes ->> 'check_in_grace_seconds')::int else s.check_in_grace_seconds end,
      max_co_presenters          = case when p_changes ? 'max_co_presenters' then (p_changes ->> 'max_co_presenters')::int else s.max_co_presenters end,
      company_metric             = case when p_changes ? 'company_metric' then (p_changes ->> 'company_metric')::public.company_metric else s.company_metric end,
      priority_rsvp_hours        = case when p_changes ? 'priority_rsvp_hours' then (p_changes ->> 'priority_rsvp_hours')::int else s.priority_rsvp_hours end,
      limit_document_mb          = case when p_changes ? 'limit_document_mb' then (p_changes ->> 'limit_document_mb')::int else s.limit_document_mb end,
      limit_audio_mb             = case when p_changes ? 'limit_audio_mb' then (p_changes ->> 'limit_audio_mb')::int else s.limit_audio_mb end,
      limit_image_mb             = case when p_changes ? 'limit_image_mb' then (p_changes ->> 'limit_image_mb')::int else s.limit_image_mb end,
      limit_poster_mb            = case when p_changes ? 'limit_poster_mb' then (p_changes ->> 'limit_poster_mb')::int else s.limit_poster_mb end,
      allow_jpeg_export          = case when p_changes ? 'allow_jpeg_export' then (p_changes ->> 'allow_jpeg_export')::boolean else s.allow_jpeg_export end,
      email_from_name            = case when p_changes ? 'email_from_name' then p_changes ->> 'email_from_name' else s.email_from_name end,
      email_reply_to             = case when p_changes ? 'email_reply_to' then p_changes ->> 'email_reply_to' else s.email_reply_to end,
      rating_min_aggregate       = case when p_changes ? 'rating_min_aggregate' then (p_changes ->> 'rating_min_aggregate')::int else s.rating_min_aggregate end,
      company_min_active_members = case when p_changes ? 'company_min_active_members' then (p_changes ->> 'company_min_active_members')::int else s.company_min_active_members end
    where s.id = v_id;
  end if;

  if p_name is not null and p_name is distinct from v_name then
    update public.orgs o set name = btrim(p_name) where o.id = v_org;
    v_subjects := v_subjects || v_org;
  end if;

  if cardinality(p_remove_domains) > 0 then
    with gone as (delete from public.org_domains d where d.org_id = v_org and d.id = any (p_remove_domains) returning d.id)
    select v_subjects || coalesce(array_agg(id), '{}') into v_subjects from gone;
  end if;
  if cardinality(p_add_domains) > 0 then
    with added as (insert into public.org_domains (org_id, domain) select v_org, a from unnest(p_add_domains) a returning id)
    select v_subjects || coalesce(array_agg(id), '{}') into v_subjects from added;
  end if;

  -- ── the receipt: what the triggers wrote, at this transaction's instant ──────────────────────────────────────────
  select coalesce(jsonb_agg(w order by w), '[]'::jsonb) into v_wrote from (
    select h.field as w from public.scoring_config_history h
     where h.org_id = v_org and h.scope = 'org_settings' and h.entity_id = v_id and h.changed_at = v_now
       and h.actor_id is not distinct from public.auth_member_id()
    union
    select a.action from public.audit_log a
     where a.org_id = v_org and a.subject_id = any (v_subjects) and a.occurred_at >= v_now
       and a.actor_id = public.auth_member_id()
       and a.action in ('domain.added', 'domain.removed', 'domain.changed', 'org.renamed')
  ) x;

  return jsonb_build_object('ok', true, 'at', v_now, 'wrote', v_wrote);
end $$;

revoke execute on function public.save_org_settings(jsonb, jsonb, text, text, text[], uuid[]) from public, anon;
grant execute on function public.save_org_settings(jsonb, jsonb, text, text, text[], uuid[]) to authenticated;

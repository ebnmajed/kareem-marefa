-- wave 22 (DEC-231 §4, DEC-232 §2, REQ-ADM-023, STORY-ADM-011) — the console's audit gaps, closed in the database.
--
-- ★ THE RULE HAD QUIETLY NOT HELD SINCE WAVE 6. Measured at wave 22's Step 0: creating, renaming and (de)activating a
-- venue, a category or a company wrote nothing; dismissing a report wrote only `reports.resolved_by` on the row;
-- creating, saving and deleting a survey template wrote nothing; and renaming the org wrote nothing (DEC-232 §2.1,
-- `notify`'s A-G1). `0161` audited a company's team colour and said, of the rest, «the owner's call» (DEC-186 §8). The
-- owner's call came in wave 22: «the audit log answers who did this, when, and why for everything these screens can do».
--
-- ★ TRIGGERS, NOT DAL CALLS, so every path that can write is covered — the screen's action, a direct admin write under
-- the table's own policy, and the owner's scoped statement (recorded with a null actor and the role `system`, by
-- `write_audit()`, 0005). `0161`'s pattern: SECURITY DEFINER with an empty search path, calling `write_audit()` — the
-- only way a row enters `audit_log` (invariant 9). No new grant; a function returning `trigger` cannot be called through
-- the API (`tests/rls/definer-exposure.test.ts`).
--
-- ★ NOTHING IS WRITTEN TWICE. Each table's existing record stays the only one for what it already covers:
-- `company.team_color_changed` (0161) is not repeated by `company.changed`; `comment.removed` / `photo.removed`
-- (0059, 0051) are not repeated by `report.resolved`, which records the report's outcome; `domain.*` (0005) is the org's
-- domains. `content`'s `resolve_report()` does not call `write_audit()` for the resolution (DEC-232 §4.5).
--
-- ★ THE ORG-DELETION ESCAPE (DEC-232 §2.4). `perform_org_deletion()` (0069) relies on every trigger on the way down
-- returning early when its org is gone. Venues, categories, companies and orgs are audited on INSERT and UPDATE only —
-- nothing deletes them but the cascade — so no arm here can fire during it. `survey_templates` is deleted by staff, so
-- its DELETE arm returns early when the org is gone, as `org_domains_audit()` (0008) does.
--
-- Additive for `main`, which runs this schema before it runs the code: every trigger fires on writes `main` already
-- makes, and adds a row to `audit_log`, which `main`'s audit screen already lists. Nothing else moves.
--
-- Actions (DEC-231 §4, DEC-232 §2): venue.created · venue.changed · venue.company_changed · venue.deactivated ·
-- venue.reactivated · category.created · category.changed · category.deactivated · category.reactivated ·
-- company.created · company.changed · company.deactivated · company.reactivated · report.resolved ·
-- survey_template.created · survey_template.changed · survey_template.deleted · org.renamed.

-- ── the three managed lists ─────────────────────────────────────────────────────────────────────────────────────────
-- `tg_argv[0]` names the subject. A change of name (and, for a venue, of its descriptive fields) is `.changed`; a change
-- of `deactivated_at` is `.deactivated` / `.reactivated`; a venue's owner is `venue.company_changed` (DEC-232 §2.6 —
-- one save touching both writes both rows). `updated_at` alone writes nothing.
create function public.managed_list_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := tg_argv[0];
  v_old jsonb; v_new jsonb; v_fields text[];
begin
  v_fields := case v_kind
    when 'venue' then array['name', 'address', 'map_url', 'capacity', 'notes', 'time_zone']
    else array['name'] end;
  v_new := to_jsonb(new);

  if tg_op = 'INSERT' then
    perform public.write_audit(new.org_id, v_kind || '.created', v_kind, new.id, null,
      (select jsonb_object_agg(k, v_new -> k) from unnest(v_fields || case v_kind
         when 'venue' then array['company_id'] when 'company' then array['team_color'] else array[]::text[] end) k));
    return new;
  end if;

  v_old := to_jsonb(old);
  if exists (select 1 from unnest(v_fields) k where v_old -> k is distinct from v_new -> k) then
    perform public.write_audit(new.org_id, v_kind || '.changed', v_kind, new.id,
      (select jsonb_object_agg(k, v_old -> k) from unnest(v_fields) k where v_old -> k is distinct from v_new -> k),
      (select jsonb_object_agg(k, v_new -> k) from unnest(v_fields) k where v_old -> k is distinct from v_new -> k));
  end if;
  if v_kind = 'venue' and v_old -> 'company_id' is distinct from v_new -> 'company_id' then
    perform public.write_audit(new.org_id, 'venue.company_changed', 'venue', new.id,
      jsonb_build_object('company_id', v_old -> 'company_id'), jsonb_build_object('company_id', v_new -> 'company_id'));
  end if;
  if old.deactivated_at is null and new.deactivated_at is not null then
    perform public.write_audit(new.org_id, v_kind || '.deactivated', v_kind, new.id,
      jsonb_build_object('deactivated_at', null), jsonb_build_object('deactivated_at', new.deactivated_at));
  elsif old.deactivated_at is not null and new.deactivated_at is null then
    perform public.write_audit(new.org_id, v_kind || '.reactivated', v_kind, new.id,
      jsonb_build_object('deactivated_at', old.deactivated_at), jsonb_build_object('deactivated_at', null));
  end if;
  return new;
end $$;

create trigger venues_audit after insert or update on public.venues
  for each row execute function public.managed_list_audit('venue');
create trigger categories_audit after insert or update on public.categories
  for each row execute function public.managed_list_audit('category');
create trigger companies_audit after insert or update on public.companies
  for each row execute function public.managed_list_audit('company');

-- ── a report's resolution ───────────────────────────────────────────────────────────────────────────────────────────
-- Fires once, when a report leaves `open`. The outcome and the actor are the report's own (`resolved_by`), so the row
-- names who decided even when the resolution is written by a definer function.
create function public.reports_resolution_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.write_audit(new.org_id, 'report.resolved', 'report', new.id,
    jsonb_build_object('status', old.status),
    jsonb_build_object('status', new.status, 'resolution', new.resolution, 'target', new.target,
                       'comment_id', new.comment_id, 'photo_id', new.photo_id),
    null, null, new.resolved_by);
  return new;
end $$;

create trigger reports_resolution_audit after update of status on public.reports
  for each row when (old.status = 'open' and new.status <> 'open')
  execute function public.reports_resolution_audit();

-- ── survey templates ────────────────────────────────────────────────────────────────────────────────────────────────
-- On `survey_templates` alone (DEC-232 §2.5): a save updates the template row and deletes and re-inserts its questions,
-- so a trigger on the questions would write one row per question per save. `after` carries the title.
create function public.survey_templates_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(new.org_id, 'survey_template.created', 'survey_template', new.id, null,
                               jsonb_build_object('title', new.title));
    return new;
  elsif tg_op = 'DELETE' then
    -- The org itself is being deleted: nothing to attach the row to (0008's escape).
    if not exists (select 1 from public.orgs o where o.id = old.org_id) then
      return old;
    end if;
    perform public.write_audit(old.org_id, 'survey_template.deleted', 'survey_template', old.id,
                               jsonb_build_object('title', old.title), null);
    return old;
  else
    perform public.write_audit(new.org_id, 'survey_template.changed', 'survey_template', new.id,
                               jsonb_build_object('title', old.title), jsonb_build_object('title', new.title));
    return new;
  end if;
end $$;

create trigger survey_templates_audit after insert or update or delete on public.survey_templates
  for each row execute function public.survey_templates_audit();

-- ── the org's name ──────────────────────────────────────────────────────────────────────────────────────────────────
create function public.orgs_rename_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.write_audit(new.id, 'org.renamed', 'org', new.id,
                             jsonb_build_object('name', old.name), jsonb_build_object('name', new.name));
  return new;
end $$;

create trigger orgs_rename_audit after update of name on public.orgs
  for each row when (old.name is distinct from new.name)
  execute function public.orgs_rename_audit();

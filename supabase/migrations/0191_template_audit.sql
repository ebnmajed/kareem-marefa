-- 0191 · wave 23 (DEC-238, REQ-ADM-023, REQ-UIX-108, STORY-UIX-098) — a design template's changes, audited in the database.
--
-- ★ WAVE 22 MISSED THESE. `REQ-ADM-023` says every change the console can make writes a record naming the actor, the
-- time and what changed; `0181` closed six kinds and left the template library out. Measured at wave 23's sync 1
-- (`console`'s note §5): creating, duplicating, publishing, setting a default, renaming and retiring or restoring a
-- template wrote NOTHING. This is why wave 23, which expected no migration (`DEC-235` §3), has one.
--
-- ★ TRIGGERS, NOT DAL CALLS (`0181`'s rule): the screen's action, a direct admin write under the table's own policy and
-- the owner's scoped statement are all covered. SECURITY DEFINER, empty search path, `write_audit()` — the only way a
-- row enters `audit_log` (invariant 9). No new grant; a function returning `trigger` cannot be called through the API
-- (`tests/rls/definer-exposure.test.ts`).
--
-- ★ ORG ROWS ONLY. `org_id is null` is a platform template, whose changes are the platform's and not an org's log.
--
-- ★ NOTHING IS WRITTEN TWICE.
--   · «Set default» is ONE row. `design_templates_single_default` (0057) clears the previous default with an UPDATE on
--     the same table in the same move, which fires this trigger with `true → false`: that arm writes nothing. Only
--     `false → true` writes `design_template.default_set`.
--   · Retiring a default clears its flag too; the retirement is the row, the cleared flag writes nothing.
--   · A template's first version, inserted with the template by create or duplicate, is said by `.created`: an INSERT
--     of a version writes `.published` only from version 2. A version published LATER (an UPDATE of `published_at`
--     from null) writes `.published`, whatever its number.
--   · A draft document (`design_documents`) writes nothing: it is a working copy, not a change to the library.
--   · `updated_at` alone, and `duplicated_from` set to null by a platform template's removal, write nothing.
--
-- ★ THE ORG-DELETION ESCAPE (`DEC-232` §2.4, `0181`). `perform_org_deletion()` (0069) relies on every trigger on the way
-- down returning early when its org is gone; both functions here do, before anything else.
--
-- Additive for `main`, which runs this schema before it runs the code: every trigger fires on writes `main` already
-- makes and adds a row to `audit_log`, which `main`'s audit screen already lists. Nothing else moves.
--
-- Actions: design_template.created · design_template.renamed · design_template.default_set · design_template.retired ·
-- design_template.restored · design_template.published.

create function public.design_template_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.org_id is null or not exists (select 1 from public.orgs o where o.id = new.org_id) then
    return new;
  end if;

  if tg_op = 'INSERT' then
    perform public.write_audit(new.org_id, 'design_template.created', 'design_template', new.id, null,
      jsonb_build_object('purpose', new.purpose, 'family', new.family, 'name', new.name,
                         'duplicated_from', new.duplicated_from));
    return new;
  end if;

  if old.name is distinct from new.name then
    perform public.write_audit(new.org_id, 'design_template.renamed', 'design_template', new.id,
      jsonb_build_object('name', old.name), jsonb_build_object('name', new.name));
  end if;
  if not old.is_default and new.is_default then
    perform public.write_audit(new.org_id, 'design_template.default_set', 'design_template', new.id,
      null, jsonb_build_object('purpose', new.purpose, 'family', new.family));
  end if;
  if old.retired_at is null and new.retired_at is not null then
    perform public.write_audit(new.org_id, 'design_template.retired', 'design_template', new.id,
      jsonb_build_object('retired_at', null), jsonb_build_object('retired_at', new.retired_at));
  elsif old.retired_at is not null and new.retired_at is null then
    perform public.write_audit(new.org_id, 'design_template.restored', 'design_template', new.id,
      jsonb_build_object('retired_at', old.retired_at), jsonb_build_object('retired_at', null));
  end if;
  return new;
end $$;

create trigger design_templates_audit after insert or update on public.design_templates
  for each row execute function public.design_template_audit();

create function public.design_template_version_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.org_id is null or not exists (select 1 from public.orgs o where o.id = new.org_id) then
    return new;
  end if;
  if (tg_op = 'INSERT' and new.published_at is not null and new.version > 1)
     or (tg_op = 'UPDATE' and old.published_at is null and new.published_at is not null) then
    perform public.write_audit(new.org_id, 'design_template.published', 'design_template', new.template_id,
      null, jsonb_build_object('version', new.version, 'version_id', new.id));
  end if;
  return new;
end $$;

create trigger design_template_versions_audit after insert or update on public.design_template_versions
  for each row execute function public.design_template_version_audit();

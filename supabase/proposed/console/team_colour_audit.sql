-- console · wave 15 (DEC-183 §4.11, DEC-186 §8) — companies_team_color_audit().
--
-- A company's edits have never been audited — neither has a category's or a
-- venue's (found while planning, docs/plan/notes/console.md). The team
-- colour's audit is the first this table has ever had, and it covers the
-- team colour ONLY: widening it to `name`/`deactivated_at` is a request to
-- the owner, not built here (`.claude/agents/console.md`, DEC-186 §8).
--
-- Same pattern as `org_domains_audit()` (0005_tenancy_rpcs.sql:315-330):
-- SECURITY DEFINER, `set search_path = ''`, fires only when the column
-- actually changed (never on a `name`/`deactivated_at`-only update), and
-- calls `write_audit()` — the ONLY way a row enters `audit_log` — which is
-- itself SECURITY DEFINER and grants EXECUTE to `service_role` alone
-- (0005:39-40); this trigger runs as its owner, the same route
-- `org_domains_audit()` already takes to call it. No new grant is needed.
create function public.companies_team_color_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.write_audit(
    new.org_id, 'company.team_color_changed', 'company', new.id,
    jsonb_build_object('teamColor', old.team_color),
    jsonb_build_object('teamColor', new.team_color)
  );
  return new;
end $$;

create trigger companies_team_color_audit
  after update on public.companies
  for each row
  when (old.team_color is distinct from new.team_color)
  execute function public.companies_team_color_audit();

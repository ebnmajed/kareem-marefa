-- 0161 · wave 15 (DEC-183 §4.11, DEC-186 §8, REQ-UIX-043) — the team colour's audit.
--
-- Promoted from `supabase/proposed/console/team_colour_audit.sql` (`console`,
-- 4c0d4ef4), unchanged below the header.
--
-- A company's edits have never been audited — neither has a category's or a
-- venue's (DEC-186 §8). This is the first audit `companies` has had, and it
-- covers THE TEAM COLOUR ONLY: widening it to `name` and `deactivated_at` adds
-- audit actions to three tables this wave does not touch, and is the owner's
-- call.
--
-- ★ A TRIGGER, NOT AN RPC, so every path that can write the column is covered:
-- the screen's action, a direct write under `p2_admin_update`, and the owner's
-- own scoped statement — which carries no session and is recorded with a null
-- actor and the role `system` (`write_audit()`, 0005).
--
-- Same pattern as `org_domains_audit()` (0005:315): SECURITY DEFINER with an
-- empty search path, calling `write_audit()`, the only way a row enters
-- `audit_log` (invariant 9). `write_audit()` grants EXECUTE to `service_role`
-- alone; this function runs as its owner, which is `write_audit()`'s owner. No
-- new grant. A function returning `trigger` cannot be called through the API,
-- whatever its ACL (`tests/rls/definer-exposure.test.ts`).
--
-- It fires only when the colour CHANGED — `is distinct from`, so null to a
-- colour and a colour to null both count, and a rename or a deactivation
-- writes nothing.
--
-- Additive for `main`, which runs this schema before it runs the code: `main`'s
-- app and `main`'s worker never write `team_color`, so in the gap the `when`
-- clause is never true and the trigger never fires. Nothing moves.

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

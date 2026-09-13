-- 0008 — org_domains audit trigger: not on a cascade from org deletion.
--
-- Found by the signed-in e2e's teardown: deleting an org cascades to its
-- domains, and the AFTER DELETE trigger (0005) then wrote an audit row
-- referencing an org that no longer exists — a foreign-key violation that
-- made org deletion impossible. A cascade is not an admin removing a domain
-- (REQ-TEN-007); the org's own deletion is the platform-level act, audited
-- there (M8). Forward-only: replaces the function body, keeps the trigger.

create or replace function public.org_domains_audit() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    perform public.write_audit(new.org_id, 'domain.added', 'org_domain', new.id, null,
                               jsonb_build_object('domain', new.domain));
    return new;
  elsif tg_op = 'DELETE' then
    -- The org itself is being deleted: nothing to attach the row to.
    if not exists (select 1 from public.orgs o where o.id = old.org_id) then
      return old;
    end if;
    perform public.write_audit(old.org_id, 'domain.removed', 'org_domain', old.id,
                               jsonb_build_object('domain', old.domain), null);
    return old;
  else
    perform public.write_audit(new.org_id, 'domain.changed', 'org_domain', new.id,
                               jsonb_build_object('domain', old.domain),
                               jsonb_build_object('domain', new.domain));
    return new;
  end if;
end $$;

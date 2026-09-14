-- content, follow-up — REQ-MAT-006: "Changing the flag takes effect
-- immediately and is audited." The client's own UPDATE (materials_update_
-- presenter/_admin, 0037) already makes the change take effect immediately;
-- this trigger is the audit half, the same shape as proposals_audit_
-- transition() (0011) — a trigger, not an RPC, because "no change occurs
-- without an audit row" has to hold regardless of which of the two RLS
-- policies let the UPDATE through, and a trigger is a property of the
-- table rather than something a second write path could skip.
--
-- Serves:  REQ-MAT-006 ("Changing the flag takes effect immediately and is
--          audited")
-- Cites:   0005 (public.write_audit) · 0037 (materials, materials_update_
--          presenter/_admin's column grant: title, phase, allow_download)
--
-- 03 §8.2 row this adds:
--   | `POL-materials.phase_change.audited` | Changing `phase` writes one
--     `audit_log` row naming the old and new value; changing `title` or
--     `allow_download` alone writes none. |
create function public.materials_audit_phase_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.phase is distinct from old.phase then
    perform public.write_audit(
      new.org_id, 'material.phase_changed', 'material', new.id,
      jsonb_build_object('phase', old.phase), jsonb_build_object('phase', new.phase)
    );
  end if;
  return new;
end $$;
create trigger materials_audit_phase_change after update of phase on public.materials
  for each row execute function public.materials_audit_phase_change();

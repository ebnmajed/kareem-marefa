-- content, follow-up — REQ-EVT-012 ("A moderator can restore it if the
-- request was mistaken; restoration is audited") and REQ-EVT-014
-- ("Removal is audited with actor and reason"). Same shape as
-- materials_audit_phase_change (0006): a trigger, not an RPC, because
-- `p6_staff_update` (0037) is a plain client UPDATE through a column grant
-- (`hidden_at, hidden_reason, removed_at, removed_by`) — "an audited write"
-- has to hold regardless of which UPDATE statement makes it, and a trigger
-- is a property of the table rather than something a hand-rolled RPC could
-- be bypassed by if a second write path ever existed.
--
-- Two transitions on the SAME table, one trigger:
--   restored  — hidden_at goes from set to null (a moderator clearing a
--               takedown's instant hide, REQ-EVT-012).
--   removed   — removed_at goes from null to set (a moderator's outright
--               removal, REQ-EVT-014).
-- A photo hidden then also removed writes two rows across two UPDATEs, one
-- audit row per actual transition — never a single row conflating both.
--
-- Serves:  REQ-EVT-012, REQ-EVT-014
-- Cites:   0005 (public.write_audit) · 0037 (photos, p6_staff_update)
--
-- 03 §8.2 rows this adds:
--   | `POL-photos.restore.audited` | `hidden_at` going from set to null
--     writes one `audit_log` row naming the photo. |
--   | `POL-photos.removal.audited` | `removed_at` going from null to set
--     writes one `audit_log` row naming the photo and `removed_by`. |
create function public.photos_audit_staff_actions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.hidden_at is not null and new.hidden_at is null then
    perform public.write_audit(new.org_id, 'photo.restored', 'photo', new.id, jsonb_build_object('hidden_reason', old.hidden_reason), null);
  end if;
  if old.removed_at is null and new.removed_at is not null then
    perform public.write_audit(new.org_id, 'photo.removed', 'photo', new.id, null, jsonb_build_object('removed_by', new.removed_by));
  end if;
  return new;
end $$;
create trigger photos_audit_staff_actions after update of hidden_at, removed_at on public.photos
  for each row execute function public.photos_audit_staff_actions();

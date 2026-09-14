"use server";

import { updateMaterialSettings } from "@/lib/dal/materials";

// REQ-MAT-005/006 — a presenter or admin toggles `allow_download`/`phase`
// on a material they may manage. The RLS policy is the actual authority
// (materials_update_presenter/_admin, 0037); this action does not re-derive
// it — a member who is neither writes nothing and this returns `false`.
export async function saveMaterialSettings(
  locale: string,
  materialId: string,
  changes: { phase?: "before" | "after"; allowDownload?: boolean },
): Promise<{ ok: boolean }> {
  const ok = await updateMaterialSettings(locale, { materialId, ...changes });
  return { ok };
}

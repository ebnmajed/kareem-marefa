"use server";

import { revalidatePath } from "next/cache";
import { rescopeMaterial, updateMaterialSettings } from "@/lib/dal/materials";

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

// REQ-SES-018/DEC-121 — the scope chip. `rescopeMaterial()` (rescope_material(), proposed/
// content/0001) is the real authority; `revalidatePath` (not `router.refresh()`) matches
// `photos/actions.ts`/`tasks/actions.ts`'s own shape for a mutation invoked from a client
// component's transition, so the re-grouped slot lands without the caller doing anything more.
export async function rescopeMaterialAction(locale: string, sessionId: string, materialId: string, sessionDayId: string | null): Promise<{ error: string | null }> {
  try {
    await rescopeMaterial(locale, { materialId, sessionDayId });
    revalidatePath(`/${locale}/app/sessions/${sessionId}`);
    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "unknown_error" };
  }
}

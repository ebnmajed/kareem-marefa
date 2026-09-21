"use server";

import { revalidatePath } from "next/cache";
import { getMaterialDownloadUrl, rescopeMaterial, updateMaterialSettings } from "@/lib/dal/materials";

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

// REQ-PRO-004/wave 10 T1 — a proposal's own material has no viewer route to hang a download button
// off (`app/sessions/[id]/materials/[materialId]/actions.ts`'s own `requestMaterialDownload` lives
// under a route that assumes a session), so `ProposalMaterials` gets its own thin wrapper around the
// same, already-generic `getMaterialDownloadUrl(locale, materialId)` — it does not care whether the
// material belongs to a session or a proposal, and neither does this. A denial (RLS, or a version
// that never finished uploading) comes back as `null`, same contract as the session-side action.
export async function requestProposalMaterialDownload(locale: string, materialId: string): Promise<{ url: string | null }> {
  const url = await getMaterialDownloadUrl(locale, materialId);
  return { url };
}

"use server";

import { getMaterialDownloadUrl } from "@/lib/dal/materials";

// REQ-MAT-005: `allow_download` is enforced where the bytes are (03 §6) —
// this action never decides anything itself; it asks the DAL, which asks
// Storage, and a denial comes back as `null`. Small enough (a signed URL
// string) to be a Server Action rather than a Route Handler.
export async function requestMaterialDownload(locale: string, materialId: string): Promise<{ url: string | null }> {
  const url = await getMaterialDownloadUrl(locale, materialId);
  return { url };
}

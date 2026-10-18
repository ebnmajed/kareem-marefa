import "server-only";
import { z } from "zod";
import { getSessionState } from "@/lib/dal/session";
import { createServerClient } from "@/lib/supabase/server";

// A company's logo bytes, read AS THE VIEWER (DEC-298, `0230`; REQ-LDR-004, REQ-UIX-079). `company_logo()` answers
// only a member of the company's own org, and `design_assets_storage_read_company_logo` re-checks the same at the
// object — no `service_role` (invariant 7), no signed URL. Every refusal is null; the route makes it one 404.

const row = z.object({ storage_path: z.string().min(1), content_type: z.enum(["image/png", "image/jpeg", "image/webp"]) });

export async function readCompanyLogo(companyId: string, version: string): Promise<{ bytes: ArrayBuffer; contentType: string; current: boolean } | null> {
  if (!z.uuid().safeParse(companyId).success) return null;
  const state = await getSessionState();
  if (state.kind !== "member") return null;

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("company_logo", { p_company: companyId });
  if (error) return null;
  const parsed = row.safeParse(Array.isArray(data) ? data[0] : null);
  if (!parsed.success) return null;

  const { data: file, error: downloadError } = await supabase.storage.from("design-assets").download(parsed.data.storage_path);
  if (downloadError || !file) return null;
  // The path holds the asset id; the URL's `v` is that id when the link is current.
  return { bytes: await file.arrayBuffer(), contentType: parsed.data.content_type, current: version.length > 0 && parsed.data.storage_path.includes(version.toLowerCase()) };
}

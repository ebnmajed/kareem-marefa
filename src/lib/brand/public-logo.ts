import "server-only";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";

// An active org's logo, read with NO session — for a mail client. `0126`,
// REQ-NTF-014, REQ-DSG-021, DEC-161 (contract 9). The lead's, as custodian of
// `branding`.
//
// ★ The one DAL function in this folder that does not call `requireSession()`,
// for the reason `getPublicCardImage()` (`lib/dal/sessions.ts`) does not: the
// caller is a mail client or a link-preview proxy, which has no session to
// require. The authorisation is a POLICY evaluated by Postgres —
// `POL-storage.design_assets.public_logo` — not an `if` in this file, and the
// object is read as WHOEVER asked: no `service_role` (invariant 7), and no
// signed URL, which would be a broken image by the time the mail is opened.
//
// What comes back is a PNG or a JPEG, or nothing. A WebP logo is «nothing» on
// purpose (`0126`): Outlook's Word engine draws no WebP, and a design with no
// logo renders the org's name as a heading instead.

export type PublicLogoType = "image/png" | "image/jpeg";

const row = z.object({ storage_path: z.string().min(1), content_type: z.enum(["image/png", "image/jpeg"]) });

export async function getPublicOrgLogo(orgId: string): Promise<{ bytes: ArrayBuffer; contentType: PublicLogoType } | null> {
  // Shape before anything else: a malformed id is «no logo», not a 500 from
  // Postgres's uuid parser — and the same answer an unknown org gets.
  if (!z.uuid().safeParse(orgId).success) return null;

  const supabase = await createServerClient();
  const { data, error } = await supabase.rpc("org_public_logo", { p_org: orgId });
  if (error) return null;
  const parsed = row.safeParse(Array.isArray(data) ? data[0] : null);
  if (!parsed.success) return null;

  const { data: file, error: downloadError } = await supabase.storage.from("design-assets").download(parsed.data.storage_path);
  if (downloadError || !file) return null;
  return { bytes: await file.arrayBuffer(), contentType: parsed.data.content_type };
}

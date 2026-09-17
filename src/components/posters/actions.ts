"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requestExports } from "@/lib/dal/designer";
import { attachUploadedPoster, detachPoster, uploadPosterInput } from "@/lib/dal/posters";

// The picker's two writes — REQ-DSG-002, REQ-DSG-003, REQ-DSG-020, DEC-012,
// REQ-UIX-013.
//
// Both are reached only through a confirm that names the session, and both
// answer with a result the control acts on (toast, navigate) — never a
// redirect with a query string. Zod first; authority is the RPC's and the
// policy's, re-derived from the session.
//
// `"use server"` modules export async functions and types alone.

export type PosterActionResult = { status: "ok"; documentId: string | null } | { status: "invalid" } | { status: "not_authorized" };

const schedule = (locale: string, sessionId: string) => `/${locale}/app/admin/sessions/${sessionId}/schedule`;

/** «خصّص»: detach, one way, and hand back the document the studio opens. */
export async function customisePoster(locale: string, sessionId: string): Promise<PosterActionResult> {
  if (!z.uuid().safeParse(sessionId).success) return { status: "invalid" };
  const result = await detachPoster(locale, sessionId);
  if (result.status !== "ok") return result;
  revalidatePath(schedule(locale, sessionId));
  return { status: "ok", documentId: result.documentId };
}

/**
 * The third path, after the bytes were sniffed and measured by
 * `/api/designer/assets/complete`: the asset becomes the session's poster
 * document, detached from the start, and every variant is requested at once
 * — derived by cropping, never letterboxed (REQ-DSG-020, A32).
 */
export async function attachPosterUpload(locale: string, sessionId: string, assetId: string): Promise<PosterActionResult> {
  const parsed = uploadPosterInput.safeParse({ sessionId, assetId });
  if (!parsed.success) return { status: "invalid" };
  const attached = await attachUploadedPoster(locale, parsed.data);
  if (attached.status !== "ok") return attached;

  // Absolute, as the studio's own export request is: a QR or a font URL in
  // the render context resolves against it.
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const queued = await requestExports(locale, attached.documentId, `${proto}://${host}`);
  if ("status" in queued) return queued;

  revalidatePath(schedule(locale, sessionId));
  return { status: "ok", documentId: attached.documentId };
}

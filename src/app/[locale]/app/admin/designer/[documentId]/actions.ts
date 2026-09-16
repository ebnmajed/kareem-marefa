"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requestExports, retryExport } from "@/lib/dal/designer";
import type { ExportActionState } from "./state";

// SCR-057's export queue — REQ-DSG-011, REQ-DSG-012.
//
// Server Actions, unlike the autosave beside them, and the difference is the
// payload: these carry ids. The DOCUMENT never crosses an action boundary —
// that is what forced autosave onto a Route Handler (the 1 MB cap, `04`
// §4.2) — because `request_render()` reads the saved document itself. You
// export what is saved, which is also the only thing that could be correct.
//
// They answer with a state the button toasts rather than redirecting with a
// query string: the result is said where the admin pressed, and the queue
// below re-renders from `revalidatePath` (`16` §7.3).
//
// Bound in the page to their ids, they are what `useActionState` calls; the
// previous state and the (empty) form it appends are not needed, so they are
// not declared.
//
// `"use server"` modules export async functions and types alone.

async function originOf(): Promise<string> {
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host") ?? "localhost:3000";
  const proto = headerList.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

const id = z.uuid();
const scheme = z.enum(["light", "dark"]).nullable();

/** «اطلب التصدير» — every variant of the saved document, in the scheme the
 *  preview resolved, so the export is what the admin approved (DEC-017). */
export async function queueExports(
  locale: string,
  documentId: string,
  requestedScheme: string | null,
): Promise<ExportActionState> {
  const parsed = z.object({ documentId: id, scheme }).safeParse({ documentId, scheme: requestedScheme });
  if (!parsed.success) return { status: "invalid", at: Date.now() };

  const result = await requestExports(locale, parsed.data.documentId, await originOf(), { scheme: parsed.data.scheme });
  if ("status" in result) return { status: "not_authorized", at: Date.now() };
  revalidatePath(`/${locale}/app/admin/designer/${parsed.data.documentId}`);
  return { status: "queued", at: Date.now() };
}

export async function retryArtifact(locale: string, documentId: string, artifactId: string): Promise<ExportActionState> {
  const parsed = z.object({ documentId: id, artifactId: id }).safeParse({ documentId, artifactId });
  if (!parsed.success) return { status: "invalid", at: Date.now() };

  const result = await retryExport(locale, parsed.data.artifactId);
  if (result.status !== "ok") return { status: "not_authorized", at: Date.now() };
  revalidatePath(`/${locale}/app/admin/designer/${parsed.data.documentId}`);
  return { status: "retried", at: Date.now() };
}

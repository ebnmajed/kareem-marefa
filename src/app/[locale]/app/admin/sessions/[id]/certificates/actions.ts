"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  certificateDesignInput,
  redesignHeldCertificates,
  releaseCertificates,
  releaseInput,
  revokeCertificate,
  revokeInput,
  setCertificateDesign,
} from "@/lib/dal/certificates";
import { retryExport } from "@/lib/dal/designer";

// SCR-045's writes — REQ-CRT-004, REQ-CRT-011, REQ-DSG-031, DEC-128, DEC-148.
//
// Every one goes through a SECURITY DEFINER RPC that audits in the same
// transaction: there is no policy that could express «release» (it writes
// `issued_at` and `released_by` and calls `notify()`), which is why
// `certificates` has no update policy at all, and a design is written by
// `set_certificate_design()` alone.
//
// They answer with a result the calling control toasts, and revalidate the
// screen — never a redirect with a query string. Zod first.
//
// `"use server"` modules export async functions and types alone.

export type CertificateActionResult =
  { status: "ok"; count?: number } | { status: "locked" } | { status: "invalid" } | { status: "reason_required" } | { status: "not_authorized" };

const screen = (locale: string, sessionId: string) => `/${locale}/app/admin/sessions/${sessionId}/certificates`;

export async function saveCertificateDesign(locale: string, sessionId: string, kind: string, form: FormData): Promise<CertificateActionResult> {
  const parsed = certificateDesignInput.safeParse({ sessionId, kind, templateId: form.get("templateId"), scheme: form.get("scheme") });
  if (!parsed.success) return { status: "invalid" };
  const result = await setCertificateDesign(locale, parsed.data);
  if (result.status === "ok") revalidatePath(screen(locale, sessionId));
  return result;
}

export async function applyDesignToHeld(locale: string, sessionId: string, kind: string): Promise<CertificateActionResult> {
  const parsed = z.object({ sessionId: z.uuid(), kind: z.enum(["attendance", "presenter"]) }).safeParse({ sessionId, kind });
  if (!parsed.success) return { status: "invalid" };
  const result = await redesignHeldCertificates(locale, parsed.data.sessionId, parsed.data.kind);
  if (result.status === "ok") revalidatePath(screen(locale, sessionId));
  return result;
}

export async function releaseHeld(locale: string, sessionId: string, ids: string[]): Promise<CertificateActionResult> {
  const parsed = releaseInput.safeParse({ ids });
  if (!parsed.success || !z.uuid().safeParse(sessionId).success) return { status: "invalid" };
  const result = await releaseCertificates(locale, parsed.data);
  if (result.status !== "ok") return { status: "not_authorized" };
  revalidatePath(screen(locale, sessionId));
  return { status: "ok", count: result.count };
}

export async function revokeIssued(locale: string, sessionId: string, certificateId: string, form: FormData): Promise<CertificateActionResult> {
  // A missing or blank reason is the one invalid case worth its own message
  // (REQ-CRT-011) — «اكتب سبب الإلغاء», not «تعذّر تنفيذ الطلب».
  const parsed = revokeInput.safeParse({ id: certificateId, reason: form.get("reason")?.toString() ?? "" });
  if (!parsed.success) return { status: "reason_required" };
  const result = await revokeCertificate(locale, parsed.data);
  if (result.status !== "ok") return { status: result.status };
  revalidatePath(screen(locale, sessionId));
  return { status: "ok" };
}

export async function retryCertificateRender(locale: string, sessionId: string, artifactId: string): Promise<CertificateActionResult> {
  if (!z.uuid().safeParse(artifactId).success) return { status: "invalid" };
  const result = await retryExport(locale, artifactId);
  if (result.status !== "ok") return { status: "not_authorized" };
  revalidatePath(screen(locale, sessionId));
  return { status: "ok" };
}

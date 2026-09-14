"use server";

import { redirect } from "next/navigation";
import { releaseCertificates, releaseInput, revokeCertificate, revokeInput } from "@/lib/dal/certificates";

// SCR-045's two writes. `"use server"` modules export async functions and
// types alone — `npm run build` is the only gate that catches a constant
// export here, so nothing else lives in this file.
//
// Both go through a SECURITY DEFINER RPC that audits in the same
// transaction: there is no policy that could express «release» (it writes
// `issued_at` and `released_by` and calls `notify()`), which is why
// `certificates` has no update policy at all.

const screen = (sessionId: string) => `/ar/app/admin/sessions/${sessionId}/certificates`;

export async function release(formData: FormData) {
  const sessionId = formData.get("sessionId")?.toString() ?? "";
  const ids = formData.getAll("id").map((v) => v.toString());
  const parsed = releaseInput.safeParse({ ids });
  if (!parsed.success) redirect(`${screen(sessionId)}?error=invalid`);

  const result = await releaseCertificates("ar", parsed.data);
  if (result.status !== "ok") redirect(`${screen(sessionId)}?error=${result.status}`);
  redirect(`${screen(sessionId)}?released=${result.count}`);
}

export async function revoke(formData: FormData) {
  const sessionId = formData.get("sessionId")?.toString() ?? "";
  const parsed = revokeInput.safeParse({
    id: formData.get("id")?.toString(),
    reason: formData.get("reason")?.toString(),
  });
  // A missing or blank reason is the one invalid case worth its own message
  // (REQ-CRT-011) — «اكتب سبب الإلغاء», not «تعذّر تنفيذ الطلب».
  if (!parsed.success) redirect(`${screen(sessionId)}?error=reason_required`);

  const result = await revokeCertificate("ar", parsed.data);
  if (result.status !== "ok") redirect(`${screen(sessionId)}?error=${result.status}`);
  redirect(`${screen(sessionId)}?done=revoked`);
}

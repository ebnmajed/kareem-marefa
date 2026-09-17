// A failed send's reason, as an admin can act on it — REQ-NTF-008: «a bounce
// or failure is visible to the org admin, WITH THE REASON».
//
// The worker stores the provider's own words (`send_notification.ts`, «resend
// 422: {…}»), which is the evidence and stays on the screen beneath. This
// names the kind of failure above it: the admin's next step differs between a
// sending limit, a refused address and a provider that did not answer.
//
// No `"use client"`: pure, and read by both a server page and a client table.

export type DeliveryReason = "rateLimited" | "providerRefused" | "providerUnavailable" | "unreachable" | "other";

export function deliveryReason(raw: string | null): DeliveryReason | null {
  if (!raw) return null;
  const status = /^resend (\d{3})\b/i.exec(raw.trim());
  if (status) {
    const code = Number(status[1]);
    if (code === 429) return "rateLimited";
    if (code >= 500) return "providerUnavailable";
    if (code >= 400) return "providerRefused";
  }
  if (/ENOTFOUND|ECONNREFUSED|ECONNRESET|ETIMEDOUT|EAI_AGAIN|fetch failed|network/i.test(raw)) return "unreachable";
  return "other";
}

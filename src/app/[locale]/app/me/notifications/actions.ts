"use server";

import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { markAllRead, openNotification, preferenceInput, setPreference } from "@/lib/dal/notifications";

// Zod first, then the DAL (REQ-NFR-002). Authority is never in the form: the
// DAL writes the session's own rows, and `p3_self_*` plus the `enabled`
// column grant refuse everything else — a forged `category` reaches a check
// constraint, not another member's settings.
//
// ★ Bound to the real locale (`.bind(null, locale)`, `privacy/actions.ts`'s
// pattern) — every redirect here hard-coded `/ar/...` before, which sent an
// `/en` member's save, mark-read or mark-all-read back to the Arabic route.

function screen(locale: Locale): string {
  return `/${locale}/app/me/notifications`;
}

export async function savePreference(locale: Locale, formData: FormData) {
  const parsed = preferenceInput.safeParse({
    category: formData.get("category")?.toString() ?? "",
    channel: formData.get("channel")?.toString() ?? "",
    // The button carries the value it is switching TO, so a double submit is
    // idempotent rather than a toggle that races with itself.
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) redirect(`${screen(locale)}?error=1`);

  try {
    await setPreference(locale, parsed.data);
  } catch {
    redirect(`${screen(locale)}?error=1`);
  }
  redirect(`${screen(locale)}?saved=1#preferences`);
}

export async function markAllNotificationsRead(locale: Locale) {
  // ★ wave 20 (N14): a failure says so on the inbox rather than throwing to the boundary.
  try {
    await markAllRead(locale);
  } catch {
    redirect(`${screen(locale)}?error=inbox`);
  }
  redirect(screen(locale));
}

// ★ wave 20 (D7, DEC-218 §2.4) — one form per item: mark it read, then open its session or stay. The session comes
// from the row through the DAL, never from the form, so a forged id opens nothing. Works without JavaScript.
export async function openNotificationAction(locale: Locale, formData: FormData) {
  let sessionId: string | null = null;
  try {
    ({ sessionId } = await openNotification(locale, formData.get("id")?.toString() ?? ""));
  } catch {
    redirect(`${screen(locale)}?error=inbox`);
  }
  redirect(sessionId ? `/${locale}/app/sessions/${sessionId}` : screen(locale));
}

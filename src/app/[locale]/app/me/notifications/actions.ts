"use server";

import { redirect, unstable_rethrow } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { markAllRead, openNotification } from "@/lib/dal/notifications";

// The inbox's actions (REQ-NTF-006). Authority is never in the form: the DAL
// writes the session's own rows. ★ wave 20: preferences left this page for
// `/app/me/settings` (DEC-216 §5.13), and their action with them.
//
// ★ Bound to the real locale (`.bind(null, locale)`, `privacy/actions.ts`'s
// pattern) — every redirect here hard-coded `/ar/...` before, which sent an
// `/en` member's save, mark-read or mark-all-read back to the Arabic route.

function screen(locale: Locale): string {
  return `/${locale}/app/me/notifications`;
}

export async function markAllNotificationsRead(locale: Locale) {
  // ★ wave 20 (N14): a failure says so on the inbox rather than throwing to the boundary.
  try {
    await markAllRead(locale);
  } catch (e) {
    unstable_rethrow(e);
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
  } catch (e) {
    unstable_rethrow(e);
    redirect(`${screen(locale)}?error=inbox`);
  }
  redirect(sessionId ? `/${locale}/app/sessions/${sessionId}` : screen(locale));
}

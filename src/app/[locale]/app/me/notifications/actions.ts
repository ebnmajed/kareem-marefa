"use server";

import { redirect } from "next/navigation";
import type { Locale } from "@/i18n/routing";
import { markAllRead, markRead, preferenceInput, setPreference } from "@/lib/dal/notifications";

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

export async function markNotificationRead(locale: Locale, formData: FormData) {
  const id = formData.get("id")?.toString() ?? "";
  try {
    await markRead(locale, id);
  } catch {
    redirect(`${screen(locale)}?error=1`);
  }
  redirect(screen(locale));
}

export async function markAllNotificationsRead(locale: Locale) {
  await markAllRead(locale);
  redirect(screen(locale));
}

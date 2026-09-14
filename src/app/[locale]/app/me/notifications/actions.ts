"use server";

import { redirect } from "next/navigation";
import { markAllRead, markRead, preferenceInput, setPreference } from "@/lib/dal/notifications";

// Zod first, then the DAL (REQ-NFR-002). Authority is never in the form: the
// DAL writes the session's own rows, and `p3_self_*` plus the `enabled`
// column grant refuse everything else — a forged `category` reaches a check
// constraint, not another member's settings.

const SCREEN = "/ar/app/me/notifications";

export async function savePreference(formData: FormData) {
  const parsed = preferenceInput.safeParse({
    category: formData.get("category")?.toString() ?? "",
    channel: formData.get("channel")?.toString() ?? "",
    // The button carries the value it is switching TO, so a double submit is
    // idempotent rather than a toggle that races with itself.
    enabled: formData.get("enabled") === "on",
  });
  if (!parsed.success) redirect(`${SCREEN}?error=1`);

  try {
    await setPreference("ar", parsed.data);
  } catch {
    redirect(`${SCREEN}?error=1`);
  }
  redirect(`${SCREEN}?saved=1#preferences`);
}

export async function markNotificationRead(formData: FormData) {
  const id = formData.get("id")?.toString() ?? "";
  try {
    await markRead("ar", id);
  } catch {
    redirect(`${SCREEN}?error=1`);
  }
  redirect(SCREEN);
}

export async function markAllNotificationsRead() {
  await markAllRead("ar");
  redirect(SCREEN);
}

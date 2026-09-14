"use server";

import { redirect } from "next/navigation";
import { reminderScheduleInput, setReminderSchedule } from "@/lib/dal/notifications";

// REQ-ADM-016 / REQ-NTF-004. Saving the schedule is one UPDATE; the moving of
// every pending reminder is the `org_settings_reschedule` trigger
// (supabase/proposed/notify/0008), so it happens whatever writes the column.

const SCREEN = "/ar/app/admin/reminders";

const minutes = (value: string) =>
  value
    .split(",")
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((n) => Number.isFinite(n));

export async function saveReminderSchedule(formData: FormData) {
  const parsed = reminderScheduleInput.safeParse({
    offsetsMinutes: minutes(formData.get("offsets")?.toString() ?? ""),
    ratingPromptDelayMinutes: Number.parseInt(formData.get("promptDelay")?.toString() ?? "", 10),
  });
  if (!parsed.success) redirect(`${SCREEN}?error=1`);

  try {
    await setReminderSchedule("ar", parsed.data);
  } catch {
    redirect(`${SCREEN}?error=1`);
  }
  redirect(`${SCREEN}?saved=1`);
}

"use server";

import { revalidatePath } from "next/cache";
import { parseDuration } from "@/components/admin/duration";
import type { Locale } from "@/i18n/routing";
import { setReminderSchedule } from "@/lib/dal/notifications";
import { emptyFormState, formStateFrom, was, wasList, withErrors, withFormError } from "@/lib/form-state";
import { MAX_OFFSETS, OFFSET_MAX_MINUTES, OFFSET_MIN_MINUTES, PROMPT_MAX_MINUTES, offsetField, type RemindersState } from "./state";

// SCR-060's Server Action — REQ-ADM-016, REQ-NTF-004.
//
// Each rule the DAL's `reminderScheduleInput` enforces is said here first, AT
// THE ROW it concerns: a refusal that only says «every duration must be
// between five minutes and thirty days» leaves the admin to find which. A
// duplicate is refused rather than merged silently — the DAL would merge it,
// and the admin would see one reminder fewer than they typed.
//
// Saving is one UPDATE; moving every pending reminder is the
// `org_settings_reschedule` trigger's, whatever writes the column (`0040`).
export async function saveReminderSchedule(locale: Locale, previous: RemindersState, formData: FormData): Promise<RemindersState> {
  const captured = formStateFrom<string>(formData, {
    fields: ["promptAmount", "promptUnit"],
    lists: ["offsetKey", "offsetAmount", "offsetUnit"],
    previous,
  });
  const keys = wasList(captured, "offsetKey");
  const amounts = wasList(captured, "offsetAmount");
  const units = wasList(captured, "offsetUnit");

  const errors: Record<string, string> = {};
  const offsets: number[] = [];
  const seen = new Set<number>();
  keys.forEach((key, i) => {
    const parsed = parseDuration(amounts[i] ?? "", units[i] ?? "", "minutes");
    const field = offsetField(key);
    if (!parsed.ok) errors[field] = parsed.error === "required" ? "offsetRequired" : "offsetInvalid";
    else if (parsed.amount < OFFSET_MIN_MINUTES) errors[field] = parsed.amount === 0 ? "offsetInvalid" : "offsetTooShort";
    else if (parsed.amount > OFFSET_MAX_MINUTES) errors[field] = "offsetTooLong";
    else if (seen.has(parsed.amount)) errors[field] = "offsetDuplicate";
    else {
      seen.add(parsed.amount);
      offsets.push(parsed.amount);
    }
  });
  if (keys.length === 0) errors.offsets = "offsetsNone";
  if (keys.length > MAX_OFFSETS) errors.offsets = "offsetsTooMany";

  const prompt = parseDuration(was(captured, "promptAmount"), was(captured, "promptUnit"), "minutes");
  if (!prompt.ok) errors.prompt = prompt.error === "required" ? "promptRequired" : "promptInvalid";
  else if (prompt.amount > PROMPT_MAX_MINUTES) errors.prompt = "promptTooLong";

  if (Object.keys(errors).length > 0 || !prompt.ok) return { ...withErrors(captured, errors), saved: false };

  try {
    await setReminderSchedule(locale, { offsetsMinutes: offsets, ratingPromptDelayMinutes: prompt.amount });
  } catch {
    return { ...withFormError(captured, "failed"), saved: false };
  }
  revalidatePath(`/${locale}/app/admin/reminders`);
  return { ...emptyFormState<string>(), saved: true };
}

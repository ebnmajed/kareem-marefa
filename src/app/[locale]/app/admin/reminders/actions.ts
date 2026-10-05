"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseDuration } from "@/components/admin/duration";
import type { Locale } from "@/i18n/routing";
import { reminderScheduleInput, setReminderSchedule } from "@/lib/dal/notifications";
import { emptyFormState, formStateFrom, was, withErrors, withFormError } from "@/lib/form-state";
import { PROMPT_MAX_MINUTES, REMINDER_ROWS, inBand, sameOffsets, viewOf } from "./rows";
import { amountField, onField, unitField, type RemindersState } from "./state";

// SCR-060's Server Action — REQ-ADM-016, REQ-NTF-004, REQ-UIX-091, `DEC-232` §1.3 and §3.
//
// ★ Each refusal lands AT ITS ROW: a timing outside its row's band, a row switched on with no timing, a prompt past a
// week, and every row off (at least one reminder stays). Only then is anything sent.
// ★ A save that changes nothing sends nothing and answers «لم يتغيّر شيء» — the receipt is empty, not faked.
// ★ `opened` is the schedule the page showed. The DAL writes only while the stored row still equals it, so another
// admin's save in between is refused as stale, never overwritten (D-N4).
// Moving every pending reminder is `org_settings_reschedule`'s, whatever writes the column (`0040`).

const opened = z.object({ offsets: z.array(z.int()).max(6), prompt: z.int() });

const FIELDS = [...REMINDER_ROWS.flatMap((r) => [onField(r.key), amountField(r.key), unitField(r.key)]), "promptAmount", "promptUnit", "opened"];

export async function saveReminderSchedule(locale: Locale, previous: RemindersState, formData: FormData): Promise<RemindersState> {
  const captured = formStateFrom<string>(formData, { fields: FIELDS, previous });
  const refused = (errors: Record<string, string>): RemindersState => ({ ...withErrors(captured, errors), receipt: null });
  const failed = (key: string): RemindersState => ({ ...withFormError(captured, key), receipt: null });

  let before: z.infer<typeof opened>;
  try {
    before = opened.parse(JSON.parse(was(captured, "opened")));
  } catch (e) {
    unstable_rethrow(e);
    return failed("failed");
  }

  const errors: Record<string, string> = {};
  const offsets: number[] = [];
  for (const row of REMINDER_ROWS) {
    if (was(captured, onField(row.key)) !== "on") continue;
    const parsed = parseDuration(was(captured, amountField(row.key)), was(captured, unitField(row.key)), "minutes");
    if (!parsed.ok) errors[row.key] = parsed.error === "required" ? "timingRequired" : "timingInvalid";
    else if (!inBand(row.key, parsed.amount)) errors[row.key] = `band.${row.key}`;
    else offsets.push(parsed.amount);
  }
  // Nothing stored is hidden or dropped: the «other» offsets go back exactly as they were.
  offsets.push(...viewOf(before.offsets).others);
  if (offsets.length === 0 && Object.keys(errors).length === 0) errors.week = "noneOn";

  const prompt = parseDuration(was(captured, "promptAmount"), was(captured, "promptUnit"), "minutes");
  if (!prompt.ok) errors.prompt = prompt.error === "required" ? "promptRequired" : "promptInvalid";
  else if (prompt.amount > PROMPT_MAX_MINUTES) errors.prompt = "promptTooLong";

  if (Object.keys(errors).length > 0 || !prompt.ok) return refused(errors);

  if (sameOffsets(offsets, before.offsets) && prompt.amount === before.prompt) {
    return { ...emptyFormState<string>(), receipt: { at: null, wrote: [] } };
  }

  const input = reminderScheduleInput.safeParse({ offsetsMinutes: offsets, ratingPromptDelayMinutes: prompt.amount });
  if (!input.success) return failed("failed");
  try {
    const receipt = await setReminderSchedule(locale, input.data, { offsetsMinutes: before.offsets, ratingPromptDelayMinutes: before.prompt });
    revalidatePath(`/${locale}/app/admin/reminders`);
    return { ...emptyFormState<string>(), receipt };
  } catch (error) {
    unstable_rethrow(error);
    return failed(error instanceof Error && error.message === "stale" ? "stale" : "failed");
  }
}

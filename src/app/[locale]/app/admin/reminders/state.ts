import type { SaveReceipt } from "@/lib/dal/admin-settings";
import { emptyFormState, type FormState } from "@/lib/form-state";
import type { ReminderRowKey } from "./rows";

// A "use server" module may export async functions and nothing else, so the state lives here.
//
// `receipt` is the server's answer to a save (`DEC-232` §3.2): what the save wrote, read from the history rows it
// wrote. The form shows «حُفظ» or «لم يتغيّر شيء» from it and nothing else — never from having pressed the button.

export type RemindersState = FormState<string> & { receipt: SaveReceipt | null };
export const emptyRemindersState: RemindersState = { ...emptyFormState<string>(), receipt: null };

export const onField = (key: ReminderRowKey) => `${key}-on`;
export const amountField = (key: ReminderRowKey) => `${key}-amount`;
export const unitField = (key: ReminderRowKey) => `${key}-unit`;
/** A row's error key, and the id of its timing control (the summary's link focuses it). */
export const rowControlId = (key: ReminderRowKey) => `reminder-${key}`;
export const switchControlId = (key: ReminderRowKey) => `reminder-${key}-on`;
export const PROMPT_CONTROL_ID = "reminder-prompt";

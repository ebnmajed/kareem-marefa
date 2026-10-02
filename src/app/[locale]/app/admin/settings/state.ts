import type { SaveReceipt } from "@/lib/dal/admin-settings";
import { emptyFormState, type FormState } from "@/lib/form-state";

// A "use server" module may export async functions and nothing else, so the state lives here.
//
// `receipt` is the server's answer to a save (`DEC-232` §3.2) — what `save_org_settings()` wrote, read from the records
// its transaction wrote. «حُفظ» and «لم يتغيّر شيء» come from it and nothing else; the old `?saved=1` flag is gone
// (D-N5: typed into the URL, it said «saved» with no save).
//
// An error's value is a key under `settings.admin.errors`, optionally followed by `|` and JSON values for it —
// «range|{"min":1,"max":50}» — because a Server Action cannot render a message (`lib/form-state.ts`).

export type SettingsState = FormState<string> & { receipt: SaveReceipt | null };
export const emptySettingsState: SettingsState = { ...emptyFormState<string>(), receipt: null };

/** The control's id for each posted field — the error summary's link focuses it. */
export const controlId = (field: string) => `setting-${field}`;

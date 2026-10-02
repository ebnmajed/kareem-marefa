"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { SettingsSwitchState } from "@/components/ui";
import type { Locale } from "@/i18n/routing";
import { CATEGORIES, getPreferenceMatrix } from "@/lib/dal/notifications";
import { setLeaderboardOptOut } from "@/lib/dal/members";
import { emailMasterOn, masterCategories } from "@/components/settings/email-master";
import { writeEmail } from "@/components/settings/preference-writes";

// SCR-029's three switch actions — REQ-UIX-077, DEC-218 §2, DEC-219 §1. Each is bound to the locale at the page and
// handed to `ui/settings-group` as its `SettingsSwitchAction` (DEC-159: a bound "use server" export, never a closure).
//
// Zod first (REQ-NFR-002). Authority is never in the form: the DAL writes the session's own rows, and a category is
// accepted only if the member's own matrix offers it — so a member cannot write `admin_queue`, nor anyone a fixed
// category, whatever the form says. A switch posts "on" when checked and nothing when not.

const categoryInput = z.object({ category: z.enum(CATEGORIES), enabled: z.boolean() });
const screen = (locale: Locale) => `/${locale}/app/me/settings`;
/** The member's rows, or null when they cannot be read — a failed read is a refused save, never a thrown page. */
const readRows = (locale: Locale) => getPreferenceMatrix(locale).then((m) => m.rows, () => null);

/** One category's email switch: `email = enabled`, `in_app = true` (P8, DEC-218 §2.1). */
export async function saveCategory(locale: Locale, previous: SettingsSwitchState, formData: FormData): Promise<SettingsSwitchState> {
  const parsed = categoryInput.safeParse({ category: formData.get("category")?.toString(), enabled: formData.get("enabled") === "on" });
  if (!parsed.success) return { checked: previous.checked, failed: true };
  const rows = await readRows(locale);
  if (!rows) return { checked: previous.checked, failed: true };
  const row = masterCategories(rows).find((r) => r.category === parsed.data.category);
  if (!row) return { checked: previous.checked, failed: true };
  if (!(await writeEmail(locale, [row], parsed.data.enabled))) return { checked: previous.checked, failed: true };
  revalidatePath(screen(locale));
  return { checked: parsed.data.enabled, failed: false };
}

/**
 * «إشعارات البريد» (DEC-219 §1): every optional category the member may hold, at once. ★ Switching it ON turns back on
 * the categories the member had silenced — the owner's accepted trade, not a bug (M5). A failure reverts what it wrote
 * and the switch shows the state re-derived from a fresh read (M4).
 */
export async function setEmailMaster(locale: Locale, previous: SettingsSwitchState, formData: FormData): Promise<SettingsSwitchState> {
  const enabled = z.boolean().parse(formData.get("enabled") === "on");
  const rows = await readRows(locale);
  if (!rows) return { checked: previous.checked, failed: true };
  if (!(await writeEmail(locale, masterCategories(rows), enabled))) {
    const fresh = await readRows(locale);
    return { checked: fresh ? emailMasterOn(fresh) : previous.checked, failed: true };
  }
  revalidatePath(screen(locale));
  return { checked: enabled, failed: false };
}

/** «الظهور في لوحات الصدارة» — on is NOT opted out (O1, REQ-LDR-008), through the one-column writer (27afbb3e). */
export async function saveVisibility(locale: Locale, previous: SettingsSwitchState, formData: FormData): Promise<SettingsSwitchState> {
  const visible = z.boolean().parse(formData.get("enabled") === "on");
  try {
    await setLeaderboardOptOut(locale, !visible);
  } catch {
    return { checked: previous.checked, failed: true };
  }
  revalidatePath(screen(locale));
  return { checked: visible, failed: false };
}

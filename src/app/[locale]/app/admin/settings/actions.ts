"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import type { Locale } from "@/i18n/routing";
import { saveOrgSettings, settingsFieldSchemas, type OrgSettingsView, type SettingsField, type SettingsValue } from "@/lib/dal/admin-settings";
import { emptyFormState, formStateFrom, was, wasList, withErrors, withFormError } from "@/lib/form-state";
import { BOUNDS, DOMAIN_RE, FORM_FIELDS, NUMBER_FIELDS, parseDomains } from "./fields";
import type { SettingsState } from "./state";

// SCR-063's Server Action — REQ-UIX-102, REQ-UIX-091, REQ-TEN-008, REQ-TEN-007, `DEC-232` §3 and §5.1.
//
// ★ ONLY WHAT CHANGED. Each field is compared with the value the page opened with (`opened`); an unchanged field is
// neither validated nor sent, so a save never rewrites another admin's change to a field this admin did not touch, and
// the history names only what this admin changed (D-N4). `expected` carries the opened values of the changed fields, and
// the database refuses the save as stale if any of them moved meanwhile.
// ★ Every refusal lands at its field. A save that changes nothing sends nothing and answers an empty receipt.
// ★ The time zone must be one this runtime knows (D-N3): an unknown zone breaks every date the org formats.

const opened = z.object({
  view: z.record(z.string(), z.unknown()),
});

const errorWith = (key: string, values: Record<string, string | number>) => `${key}|${JSON.stringify(values)}`;

export async function saveSettings(locale: Locale, previous: SettingsState, formData: FormData): Promise<SettingsState> {
  const captured = formStateFrom<string>(formData, { fields: [...FORM_FIELDS, "addDomains", "opened"], lists: ["removeDomain"], previous });
  const refused = (errors: Record<string, string>): SettingsState => ({ ...withErrors(captured, errors), receipt: null });
  const failed = (key: string): SettingsState => ({ ...withFormError(captured, key), receipt: null });

  let view: OrgSettingsView;
  try {
    view = opened.parse(JSON.parse(was(captured, "opened"))).view as unknown as OrgSettingsView;
  } catch (e) {
    unstable_rethrow(e);
    return failed("failed");
  }

  const errors: Record<string, string> = {};
  const changes: Partial<Record<SettingsField, SettingsValue>> = {};
  const expected: Partial<Record<SettingsField, SettingsValue>> = {};
  let name: { next: string; expected: string } | undefined;

  for (const field of FORM_FIELDS) {
    const raw = was(captured, field);
    if (field === "name") {
      const next = raw.trim();
      if (next === view.name) continue;
      const [min, max] = BOUNDS.name!;
      if (next.length < min || next.length > max) errors.name = errorWith("range", { min, max });
      else name = { next, expected: view.name };
      continue;
    }

    let value: SettingsValue;
    if (field === "allowJpegExport") value = raw === "on";
    else if (field === "emailFromName" || field === "emailReplyTo") value = raw.trim() === "" ? null : raw.trim();
    else if (NUMBER_FIELDS.includes(field)) {
      const text = raw.trim();
      // ★ wave 27 (REQ-CHK-019): the rotation alone may be empty — the form posts it empty when «لا يتغيّر» is on.
      if (text === "" && field === "checkInRotationSeconds") value = null;
      else if (text === "") {
        errors[field] = "required";
        continue;
      } else if (!/^\d+$/.test(text)) {
        errors[field] = "number";
        continue;
      } else value = Number(text);
    } else value = raw;

    if (value === view[field]) continue;

    const bounds = BOUNDS[field];
    if (bounds && typeof value === "number" && (value < bounds[0] || value > bounds[1])) {
      errors[field] = errorWith("range", { min: bounds[0], max: bounds[1] });
      continue;
    }
    if (field === "timeZone" && !Intl.supportedValuesOf("timeZone").includes(String(value))) {
      errors[field] = "timeZone";
      continue;
    }
    if (!settingsFieldSchemas[field].safeParse(value).success) {
      errors[field] = field === "companyMetric" ? "metric" : field === "emailFromName" ? "emailFromName" : field === "emailReplyTo" ? "emailReplyTo" : "number";
      continue;
    }
    changes[field] = value;
    expected[field] = view[field];
  }

  const known = new Map(view.domains.map((d) => [d.id, d.domain]));
  const removeDomains = wasList(captured, "removeDomain").filter((id) => known.has(id));
  const keptDomains = view.domains.filter((d) => !removeDomains.includes(d.id)).map((d) => d.domain);
  const addDomains: string[] = [];
  for (const domain of parseDomains(was(captured, "addDomains"))) {
    if (!DOMAIN_RE.test(domain)) errors.addDomains ??= errorWith("domainInvalid", { domain });
    else if (keptDomains.includes(domain)) errors.addDomains ??= errorWith("domainTaken", { domain });
    else addDomains.push(domain);
  }
  if (keptDomains.length + addDomains.length === 0) errors.domains = "domainLast";

  if (Object.keys(errors).length > 0) return refused(errors);
  if (Object.keys(changes).length === 0 && !name && addDomains.length === 0 && removeDomains.length === 0) {
    return { ...emptyFormState<string>(), receipt: { at: null, wrote: [] } };
  }

  const outcome = await saveOrgSettings(locale, { changes, expected, name, addDomains, removeDomains });
  if (!outcome.ok) {
    if (outcome.error === "stale") return refused(Object.fromEntries((outcome.fields ?? ["name"]).map((f) => [f, "stale"])));
    if (outcome.error === "domain_last") return refused({ domains: "domainLast" });
    return failed("failed");
  }
  revalidatePath(`/${locale}/app/admin/settings`);
  return { ...emptyFormState<string>(), receipt: outcome.receipt };
}

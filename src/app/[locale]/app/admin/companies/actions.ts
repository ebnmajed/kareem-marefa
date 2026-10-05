"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { companyInput, saveCompanyWithDomains, setCompanyActive } from "@/lib/dal/admin-lists";
import type { Locale } from "@/i18n/routing";
import { formStateFrom, was, withErrors, withFormError, zodErrors } from "@/lib/form-state";
import { COMPANY_FIELDS, NO_TEAM_COLOUR, domainLines, emptyCompanyState, type CompanyField, type CompanyState } from "./state";
import { TEAM_COLOUR_HEX, TEAM_COLOUR_NAMES } from "./team-colours";

// SCR-048's Server Actions (REQ-ADM-008, REQ-UIX-095, REQ-UIX-043). `p2_admin_insert` / `p2_admin_update` on
// `companies` (0004) say who may write; there is no delete grant. The audit rows — `company.created` (with the colour),
// `company.changed`, `company.deactivated` / `company.reactivated` and `company.team_color_changed` (0161) — are the
// database's triggers' (contract 3).
//
// ★ The colour posts one of the seven NAMES or «none», never a hex the client invented: checked against the closed enum
// here, mapped to `#rrggbb` after, and checked again by the column's own constraint (`0160`) — two boundaries agreeing
// on one shape. ★ Every action answers with what it WROTE (`DEC-232` §3.1).
//
// ★ wave 27 (`DEC-254` §2.7, `REQ-ADM-024`, `DEC-255` §4): the company, its domains and the members they place are ONE
// call — `save_company()`, a definer — in two steps. The first submit is a dry run; if it moves nobody the action
// confirms at once, otherwise it returns the two counts and the form asks. The confirm posts the dry run's token; the
// database re-derives under the org's lock and answers «changed» with new numbers if anyone arrived in between. Nothing
// here decides who moves.

function errorKey(field: CompanyField, _code: string, empty: boolean): string {
  if (field === "teamColour") return "teamColourInvalid";
  if (field === "domains") return "domainsInvalid";
  return empty ? "nameRequired" : "nameTooLong";
}

const teamColourSchema = z.enum([...TEAM_COLOUR_NAMES, NO_TEAM_COLOUR]);

/** Create (`companyId` null) or edit — name, colour and domains in one save, asked first if it moves anyone. */
export async function saveCompany(locale: Locale, companyId: string | null, prev: CompanyState, formData: FormData): Promise<CompanyState> {
  const fail = (state: CompanyState, key = "failed"): CompanyState => ({ ...state, ...withFormError(state, key), saved: false, confirm: null });
  if (companyId !== null && !z.uuid().safeParse(companyId).success) return fail({ ...prev });
  const captured = { ...emptyCompanyState, ...formStateFrom<CompanyField>(formData, { fields: COMPANY_FIELDS, previous: prev }) };
  const raw = { name: was(captured, "name") };
  const parsed = companyInput.safeParse(raw);
  // A form that posts no colour at all (an older page still open across a deploy) means «بلا لون».
  const colour = teamColourSchema.safeParse(was(captured, "teamColour") || NO_TEAM_COLOUR);
  if (!parsed.success || !colour.success) {
    const errors = parsed.success ? {} : zodErrors<CompanyField>(parsed.error, errorKey, raw);
    return { ...captured, ...withErrors(captured, colour.success ? errors : { ...errors, teamColour: errorKey("teamColour", "invalid_value", false) }), saved: false };
  }

  const hex = colour.data === NO_TEAM_COLOUR ? null : TEAM_COLOUR_HEX[colour.data];
  const input = { companyId, name: parsed.data.name, teamColorHex: hex, domains: domainLines(was(captured, "domains")) };
  const confirming = formData.get("confirm") === "1";
  const token = formData.get("token")?.toString() || null;

  let result = await saveCompanyWithDomains(locale, { ...input, confirm: confirming, expected: confirming ? token : null });
  // A dry run that moves nobody saves without asking (`REQ-ADM-024`). Should someone arrive before this confirm, the
  // database answers «changed» and the form asks after all.
  if (result.status === "preview" && result.moving === 0) {
    result = await saveCompanyWithDomains(locale, { ...input, confirm: true, expected: result.token });
  }

  switch (result.status) {
    case "invalid":
      return { ...captured, ...withErrors(captured, { domains: "domainsInvalid" }), saved: false, domainErrors: result.errors };
    case "preview":
    case "changed":
      // The attempt moves so the uncontrolled fields echo what was typed while the form asks (`hasAttempted`).
      return {
        ...captured,
        ...withErrors(captured, {}),
        saved: false,
        confirm: { moving: result.moving, held: result.held, token: result.token, companyName: result.companyName, changed: result.status === "changed" },
      };
    case "saved":
      revalidatePath(`/${locale}/app/admin/companies`);
      revalidatePath(`/${locale}/app/admin/members`);
      return { ...emptyCompanyState, saved: true };
    default:
      return fail(captured);
  }
}

export async function setCompanyActiveAction(locale: Locale, companyId: string, active: boolean): Promise<{ ok: boolean }> {
  if (!z.uuid().safeParse(companyId).success) return { ok: false };
  const result = await setCompanyActive(locale, companyId, active);
  if (result.ok) revalidatePath(`/${locale}/app/admin/companies`);
  return result;
}

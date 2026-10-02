"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { savedState } from "@/components/admin/saved-form-state";
import { companyInput, createCompany, setCompanyActive, updateCompany } from "@/lib/dal/admin-lists";
import type { Locale } from "@/i18n/routing";
import { formStateFrom, was, withErrors, withFormError, zodErrors } from "@/lib/form-state";
import { COMPANY_FIELDS, NO_TEAM_COLOUR, type CompanyField, type CompanyState } from "./state";
import { TEAM_COLOUR_HEX, TEAM_COLOUR_NAMES } from "./team-colours";

// SCR-048's Server Actions (REQ-ADM-008, REQ-UIX-095, REQ-UIX-043). `p2_admin_insert` / `p2_admin_update` on
// `companies` (0004) say who may write; there is no delete grant. The audit rows — `company.created` (with the colour),
// `company.changed`, `company.deactivated` / `company.reactivated` and `company.team_color_changed` (0161) — are the
// database's triggers' (contract 3).
//
// ★ The colour posts one of the seven NAMES or «none», never a hex the client invented: checked against the closed enum
// here, mapped to `#rrggbb` after, and checked again by the column's own constraint (`0160`) — two boundaries agreeing
// on one shape. ★ Every action answers with what it WROTE (`DEC-232` §3.1).

function errorKey(field: CompanyField, _code: string, empty: boolean): string {
  if (field === "teamColour") return "teamColourInvalid";
  return empty ? "nameRequired" : "nameTooLong";
}

const teamColourSchema = z.enum([...TEAM_COLOUR_NAMES, NO_TEAM_COLOUR]);

/** Create (`companyId` null) or edit — name and colour in one save. */
export async function saveCompany(locale: Locale, companyId: string | null, prev: CompanyState, formData: FormData): Promise<CompanyState> {
  if (companyId !== null && !z.uuid().safeParse(companyId).success) return { ...withFormError(prev, "failed"), saved: false };
  const captured = formStateFrom<CompanyField>(formData, { fields: COMPANY_FIELDS, previous: prev });
  const raw = { name: was(captured, "name") };
  const parsed = companyInput.safeParse(raw);
  // A form that posts no colour at all (an older page still open across a deploy) means «بلا لون».
  const colour = teamColourSchema.safeParse(was(captured, "teamColour") || NO_TEAM_COLOUR);
  if (!parsed.success || !colour.success) {
    const errors = parsed.success ? {} : zodErrors<CompanyField>(parsed.error, errorKey, raw);
    return { ...withErrors(captured, colour.success ? errors : { ...errors, teamColour: errorKey("teamColour", "invalid_value", false) }), saved: false };
  }

  const hex = colour.data === NO_TEAM_COLOUR ? null : TEAM_COLOUR_HEX[colour.data];
  const result = companyId ? await updateCompany(locale, companyId, parsed.data, hex) : await createCompany(locale, parsed.data, hex);
  if (!result.ok) return { ...withFormError(captured, "failed"), saved: false };
  revalidatePath(`/${locale}/app/admin/companies`);
  return savedState<CompanyField>();
}

export async function setCompanyActiveAction(locale: Locale, companyId: string, active: boolean): Promise<{ ok: boolean }> {
  if (!z.uuid().safeParse(companyId).success) return { ok: false };
  const result = await setCompanyActive(locale, companyId, active);
  if (result.ok) revalidatePath(`/${locale}/app/admin/companies`);
  return result;
}

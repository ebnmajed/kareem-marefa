"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { companyInput, createCompany, setCompanyActive, setCompanyTeamColor } from "@/lib/dal/admin-lists";
import type { Locale } from "@/i18n/routing";
import { emptyFormState, formStateFrom, was, withErrors, withFormError, zodErrors } from "@/lib/form-state";
import { COMPANY_FIELDS, NO_TEAM_COLOUR, type CompanyField, type CompanyState } from "./state";
import { TEAM_COLOUR_HEX, TEAM_COLOUR_NAMES } from "./team-colours";

// SCR-048's Server Actions (REQ-ADM-008). Same reasoning as
// `admin/categories/actions.ts` and the inherited `admin/venues/actions.ts`:
// `p2_admin_insert`/`p2_admin_update` on `companies` (0004) already say who
// may write, so no RPC; no delete action, since there is no delete grant.

function errorKey(field: CompanyField, _code: string, empty: boolean): string {
  if (field === "teamColour") return "teamColourInvalid";
  return empty ? "nameRequired" : "nameTooLong";
}

// ★ wave 16 (DEC-195 §3, REQ-UIX-043): the add form posts one of the seven
// NAMES or «none» — never a hex. Checked against the closed enum here, turned
// into `#rrggbb` only after, as the per-row menu does below.
const addTeamColourSchema = z.enum([...TEAM_COLOUR_NAMES, NO_TEAM_COLOUR]);

export async function addCompany(locale: Locale, prev: CompanyState, formData: FormData): Promise<CompanyState> {
  const captured = formStateFrom<CompanyField>(formData, { fields: COMPANY_FIELDS, previous: prev });
  const raw = { name: was(captured, "name") };
  const parsed = companyInput.safeParse(raw);
  // A form that posts no colour at all (an older page still open across a
  // deploy) means «بلا لون», the column's default.
  const colour = addTeamColourSchema.safeParse(was(captured, "teamColour") || NO_TEAM_COLOUR);
  if (!parsed.success || !colour.success) {
    const errors = parsed.success ? {} : zodErrors<CompanyField>(parsed.error, errorKey, raw);
    return withErrors(captured, colour.success ? errors : { ...errors, teamColour: errorKey("teamColour", "invalid_value", false) });
  }

  try {
    await createCompany(locale, parsed.data, colour.data === NO_TEAM_COLOUR ? null : TEAM_COLOUR_HEX[colour.data]);
  } catch {
    return withFormError(captured, "failed");
  }
  revalidatePath(`/${locale}/app/admin/companies`);
  return emptyFormState<CompanyField>();
}

export async function toggleCompany(locale: Locale, companyId: string, active: boolean): Promise<void> {
  if (!z.uuid().safeParse(companyId).success) return;
  await setCompanyActive(locale, companyId, active);
  revalidatePath(`/${locale}/app/admin/companies`);
}

// «بلا لون» posts `null`; every other choice posts one of the seven NAMES
// (`REQ-UIX-043`, DEC-186 §8) — never a hex the client invented. The name
// is validated here, against the closed enum, and only then turned into the
// `#rrggbb` the database's own check constraint (`0160`) also enforces —
// two independent boundaries agreeing on one shape, neither trusting the
// other alone.
const teamColourNameSchema = z.enum(TEAM_COLOUR_NAMES).nullable();

export async function setCompanyTeamColour(locale: Locale, companyId: string, name: string | null): Promise<void> {
  if (!z.uuid().safeParse(companyId).success) return;
  const parsed = teamColourNameSchema.safeParse(name);
  if (!parsed.success) return;
  await setCompanyTeamColor(locale, companyId, parsed.data === null ? null : TEAM_COLOUR_HEX[parsed.data]);
  revalidatePath(`/${locale}/app/admin/companies`);
}

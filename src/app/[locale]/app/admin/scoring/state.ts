import type { SaveReceipt } from "@/lib/dal/admin-settings";
import { emptyFormState, type FormState } from "@/lib/form-state";

// SCR-053's form state and field names — a "use server" module exports async functions alone, so they live here.
//
// `receipt` is the server's answer to a save (`DEC-232` §3.2): the history rows the save wrote. The page says «حُفظ» or
// «لم يتغيّر شيء» from it and from nothing else — never from having pressed the button.

export type CatalogueState = FormState<string> & { receipt: SaveReceipt | null };
export const emptyCatalogueState: CatalogueState = { ...emptyFormState<string>(), receipt: null };

/** A catalogue rule as edit mode opened it — its version is the stale check (`DEC-232` §3.3). */
export interface OpenedRule {
  id: string;
  actionKey: string;
  version: number;
  penalty: boolean;
}
export interface OpenedCompanyRule {
  id: string;
  actionKey: "company_hosting" | "company_attendance_pct" | "company_presenting_pct";
  version: number;
}
export interface Opened {
  rules: OpenedRule[];
  company: OpenedCompanyRule[];
}

export const RULE_FIELDS = ["points", "cap", "cooldownAmount", "cooldownUnit", "enabled", "reason"] as const;
export const COMPANY_FIELDS = ["points", "perPercent", "capPoints", "minActive", "enabled"] as const;

/** A posted field's name — and, for the inputs, its control's id (the error summary's link focuses it). */
export const ruleField = (id: string, field: (typeof RULE_FIELDS)[number]) => `rule-${id}-${field}`;
export const companyField = (id: string, field: (typeof COMPANY_FIELDS)[number]) => `company-${id}-${field}`;

/** Cooldowns are typed in these units and stored in seconds. */
export const COOLDOWN_UNITS = ["seconds", "minutes", "hours", "days"] as const;


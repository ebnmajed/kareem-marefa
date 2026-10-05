"use server";

import { unstable_rethrow } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseDuration } from "@/components/admin/duration";
import { savedState, type SavedFormState } from "@/components/admin/saved-form-state";
import type { Locale } from "@/i18n/routing";
import { emptyFormState, formStateFrom, was, withErrors, withFormError } from "@/lib/form-state";
import { catalogueSaveInput, manualAdjustmentInput, saveScoringCatalogue, submitManualAdjustment } from "@/lib/dal/scoring-admin";
import { COMPANY_FIELDS, RULE_FIELDS, companyField, ruleField, type CatalogueState } from "./state";

// SCR-053's Server Actions — REQ-UIX-100, REQ-UIX-091, REQ-PTS-004 … 010, `DEC-232` §3.
//
// ★ ONE SAVE IS ONE WRITE: every rule and company rule edit mode shows goes to `save_scoring_catalogue()` in one call,
// which writes only what changed, in one transaction, and answers with the history rows it wrote. «حُفظ» and «لم
// يتغيّر شيء» are read from that answer (`receipt`), never from having pressed the button.
// ★ Each refusal lands AT ITS FIELD, and nothing is sent until every field parses.
// ★ `opened` carries the versions edit mode was opened at: another admin's save in between is refused as stale.
// Shape is checked here; authority is the database's — the function is invoker, so `0027`'s and `0081`'s grants and
// `p2_admin_update` decide, and `adjust_points_manually()`'s `assert_fresh_admin()` for the adjustment.

const SCREEN = (locale: Locale) => `/${locale}/app/admin/scoring`;

const opened = z.object({
  rules: z.array(z.object({ id: z.uuid(), actionKey: z.string(), version: z.int(), penalty: z.boolean() })).max(50),
  company: z.array(z.object({ id: z.uuid(), actionKey: z.enum(["company_hosting", "company_attendance_pct", "company_presenting_pct"]), version: z.int() })).max(3),
});

function whole(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= min && value <= max ? value : null;
}

export async function saveCatalogue(locale: Locale, previous: CatalogueState, formData: FormData): Promise<CatalogueState> {
  let before: z.infer<typeof opened>;
  try {
    before = opened.parse(JSON.parse(String(formData.get("opened") ?? "")));
  } catch (e) {
    unstable_rethrow(e);
    return { ...withFormError(emptyFormState<string>(), "failed"), receipt: null };
  }
  const fields = [
    ...before.rules.flatMap((r) => RULE_FIELDS.map((f) => ruleField(r.id, f))),
    ...before.company.flatMap((r) => COMPANY_FIELDS.map((f) => companyField(r.id, f))),
  ];
  const captured = formStateFrom<string>(formData, { fields, previous });
  const errors: Record<string, string> = {};

  const rules = before.rules.map((r) => {
    const f = (field: (typeof RULE_FIELDS)[number]) => was(captured, ruleField(r.id, field));
    const points = whole(f("points"), 0, 1000);
    if (f("points").trim() === "") errors[ruleField(r.id, "points")] = "pointsRequired";
    else if (points === null) errors[ruleField(r.id, "points")] = "pointsRange";
    const capRaw = f("cap").trim();
    const cap = capRaw === "" ? null : whole(capRaw, 1, 1000);
    if (capRaw !== "" && cap === null) errors[ruleField(r.id, "cap")] = "capInvalid";
    let cooldown: number | null = null;
    if (f("cooldownAmount").trim() !== "") {
      const parsed = parseDuration(f("cooldownAmount"), f("cooldownUnit"), "seconds");
      if (!parsed.ok) errors[ruleField(r.id, "cooldownAmount")] = "cooldownInvalid";
      else if (parsed.amount > 31536000) errors[ruleField(r.id, "cooldownAmount")] = "cooldownRange";
      else cooldown = parsed.amount === 0 ? null : parsed.amount;
    }
    const reason = f("reason").trim();
    if (reason === "") errors[ruleField(r.id, "reason")] = "reasonRequired";
    else if (reason.length > 200) errors[ruleField(r.id, "reason")] = "reasonTooLong";
    return {
      id: r.id,
      version: r.version,
      // A deduction is typed as its COST — a positive number — and stored negative (REQ-PTS-008).
      points: r.penalty ? -(points ?? 0) : (points ?? 0),
      enabled: f("enabled") === "on",
      cap_per_session: cap,
      cooldown_seconds: cooldown,
      reason_ar: reason,
    };
  });

  const company = before.company.map((r) => {
    const f = (field: (typeof COMPANY_FIELDS)[number]) => was(captured, companyField(r.id, field));
    const enabled = f("enabled") === "on";
    if (r.actionKey === "company_hosting") {
      const points = whole(f("points"), 0, 10000);
      if (points === null) errors[companyField(r.id, "points")] = f("points").trim() === "" ? "pointsRequired" : "companyPointsInvalid";
      return { id: r.id, version: r.version, enabled, points, points_per_percent: null, cap_points: null, min_active_members: null };
    }
    const perRaw = f("perPercent").trim();
    if (perRaw === "") errors[companyField(r.id, "perPercent")] = "perPercentRequired";
    else if (!/^\d+(\.\d{1,2})?$/.test(perRaw) || Number(perRaw) > 100) errors[companyField(r.id, "perPercent")] = "perPercentInvalid";
    const cap = whole(f("capPoints"), 1, 10000);
    if (cap === null) errors[companyField(r.id, "capPoints")] = f("capPoints").trim() === "" ? "capPointsRequired" : "capPointsInvalid";
    const min = whole(f("minActive"), 1, 1000);
    if (min === null) errors[companyField(r.id, "minActive")] = f("minActive").trim() === "" ? "minActiveRequired" : "minActiveInvalid";
    return { id: r.id, version: r.version, enabled, points: null, points_per_percent: Number(perRaw), cap_points: cap, min_active_members: min };
  });

  if (Object.keys(errors).length > 0) return { ...withErrors(captured, errors), receipt: null };

  const input = catalogueSaveInput.safeParse({ rules, company });
  if (!input.success) return { ...withFormError(captured, "failed"), receipt: null };
  try {
    const receipt = await saveScoringCatalogue(locale, input.data);
    revalidatePath(SCREEN(locale));
    return { ...emptyFormState<string>(), receipt };
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "";
    const sign = message.match(/^sign_mismatch:(.+)$/);
    if (sign) {
      const rule = before.rules.find((r) => r.actionKey === sign[1]);
      if (rule) return { ...withErrors(captured, { [ruleField(rule.id, "points")]: "signMismatch" }), receipt: null };
    }
    return { ...withFormError(captured, message === "stale" ? "stale" : message === "not_found" ? "notFound" : "failed"), receipt: null };
  }
}

export async function saveManualAdjustment(locale: Locale, previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  const captured = formStateFrom<string>(formData, { fields: ["memberId", "direction", "amount", "reason"], previous });
  const errors: Record<string, string> = {};

  const memberId = was(captured, "memberId");
  if (memberId === "") errors.memberId = "memberRequired";
  const amountRaw = was(captured, "amount").trim();
  const amount = whole(amountRaw, 1, 100000);
  if (amountRaw === "") errors.amount = "amountRequired";
  else if (amount === null) errors.amount = "amountInvalid";
  const reason = was(captured, "reason").trim();
  if (reason === "") errors.reason = "reasonRequired";
  else if (reason.length > 300) errors.reason = "reasonTooLong";

  if (Object.keys(errors).length > 0) return { ...withErrors(captured, errors), saved: false };

  const parsed = manualAdjustmentInput.safeParse({
    memberId,
    amount: was(captured, "direction") === "deduct" ? -amount! : amount,
    reason,
  });
  if (!parsed.success) return { ...withErrors(captured, { memberId: "memberNotFound" }), saved: false };
  try {
    await submitManualAdjustment(locale, parsed.data);
  } catch (error) {
    unstable_rethrow(error);
    const message = error instanceof Error ? error.message : "";
    if (message === "member_not_found") return { ...withErrors(captured, { memberId: "memberNotFound" }), saved: false };
    if (message === "reason_required") return { ...withErrors(captured, { reason: "reasonRequired" }), saved: false };
    if (message === "amount_required") return { ...withErrors(captured, { amount: "amountRequired" }), saved: false };
    return { ...withFormError(captured, "failed"), saved: false };
  }
  revalidatePath(SCREEN(locale));
  return savedState();
}

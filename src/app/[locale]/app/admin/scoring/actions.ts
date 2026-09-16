"use server";

import { revalidatePath } from "next/cache";
import { parseDuration } from "@/components/admin/duration";
import { savedState, type SavedFormState } from "@/components/admin/saved-form-state";
import type { Locale } from "@/i18n/routing";
import { formStateFrom, was, withErrors, withFormError } from "@/lib/form-state";
import {
  companyHostingRuleUpdateInput,
  companyPercentRuleUpdateInput,
  manualAdjustmentInput,
  scoringRuleUpdateInput,
  sessionHostCompanyInput,
  setSessionHostCompany,
  submitManualAdjustment,
  updateCompanyHostingRule,
  updateCompanyPercentRule,
  updateScoringRule,
} from "@/lib/dal/scoring-admin";

// SCR-053's Server Actions (REQ-PTS-004 … 009, REQ-ADM-011), on the form model
// for wave 8 (K5). Each returns a `SavedFormState`: refusals at the field they
// concern, what was typed handed back, `saved` for the dialog to close and
// the toast to fire. `"use server"` modules export async functions alone — the
// state type lives in `components/admin/saved-form-state.ts`.
//
// Zod checks shape; authority is the database's: `scoring_rules`' column grant
// and `p2_admin_update`, `adjust_points_manually()`'s `assert_fresh_admin()`.

const SCREEN = (locale: Locale) => `/${locale}/app/admin/scoring`;
const INT = /^-?\d+$/;

type State = SavedFormState;

export async function saveScoringRule(locale: Locale, previous: State, formData: FormData): Promise<State> {
  const captured = formStateFrom<string>(formData, {
    fields: ["ruleId", "kind", "points", "capPerSession", "cooldownAmount", "cooldownUnit", "enabled", "reasonAr"],
    previous,
  });
  const errors: Record<string, string> = {};
  const penalty = was(captured, "kind") === "penalty";

  const pointsRaw = was(captured, "points").trim();
  let points = 0;
  if (pointsRaw === "") errors.points = "pointsRequired";
  else if (!INT.test(pointsRaw)) errors.points = "pointsInvalid";
  else {
    points = Number(pointsRaw);
    if (points < 0 || points > 1000) errors.points = "pointsRange";
  }

  const capRaw = was(captured, "capPerSession").trim();
  const cap = capRaw === "" ? null : Number(capRaw);
  if (capRaw !== "" && (!INT.test(capRaw) || cap! < 1 || cap! > 1000)) errors.capPerSession = "capInvalid";

  let cooldownSeconds: number | null = null;
  if (was(captured, "cooldownAmount").trim() !== "") {
    const parsed = parseDuration(was(captured, "cooldownAmount"), was(captured, "cooldownUnit"), "seconds");
    if (!parsed.ok) errors.cooldown = "cooldownInvalid";
    else if (parsed.amount > 31536000) errors.cooldown = "cooldownRange";
    else cooldownSeconds = parsed.amount === 0 ? null : parsed.amount;
  }

  const reason = was(captured, "reasonAr").trim();
  if (reason === "") errors.reasonAr = "reasonRequired";
  else if (reason.length > 200) errors.reasonAr = "reasonTooLong";

  if (Object.keys(errors).length > 0) return { ...withErrors(captured, errors), saved: false };

  const parsed = scoringRuleUpdateInput.safeParse({
    ruleId: was(captured, "ruleId"),
    // A penalty is typed as the COST — a positive number — and stored negative.
    points: penalty ? -points : points,
    enabled: was(captured, "enabled") === "on",
    capPerSession: cap,
    cooldownSeconds,
    reasonAr: reason,
  });
  if (!parsed.success) return { ...withFormError(captured, "failed"), saved: false };

  try {
    await updateScoringRule(locale, parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "sign_mismatch") return { ...withErrors(captured, { points: "signMismatch" }), saved: false };
    return { ...withFormError(captured, message === "not_found" ? "notFound" : "failed"), saved: false };
  }
  revalidatePath(SCREEN(locale));
  return savedState();
}

function wholeNumber(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= min && value <= max ? value : null;
}

export async function saveCompanyHostingRule(locale: Locale, previous: State, formData: FormData): Promise<State> {
  const captured = formStateFrom<string>(formData, { fields: ["ruleId", "points", "enabled"], previous });
  const points = wholeNumber(was(captured, "points"), 0, 10000);
  if (points === null) return { ...withErrors(captured, { points: was(captured, "points").trim() === "" ? "pointsRequired" : "pointsInvalid" }), saved: false };

  const parsed = companyHostingRuleUpdateInput.safeParse({ ruleId: was(captured, "ruleId"), enabled: was(captured, "enabled") === "on", points });
  if (!parsed.success) return { ...withFormError(captured, "failed"), saved: false };
  try {
    await updateCompanyHostingRule(locale, parsed.data);
  } catch {
    return { ...withFormError(captured, "failed"), saved: false };
  }
  revalidatePath(SCREEN(locale));
  return savedState();
}

export async function saveCompanyPercentRule(locale: Locale, previous: State, formData: FormData): Promise<State> {
  const captured = formStateFrom<string>(formData, { fields: ["ruleId", "pointsPerPercent", "capPoints", "minActiveMembers", "enabled"], previous });
  const errors: Record<string, string> = {};

  const perRaw = was(captured, "pointsPerPercent").trim();
  const per = Number(perRaw);
  if (perRaw === "") errors.pointsPerPercent = "pointsPerPercentRequired";
  else if (!/^\d+(\.\d{1,2})?$/.test(perRaw) || per > 100) errors.pointsPerPercent = "pointsPerPercentInvalid";

  const cap = wholeNumber(was(captured, "capPoints"), 1, 10000);
  if (cap === null) errors.capPoints = was(captured, "capPoints").trim() === "" ? "capPointsRequired" : "capPointsInvalid";
  const min = wholeNumber(was(captured, "minActiveMembers"), 1, 1000);
  if (min === null) errors.minActiveMembers = was(captured, "minActiveMembers").trim() === "" ? "minActiveMembersRequired" : "minActiveMembersInvalid";

  if (Object.keys(errors).length > 0) return { ...withErrors(captured, errors), saved: false };

  const parsed = companyPercentRuleUpdateInput.safeParse({
    ruleId: was(captured, "ruleId"),
    enabled: was(captured, "enabled") === "on",
    pointsPerPercent: per,
    capPoints: cap,
    minActiveMembers: min,
  });
  if (!parsed.success) return { ...withFormError(captured, "failed"), saved: false };
  try {
    await updateCompanyPercentRule(locale, parsed.data);
  } catch {
    return { ...withFormError(captured, "failed"), saved: false };
  }
  revalidatePath(SCREEN(locale));
  return savedState();
}

export async function saveSessionHostCompany(locale: Locale, previous: State, formData: FormData): Promise<State> {
  const captured = formStateFrom<string>(formData, { fields: ["sessionId", "companyId"], previous });
  const sessionId = was(captured, "sessionId");
  const companyId = was(captured, "companyId");
  if (sessionId === "") return { ...withErrors(captured, { sessionId: "sessionRequired" }), saved: false };

  const parsed = sessionHostCompanyInput.safeParse({ sessionId, companyId: companyId === "" ? null : companyId });
  if (!parsed.success) {
    const onCompany = parsed.error.issues.some((issue) => issue.path[0] === "companyId");
    return { ...withErrors(captured, onCompany ? { companyId: "companyInvalid" } : { sessionId: "sessionRequired" }), saved: false };
  }
  try {
    await setSessionHostCompany(locale, parsed.data);
  } catch {
    return { ...withFormError(captured, "failed"), saved: false };
  }
  revalidatePath(SCREEN(locale));
  return savedState();
}

export async function saveManualAdjustment(locale: Locale, previous: State, formData: FormData): Promise<State> {
  const captured = formStateFrom<string>(formData, { fields: ["memberId", "direction", "amount", "reason"], previous });
  const errors: Record<string, string> = {};

  const memberId = was(captured, "memberId");
  if (memberId === "") errors.memberId = "memberRequired";
  const amountRaw = was(captured, "amount").trim();
  const amount = wholeNumber(amountRaw, 1, 100000);
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
    const message = error instanceof Error ? error.message : "";
    if (message === "member_not_found") return { ...withErrors(captured, { memberId: "memberNotFound" }), saved: false };
    if (message === "reason_required") return { ...withErrors(captured, { reason: "reasonRequired" }), saved: false };
    if (message === "amount_required") return { ...withErrors(captured, { amount: "amountRequired" }), saved: false };
    return { ...withFormError(captured, "failed"), saved: false };
  }
  revalidatePath(SCREEN(locale));
  return savedState();
}

"use server";

import { revalidatePath } from "next/cache";
import { savedState, type SavedFormState } from "@/components/admin/saved-form-state";
import type { Locale } from "@/i18n/routing";
import { formStateFrom, was, withErrors, withFormError } from "@/lib/form-state";
import {
  badgeInput,
  BADGE_METRICS,
  levelUpdateInput,
  manualBadgeAwardInput,
  perkUpdateInput,
  saveBadge as writeBadge,
  setBadgeRetired,
  streakRuleUpdateInput,
  submitManualBadgeAward,
  updateLevel,
  updatePerk,
  updateStreakRule,
} from "@/lib/dal/scoring-admin";

// SCR-054's Server Actions (REQ-REC-001 … 008, REQ-ADM-012), on the form model
// for wave 8 (K4). Each returns a `SavedFormState` — refusals at the field,
// what was typed handed back, `saved` for the dialog and the toast — except the
// retire toggle, which is a confirmation, not a form.
//
// Shape is checked here; authority is the database's: `0027`'s grants and
// `p2_admin_*` policies, `award_badge_manually()`'s `assert_fresh_admin()`.

type State = SavedFormState;
const SCREEN = (locale: Locale) => `/${locale}/app/admin/recognition`;

function wholeNumber(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= min && value <= max ? value : null;
}

export async function saveBadge(locale: Locale, previous: State, formData: FormData): Promise<State> {
  const captured = formStateFrom<string>(formData, { fields: ["badgeId", "name", "description", "metric", "gte", "avg", "minSessions", "issuesCertificate"], previous });
  const errors: Record<string, string> = {};

  const name = was(captured, "name").trim();
  if (name === "") errors.name = "nameRequired";
  else if (name.length > 100) errors.name = "nameTooLong";
  const description = was(captured, "description").trim();
  if (description.length > 300) errors.description = "descriptionTooLong";

  const metric = was(captured, "metric");
  let rule: Record<string, unknown> = { metric };
  if (!(BADGE_METRICS as readonly string[]).includes(metric)) errors.metric = "metricInvalid";
  else if (metric === "presenter_rating_avg") {
    const avgRaw = was(captured, "avg").trim();
    const avg = Number(avgRaw);
    if (avgRaw === "" || !/^\d(\.\d{1,2})?$/.test(avgRaw) || avg < 1 || avg > 5) errors.avg = "avgInvalid";
    const minSessions = wholeNumber(was(captured, "minSessions"), 0, 1000);
    if (minSessions === null) errors.minSessions = "minSessionsInvalid";
    rule = { metric, gte: avg, minSessions };
  } else if (metric !== "manual") {
    const gteRaw = was(captured, "gte").trim();
    const gte = wholeNumber(gteRaw, 1, 100000);
    if (gteRaw === "") errors.gte = "gteRequired";
    else if (gte === null) errors.gte = "gteInvalid";
    rule = { metric, gte };
  }
  if (Object.keys(errors).length > 0) return { ...withErrors(captured, errors), saved: false };

  const badgeId = was(captured, "badgeId");
  const parsed = badgeInput.safeParse({
    badgeId: badgeId === "" ? undefined : badgeId,
    name,
    description: description === "" ? null : description,
    issuesCertificate: was(captured, "issuesCertificate") === "on",
    rule,
  });
  if (!parsed.success) return { ...withFormError(captured, "failed"), saved: false };
  try {
    await writeBadge(locale, parsed.data);
  } catch {
    return { ...withFormError(captured, "failed"), saved: false };
  }
  revalidatePath(SCREEN(locale));
  return savedState();
}

/** The retire toggle's two directions — `DeactivateToggle` confirms the retiring one. */
export async function retireBadge(locale: Locale, badgeId: string, retired: boolean): Promise<void> {
  await setBadgeRetired(locale, badgeId, retired);
  revalidatePath(SCREEN(locale));
}

export async function saveLevel(locale: Locale, previous: State, formData: FormData): Promise<State> {
  const captured = formStateFrom<string>(formData, { fields: ["levelId", "name", "thresholdPoints"], previous });
  const errors: Record<string, string> = {};
  const name = was(captured, "name").trim();
  if (name === "") errors.name = "nameRequired";
  else if (name.length > 60) errors.name = "nameTooLong";
  const thresholdRaw = was(captured, "thresholdPoints").trim();
  const threshold = wholeNumber(thresholdRaw, 0, 1_000_000);
  if (thresholdRaw === "") errors.thresholdPoints = "thresholdRequired";
  else if (threshold === null) errors.thresholdPoints = "thresholdInvalid";
  if (Object.keys(errors).length > 0) return { ...withErrors(captured, errors), saved: false };

  const parsed = levelUpdateInput.safeParse({ levelId: was(captured, "levelId"), name, thresholdPoints: threshold });
  if (!parsed.success) return { ...withFormError(captured, "failed"), saved: false };
  try {
    await updateLevel(locale, parsed.data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "threshold_order") return { ...withErrors(captured, { thresholdPoints: "thresholdOrder" }), saved: false };
    if (message === "threshold_taken") return { ...withErrors(captured, { thresholdPoints: "thresholdTaken" }), saved: false };
    return { ...withFormError(captured, "failed"), saved: false };
  }
  revalidatePath(SCREEN(locale));
  return savedState();
}

export async function saveStreakRule(locale: Locale, previous: State, formData: FormData): Promise<State> {
  const captured = formStateFrom<string>(formData, { fields: ["streakRuleId", "requiredCount", "bonusPoints", "enabled"], previous });
  const errors: Record<string, string> = {};
  const requiredCount = wholeNumber(was(captured, "requiredCount"), 1, 31);
  if (requiredCount === null) errors.requiredCount = "requiredCountInvalid";
  const bonusPoints = wholeNumber(was(captured, "bonusPoints"), 0, 1000);
  if (bonusPoints === null) errors.bonusPoints = "bonusPointsInvalid";
  if (Object.keys(errors).length > 0) return { ...withErrors(captured, errors), saved: false };

  const parsed = streakRuleUpdateInput.safeParse({ streakRuleId: was(captured, "streakRuleId"), requiredCount, bonusPoints, enabled: was(captured, "enabled") === "on" });
  if (!parsed.success) return { ...withFormError(captured, "failed"), saved: false };
  try {
    await updateStreakRule(locale, parsed.data);
  } catch {
    return { ...withFormError(captured, "failed"), saved: false };
  }
  revalidatePath(SCREEN(locale));
  return savedState();
}

export async function savePerk(locale: Locale, previous: State, formData: FormData): Promise<State> {
  const captured = formStateFrom<string>(formData, { fields: ["perkId", "enabled", "qualifier", "levelId", "badgeId"], previous });
  const qualifier = was(captured, "qualifier");
  const levelId = qualifier === "level" ? was(captured, "levelId") : "";
  const badgeId = qualifier === "badge" ? was(captured, "badgeId") : "";
  if (levelId === "" && badgeId === "") return { ...withErrors(captured, { qualifier: "qualifierRequired" }), saved: false };

  const parsed = perkUpdateInput.safeParse({
    perkId: was(captured, "perkId"),
    enabled: was(captured, "enabled") === "on",
    requiredLevelId: levelId === "" ? null : levelId,
    requiredBadgeId: badgeId === "" ? null : badgeId,
  });
  if (!parsed.success) return { ...withErrors(captured, { qualifier: "qualifierRequired" }), saved: false };
  try {
    await updatePerk(locale, parsed.data);
  } catch {
    return { ...withFormError(captured, "failed"), saved: false };
  }
  revalidatePath(SCREEN(locale));
  return savedState();
}

/** `alreadyHeldSince` travels in `values`, the one channel the form state has for a fact beside a key. */
export async function awardBadge(locale: Locale, previous: State, formData: FormData): Promise<State> {
  const captured = formStateFrom<string>(formData, { fields: ["memberId", "badgeId", "reason"], previous });
  const errors: Record<string, string> = {};
  const memberId = was(captured, "memberId");
  const badgeId = was(captured, "badgeId");
  const reason = was(captured, "reason").trim();
  if (memberId === "") errors.memberId = "memberRequired";
  if (badgeId === "") errors.badgeId = "badgeRequired";
  if (reason === "") errors.reason = "reasonRequired";
  else if (reason.length > 300) errors.reason = "reasonTooLong";
  if (Object.keys(errors).length > 0) return { ...withErrors(captured, errors), saved: false };

  const parsed = manualBadgeAwardInput.safeParse({ memberId, badgeId, reason });
  if (!parsed.success) return { ...withFormError(captured, "notFound"), saved: false };
  try {
    const { alreadyHeldSince, alreadyHeldBadge } = await submitManualBadgeAward(locale, parsed.data);
    if (alreadyHeldSince) {
      const refused = withErrors(captured, { memberId: "alreadyHeld" });
      return { ...refused, values: { ...refused.values, alreadyHeldSince, alreadyHeldBadge: alreadyHeldBadge ?? "" }, saved: false };
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "reason_required") return { ...withErrors(captured, { reason: "reasonRequired" }), saved: false };
    return { ...withFormError(captured, message === "not_found" ? "notFound" : "failed"), saved: false };
  }
  revalidatePath(SCREEN(locale));
  return savedState();
}

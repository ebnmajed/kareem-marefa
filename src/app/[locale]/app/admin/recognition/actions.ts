"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { savedState, type SavedFormState } from "@/components/admin/saved-form-state";
import type { Locale } from "@/i18n/routing";
import { releaseCertificates, revokeCertificate, revokeInput } from "@/lib/dal/certificates";
import { emptyFormState, formStateFrom, was, withErrors, withFormError } from "@/lib/form-state";
import {
  BADGE_METRICS,
  badgeInput,
  manualBadgeAwardInput,
  recognitionSaveInput,
  saveRecognition,
  submitManualBadgeAward,
  type BadgeRule,
} from "@/lib/dal/scoring-admin";
import { field, type RecognitionOpened, type RecognitionState } from "./state";

// SCR-054's Server Actions — REQ-UIX-101, REQ-UIX-091, REQ-REC-001 … 008, REQ-CRT-012, `DEC-232` §3, §5.2.
//
// ★ ONE SAVE IS ONE WRITE (`save_recognition()`): edit mode's levels, badges, perks and streak, or one badge's sheet —
// only what changed, in one transaction, answered with the history rows it wrote. «حُفظ» / «لم يتغيّر شيء» come from
// that answer. ★ The held certificates go through `designer`'s functions in `certificates.ts`, called AS THEY ARE:
// «أصدر» is `releaseCertificates()` (`certificate.released`), «أوقف» is `revokeCertificate()` with its mandatory reason
// (`certificate.revoked`). ★ The manual award is `award_badge_manually()` (`badge.manual_award`), a held badge said at
// the member with since when, and never «saved».
// Shape here; authority in the database — invoker functions under `0027`'s grants, the RPCs' own admin checks.

const SCREEN = (locale: Locale) => `/${locale}/app/admin/recognition`;

const ruleShape = z.object({ metric: z.enum(BADGE_METRICS), gte: z.number().nullable(), minSessions: z.number().nullable() });
const openedShape = z.object({
  levels: z.array(z.object({ id: z.uuid(), name: z.string(), thresholdPoints: z.int(), updatedAt: z.string() })).max(20),
  badges: z.array(z.object({ id: z.uuid(), name: z.string(), description: z.string().nullable(), issuesCertificate: z.boolean(), rule: ruleShape, retired: z.boolean(), updatedAt: z.string() })).max(200),
  perks: z.array(z.object({ id: z.uuid(), key: z.enum(["priority_rsvp", "can_host"]), enabled: z.boolean(), requiredLevelId: z.uuid().nullable(), requiredBadgeId: z.uuid().nullable(), updatedAt: z.string() })).max(10),
  streaks: z.array(z.object({ id: z.uuid(), requiredCount: z.int(), enabled: z.boolean(), updatedAt: z.string() })).max(10),
});

function whole(raw: string, min: number, max: number): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  return value >= min && value <= max ? value : null;
}

/** The refusals `save_recognition()` raises, at the field they concern. */
function refusal(message: string): { field: string; key: string } | string {
  const level = message.match(/^threshold_(order|taken):(.+)$/);
  if (level) return { field: field("level", level[2], "threshold"), key: level[1] === "order" ? "thresholdOrder" : "thresholdTaken" };
  if (message.startsWith("stale")) return "stale";
  if (message.startsWith("not_found")) return "notFound";
  return "failed";
}

export async function saveRecognitionEdit(locale: Locale, previous: RecognitionState, formData: FormData): Promise<RecognitionState> {
  let opened: RecognitionOpened;
  try {
    opened = openedShape.parse(JSON.parse(String(formData.get("opened") ?? "")));
  } catch {
    return { ...withFormError(emptyFormState<string>(), "failed"), receipt: null };
  }
  const fields = [
    ...opened.levels.flatMap((l) => [field("level", l.id, "name"), field("level", l.id, "threshold")]),
    ...opened.badges.flatMap((b) => [field("badge", b.id, "name"), field("badge", b.id, "enabled")]),
    ...opened.perks.flatMap((p) => [field("perk", p.id, "enabled"), field("perk", p.id, "qualifier")]),
    ...opened.streaks.flatMap((s) => [field("streak", s.id, "count"), field("streak", s.id, "enabled")]),
  ];
  const captured = formStateFrom<string>(formData, { fields, previous });
  const errors: Record<string, string> = {};

  const levels = opened.levels.map((l) => {
    const name = was(captured, field("level", l.id, "name")).trim();
    if (name === "") errors[field("level", l.id, "name")] = "nameRequired";
    else if (name.length > 60) errors[field("level", l.id, "name")] = "nameTooLong";
    const raw = was(captured, field("level", l.id, "threshold"));
    const threshold = whole(raw, 0, 1_000_000);
    if (threshold === null) errors[field("level", l.id, "threshold")] = raw.trim() === "" ? "thresholdRequired" : "thresholdInvalid";
    return { id: l.id, updatedAt: l.updatedAt, name, thresholdPoints: threshold ?? 0 };
  });
  const badges = opened.badges.map((b) => {
    const name = was(captured, field("badge", b.id, "name")).trim();
    if (name === "") errors[field("badge", b.id, "name")] = "nameRequired";
    else if (name.length > 100) errors[field("badge", b.id, "name")] = "nameTooLong";
    return { ...b, name, retired: was(captured, field("badge", b.id, "enabled")) !== "on" };
  });
  const perks = opened.perks.map((p) => {
    const qualifier = was(captured, field("perk", p.id, "qualifier"));
    const [kind, id] = qualifier.split(":");
    if ((kind !== "level" && kind !== "badge") || !id) errors[field("perk", p.id, "qualifier")] = "qualifierRequired";
    return {
      id: p.id,
      updatedAt: p.updatedAt,
      enabled: was(captured, field("perk", p.id, "enabled")) === "on",
      requiredLevelId: kind === "level" ? id : null,
      requiredBadgeId: kind === "badge" ? id : null,
    };
  });
  const streaks = opened.streaks.map((s) => {
    const raw = was(captured, field("streak", s.id, "count"));
    const count = whole(raw, 1, 31);
    if (count === null) errors[field("streak", s.id, "count")] = "requiredCountInvalid";
    return { id: s.id, updatedAt: s.updatedAt, requiredCount: count ?? 1, enabled: was(captured, field("streak", s.id, "enabled")) === "on" };
  });

  if (Object.keys(errors).length > 0) return { ...withErrors(captured, errors), receipt: null };
  const input = recognitionSaveInput.safeParse({ levels, badges, perks, streaks });
  if (!input.success) return { ...withFormError(captured, "failed"), receipt: null };
  try {
    const receipt = await saveRecognition(locale, input.data);
    revalidatePath(SCREEN(locale));
    return { ...emptyFormState<string>(), receipt };
  } catch (error) {
    const r = refusal(error instanceof Error ? error.message : "");
    if (typeof r === "string") return { ...withFormError(captured, r), receipt: null };
    return { ...withErrors(captured, { [r.field]: r.key }), receipt: null };
  }
}

/** One badge's sheet — created, or its full record edited — through the same one-transaction save. */
export async function saveBadgeSheet(locale: Locale, previous: RecognitionState, formData: FormData): Promise<RecognitionState> {
  const captured = formStateFrom<string>(formData, {
    fields: ["badgeId", "updatedAt", "retired", "name", "description", "metric", "gte", "avg", "minSessions", "issuesCertificate"],
    previous,
  });
  const errors: Record<string, string> = {};
  const name = was(captured, "name").trim();
  if (name === "") errors.name = "nameRequired";
  else if (name.length > 100) errors.name = "nameTooLong";
  const description = was(captured, "description").trim();
  if (description.length > 300) errors.description = "descriptionTooLong";

  const metric = was(captured, "metric");
  let rule: BadgeRule = { metric: "manual", gte: null, minSessions: null };
  if (!(BADGE_METRICS as readonly string[]).includes(metric)) errors.metric = "metricInvalid";
  else if (metric === "presenter_rating_avg") {
    const avgRaw = was(captured, "avg").trim();
    const avg = Number(avgRaw);
    if (avgRaw === "" || !/^\d(\.\d{1,2})?$/.test(avgRaw) || avg < 1 || avg > 5) errors.avg = "avgInvalid";
    const minSessions = whole(was(captured, "minSessions"), 0, 1000);
    if (minSessions === null) errors.minSessions = "minSessionsInvalid";
    rule = { metric, gte: avg, minSessions };
  } else if (metric !== "manual") {
    const gteRaw = was(captured, "gte").trim();
    const gte = whole(gteRaw, 1, 100000);
    if (gteRaw === "") errors.gte = "gteRequired";
    else if (gte === null) errors.gte = "gteInvalid";
    rule = { metric: metric as BadgeRule["metric"], gte, minSessions: null };
  }
  if (Object.keys(errors).length > 0) return { ...withErrors(captured, errors), receipt: null };

  const badgeId = was(captured, "badgeId");
  const parsed = badgeInput.safeParse({
    badgeId: badgeId === "" ? undefined : badgeId,
    name,
    description: description === "" ? null : description,
    issuesCertificate: was(captured, "issuesCertificate") === "on",
    rule: { metric: rule.metric, gte: rule.gte ?? undefined, minSessions: rule.minSessions ?? undefined },
  });
  if (!parsed.success) return { ...withFormError(captured, "failed"), receipt: null };
  try {
    const receipt = await saveRecognition(locale, {
      levels: [],
      perks: [],
      streaks: [],
      badges: [
        {
          id: badgeId === "" ? null : badgeId,
          updatedAt: badgeId === "" ? null : was(captured, "updatedAt"),
          name,
          description: description === "" ? null : description,
          issuesCertificate: was(captured, "issuesCertificate") === "on",
          rule,
          retired: was(captured, "retired") === "true",
        },
      ],
    });
    revalidatePath(SCREEN(locale));
    return { ...emptyFormState<string>(), receipt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return { ...withFormError(captured, message.startsWith("stale") ? "stale" : "failed"), receipt: null };
  }
}

/** «أصدر» on one row — `release_certificates()` as it is; it audits `certificate.released`. */
export async function releaseHeldCertificate(locale: Locale, certificateId: string): Promise<{ ok: boolean }> {
  const parsed = z.uuid().safeParse(certificateId);
  if (!parsed.success) return { ok: false };
  const result = await releaseCertificates(locale, { ids: [parsed.data] });
  revalidatePath(SCREEN(locale));
  return { ok: result.status === "ok" && result.count > 0 };
}

/** «أوقف» — `revoke_certificate()` as it is, with its mandatory reason (REQ-CRT-011); it audits `certificate.revoked`. */
export async function revokeHeldCertificate(locale: Locale, previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  const captured = formStateFrom<string>(formData, { fields: ["certificateId", "reason"], previous });
  const reason = was(captured, "reason").trim();
  if (reason === "") return { ...withErrors(captured, { reason: "reasonRequired" }), saved: false };
  const parsed = revokeInput.safeParse({ id: was(captured, "certificateId"), reason });
  if (!parsed.success) return { ...withErrors(captured, { reason: "reasonTooShort" }), saved: false };
  const result = await revokeCertificate(locale, parsed.data);
  if (result.status === "reason_required") return { ...withErrors(captured, { reason: "reasonRequired" }), saved: false };
  if (result.status !== "ok") return { ...withFormError(captured, "failed"), saved: false };
  revalidatePath(SCREEN(locale));
  return savedState();
}

/** `alreadyHeldSince` travels in `values`, the one channel the form state has for a fact beside a key. */
export async function awardBadge(locale: Locale, previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
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

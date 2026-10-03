// SCR-054's Server Actions — REQ-REC-001 … 008, REQ-UIX-101, REQ-CRT-011/012. Shape at the field; the database's
// refusals mapped to the fields they concern. ★ wave 22: the per-row writers (`saveBadge`, `saveLevel`, `savePerk`) are
// re-said for the one save of edit mode and the badge sheet (ledger lines); the manual award's cases are unchanged; the
// held certificate's «أوقف» is new.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/session", () => ({ sessionClient: vi.fn() }));

const saveRecognition = vi.fn();
const submitManualBadgeAward = vi.fn();
vi.mock("@/lib/dal/scoring-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dal/scoring-admin")>()),
  saveRecognition: (...a: unknown[]) => saveRecognition(...a),
  submitManualBadgeAward: (...a: unknown[]) => submitManualBadgeAward(...a),
}));
const revokeCertificate = vi.fn();
const releaseCertificates = vi.fn();
vi.mock("@/lib/dal/certificates", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dal/certificates")>()),
  revokeCertificate: (...a: unknown[]) => revokeCertificate(...a),
  releaseCertificates: (...a: unknown[]) => releaseCertificates(...a),
}));

const actions = await import("@/app/[locale]/app/admin/recognition/actions");
const { emptySavedState } = await import("@/components/admin/saved-form-state");
const { emptyRecognitionState } = await import("@/app/[locale]/app/admin/recognition/state");

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const L1 = "33333333-3333-4333-8333-333333333333";
const L2 = "44444444-4444-4444-8444-444444444444";
const T = "2026-10-01T10:00:00+00:00";
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};
const opened = JSON.stringify({
  levels: [
    { id: L1, name: "مشارِك", thresholdPoints: 0, updatedAt: T },
    { id: L2, name: "صاحب أثر", thresholdPoints: 300, updatedAt: T },
  ],
  badges: [{ id: ID, name: "حاضر دائم", description: null, issuesCertificate: false, rule: { metric: "check_ins_count", gte: 10, minSessions: null }, retired: false, updatedAt: T }],
  perks: [{ id: ID2, key: "can_host", enabled: false, requiredLevelId: L2, requiredBadgeId: null, updatedAt: T }],
  streaks: [],
});
const editForm = (overrides: Record<string, string> = {}) =>
  form({
    opened,
    [`level-${L1}-name`]: "مشارِك",
    [`level-${L1}-threshold`]: "0",
    [`level-${L2}-name`]: "صاحب أثر",
    [`level-${L2}-threshold`]: "300",
    [`badge-${ID}-name`]: "حاضر دائم",
    [`badge-${ID}-enabled`]: "on",
    [`perk-${ID2}-qualifier`]: `level:${L2}`,
    ...overrides,
  });

beforeEach(() => [saveRecognition, submitManualBadgeAward, revokeCertificate, releaseCertificates].forEach((f) => f.mockReset()));

describe("saveRecognitionEdit — one save for everything edit mode shows (REQ-REC-001, -003, -006)", () => {
  it("sends every row with its updated_at; an unchecked switch retires the badge, keeping its rule and flag", async () => {
    saveRecognition.mockResolvedValueOnce({ at: T, wrote: ["badges.retired_at"] });
    const result = await actions.saveRecognitionEdit("ar", emptyRecognitionState, editForm({ [`badge-${ID}-enabled`]: "" }));
    expect(result.receipt).toEqual({ at: T, wrote: ["badges.retired_at"] });
    const input = saveRecognition.mock.calls[0][1];
    expect(input.badges[0]).toEqual({ id: ID, name: "حاضر دائم", description: null, issuesCertificate: false, rule: { metric: "check_ins_count", gte: 10, minSessions: null }, retired: true, updatedAt: T });
    expect(input.levels.map((l: { thresholdPoints: number }) => l.thresholdPoints)).toEqual([0, 300]);
    expect(input.perks[0]).toMatchObject({ requiredLevelId: L2, requiredBadgeId: null, enabled: false });
  });

  it("refuses at the fields and sends nothing: no name, no threshold, no qualifier", async () => {
    const result = await actions.saveRecognitionEdit(
      "ar",
      emptyRecognitionState,
      editForm({ [`level-${L2}-name`]: " ", [`level-${L2}-threshold`]: "", [`perk-${ID2}-qualifier`]: "" }),
    );
    expect(saveRecognition).not.toHaveBeenCalled();
    expect(result.errors).toEqual({ [`level-${L2}-name`]: "nameRequired", [`level-${L2}-threshold`]: "thresholdRequired", [`perk-${ID2}-qualifier`]: "qualifierRequired" });
  });

  it("a threshold out of order, or taken, lands on that level's threshold; a stale form is said as stale", async () => {
    saveRecognition.mockRejectedValueOnce(new Error(`threshold_order:${L2}`));
    expect((await actions.saveRecognitionEdit("ar", emptyRecognitionState, editForm())).errors).toEqual({ [`level-${L2}-threshold`]: "thresholdOrder" });
    saveRecognition.mockRejectedValueOnce(new Error(`threshold_taken:${L2}`));
    expect((await actions.saveRecognitionEdit("ar", emptyRecognitionState, editForm())).errors).toEqual({ [`level-${L2}-threshold`]: "thresholdTaken" });
    saveRecognition.mockRejectedValueOnce(new Error("stale"));
    expect((await actions.saveRecognitionEdit("ar", emptyRecognitionState, editForm())).formError).toBe("stale");
  });
});

describe("saveBadgeSheet — create and edit, with a rule (REQ-REC-001)", () => {
  it("creates a count badge: no id, the threshold as a number, the certificate flag", async () => {
    saveRecognition.mockResolvedValueOnce({ at: T, wrote: ["badges.created"] });
    await actions.saveBadgeSheet("ar", emptyRecognitionState, form({ badgeId: "", name: "عدسة القاعة", metric: "check_ins_count", gte: "10", issuesCertificate: "on" }));
    expect(saveRecognition.mock.calls[0][1].badges).toEqual([
      { id: null, updatedAt: null, name: "عدسة القاعة", description: null, issuesCertificate: true, rule: { metric: "check_ins_count", gte: 10, minSessions: null }, retired: false },
    ]);
  });

  it("edits a presenter-average badge with its minimum sessions, keeping its retirement as found", async () => {
    saveRecognition.mockResolvedValueOnce({ at: T, wrote: ["badges.rule"] });
    await actions.saveBadgeSheet("ar", emptyRecognitionState, form({ badgeId: ID, updatedAt: T, retired: "true", name: "مُقدِّم مُقيَّم", metric: "presenter_rating_avg", avg: "4.5", minSessions: "3" }));
    expect(saveRecognition.mock.calls[0][1].badges[0]).toMatchObject({ id: ID, updatedAt: T, retired: true, rule: { metric: "presenter_rating_avg", gte: 4.5, minSessions: 3 } });
  });

  it("refuses at the fields: no name, no threshold, an average outside one to five", async () => {
    const r1 = await actions.saveBadgeSheet("ar", emptyRecognitionState, form({ name: "", metric: "check_ins_count", gte: "" }));
    expect(r1.errors).toEqual({ name: "nameRequired", gte: "gteRequired" });
    const r2 = await actions.saveBadgeSheet("ar", emptyRecognitionState, form({ name: "س", metric: "presenter_rating_avg", avg: "7", minSessions: "3" }));
    expect(r2.errors).toEqual({ avg: "avgInvalid" });
    expect(saveRecognition).not.toHaveBeenCalled();
  });
});

describe("revokeHeldCertificate — «أوقف», with its mandatory reason (REQ-CRT-011)", () => {
  it("no reason is refused at the field and nothing is revoked; a reason revokes through revokeCertificate()", async () => {
    const refused = await actions.revokeHeldCertificate("ar", emptySavedState(), form({ certificateId: ID, reason: " " }));
    expect(refused.errors).toEqual({ reason: "reasonRequired" });
    expect(revokeCertificate).not.toHaveBeenCalled();
    revokeCertificate.mockResolvedValueOnce({ status: "ok", count: 1 });
    const done = await actions.revokeHeldCertificate("ar", emptySavedState(), form({ certificateId: ID, reason: "شهادة مكرّرة" }));
    expect(done.saved).toBe(true);
    expect(revokeCertificate).toHaveBeenCalledWith("ar", { id: ID, reason: "شهادة مكرّرة" });
  });
});

describe("releaseHeldCertificate — «أصدر» on one row", () => {
  it("releases exactly that certificate, and says so only when one was released", async () => {
    releaseCertificates.mockResolvedValueOnce({ status: "ok", count: 1 });
    expect(await actions.releaseHeldCertificate("ar", ID)).toEqual({ ok: true });
    expect(releaseCertificates).toHaveBeenCalledWith("ar", { ids: [ID] });
    releaseCertificates.mockResolvedValueOnce({ status: "ok", count: 0 });
    expect(await actions.releaseHeldCertificate("ar", ID)).toEqual({ ok: false });
  });
});

describe("awardBadge — REQ-REC-001's manual award", () => {
  it("a badge already held is refused at the member, with since when, and never «saved»", async () => {
    submitManualBadgeAward.mockResolvedValueOnce({ alreadyHeldSince: "2026-08-01T10:00:00Z", alreadyHeldBadge: "حاضر دائم" });
    const result = await actions.awardBadge("ar", emptySavedState(), form({ memberId: ID, badgeId: ID2, reason: "تكريم سنوي" }));
    expect(result.saved).toBe(false);
    expect(result.errors).toEqual({ memberId: "alreadyHeld" });
    expect(result.values.alreadyHeldSince).toBe("2026-08-01T10:00:00Z");
    // The badge is named by the server, and what was chosen is kept for the select.
    expect(result.values.alreadyHeldBadge).toBe("حاضر دائم");
    expect(result.values.badgeId).toBe(ID2);
  });

  it("a new award saves; missing fields are refused at each", async () => {
    submitManualBadgeAward.mockResolvedValueOnce({ alreadyHeldSince: null, alreadyHeldBadge: null });
    expect((await actions.awardBadge("ar", emptySavedState(), form({ memberId: ID, badgeId: ID2, reason: "تكريم" }))).saved).toBe(true);
    const missing = await actions.awardBadge("ar", emptySavedState(), form({ memberId: "", badgeId: "", reason: "" }));
    expect(missing.errors).toEqual({ memberId: "memberRequired", badgeId: "badgeRequired", reason: "reasonRequired" });
  });
});

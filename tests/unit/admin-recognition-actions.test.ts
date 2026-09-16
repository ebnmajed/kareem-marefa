// SCR-054's Server Actions — REQ-REC-001 … 008. Shape at the field; the DAL's
// refusals mapped to the fields they concern.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/session", () => ({ sessionClient: vi.fn() }));

const saveBadge = vi.fn();
const updateLevel = vi.fn();
const updatePerk = vi.fn();
const submitManualBadgeAward = vi.fn();
vi.mock("@/lib/dal/scoring-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dal/scoring-admin")>()),
  saveBadge: (...a: unknown[]) => saveBadge(...a),
  updateLevel: (...a: unknown[]) => updateLevel(...a),
  updatePerk: (...a: unknown[]) => updatePerk(...a),
  submitManualBadgeAward: (...a: unknown[]) => submitManualBadgeAward(...a),
}));

const actions = await import("@/app/[locale]/app/admin/recognition/actions");
const { emptySavedState } = await import("@/components/admin/saved-form-state");

const ID = "11111111-1111-4111-8111-111111111111";
const ID2 = "22222222-2222-4222-8222-222222222222";
const form = (values: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
};

beforeEach(() => [saveBadge, updateLevel, updatePerk, submitManualBadgeAward].forEach((f) => f.mockReset()));

describe("saveBadge — REQ-REC-001: create and edit, with a rule", () => {
  it("creates a count badge: no id, the rule's threshold as a number, the certificate flag", async () => {
    const result = await actions.saveBadge("ar", emptySavedState(), form({ badgeId: "", name: "حاضر مخلص", description: "", metric: "check_ins_count", gte: "25", issuesCertificate: "on" }));
    expect(result.saved).toBe(true);
    expect(saveBadge).toHaveBeenCalledWith("ar", { badgeId: undefined, name: "حاضر مخلص", description: null, issuesCertificate: true, rule: { metric: "check_ins_count", gte: 25 } });
  });

  it("edits a presenter-average badge with its minimum sessions; a manual badge carries no threshold", async () => {
    await actions.saveBadge("ar", emptySavedState(), form({ badgeId: ID, name: "مُقدِّم مُقيَّم", metric: "presenter_rating_avg", avg: "4.5", minSessions: "3" }));
    await actions.saveBadge("ar", emptySavedState(), form({ badgeId: ID, name: "كريم المعرفة السنوي", metric: "manual", gte: "999" }));
    expect(saveBadge.mock.calls.map((c) => c[1].rule)).toEqual([{ metric: "presenter_rating_avg", gte: 4.5, minSessions: 3 }, { metric: "manual" }]);
  });

  it("refuses at the fields: no name, no threshold, an average outside one to five", async () => {
    const count = await actions.saveBadge("ar", emptySavedState(), form({ name: " ", metric: "check_ins_count", gte: "" }));
    expect(count.errors).toEqual({ name: "nameRequired", gte: "gteRequired" });
    const avg = await actions.saveBadge("ar", emptySavedState(), form({ name: "x", metric: "presenter_rating_avg", avg: "6", minSessions: "-1" }));
    expect(avg.errors).toEqual({ avg: "avgInvalid", minSessions: "minSessionsInvalid" });
    expect(saveBadge).not.toHaveBeenCalled();
  });
});

describe("saveLevel — REQ-REC-003", () => {
  it("a threshold out of order, or taken, lands on the threshold", async () => {
    updateLevel.mockRejectedValueOnce(new Error("threshold_order")).mockRejectedValueOnce(new Error("threshold_taken"));
    const order = await actions.saveLevel("ar", emptySavedState(), form({ levelId: ID, name: "صاحب أثر", thresholdPoints: "50" }));
    const taken = await actions.saveLevel("ar", emptySavedState(), form({ levelId: ID, name: "صاحب أثر", thresholdPoints: "100" }));
    expect([order.errors, taken.errors]).toEqual([{ thresholdPoints: "thresholdOrder" }, { thresholdPoints: "thresholdTaken" }]);
  });
});

describe("savePerk — REQ-REC-006", () => {
  it("sends exactly one qualifier — the one the radio chose — and refuses none", async () => {
    await actions.savePerk("ar", emptySavedState(), form({ perkId: ID, enabled: "on", qualifier: "badge", levelId: ID2, badgeId: ID2 }));
    expect(updatePerk).toHaveBeenCalledWith("ar", { perkId: ID, enabled: true, requiredLevelId: null, requiredBadgeId: ID2 });
    const none = await actions.savePerk("ar", emptySavedState(), form({ perkId: ID, qualifier: "level", levelId: "" }));
    expect(none.errors).toEqual({ qualifier: "qualifierRequired" });
  });
});

describe("awardBadge — REQ-REC-001's manual award", () => {
  it("a badge already held is refused at the member, with since when, and never «saved»", async () => {
    submitManualBadgeAward.mockResolvedValueOnce({ alreadyHeldSince: "2026-08-01T10:00:00Z" });
    const result = await actions.awardBadge("ar", emptySavedState(), form({ memberId: ID, badgeId: ID2, reason: "تكريم سنوي" }));
    expect(result.saved).toBe(false);
    expect(result.errors).toEqual({ memberId: "alreadyHeld" });
    expect(result.values.alreadyHeldSince).toBe("2026-08-01T10:00:00Z");
  });

  it("a new award saves; missing fields are refused at each", async () => {
    submitManualBadgeAward.mockResolvedValueOnce({ alreadyHeldSince: null });
    expect((await actions.awardBadge("ar", emptySavedState(), form({ memberId: ID, badgeId: ID2, reason: "تكريم" }))).saved).toBe(true);
    const missing = await actions.awardBadge("ar", emptySavedState(), form({ memberId: "", badgeId: "", reason: "" }));
    expect(missing.errors).toEqual({ memberId: "memberRequired", badgeId: "badgeRequired", reason: "reasonRequired" });
  });
});

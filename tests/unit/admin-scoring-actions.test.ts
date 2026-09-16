// SCR-053's Server Actions and the interval reader — REQ-PTS-004 … 009.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/session", () => ({ sessionClient: vi.fn() }));

const updateScoringRule = vi.fn();
const submitManualAdjustment = vi.fn();
const setSessionHostCompany = vi.fn();
vi.mock("@/lib/dal/scoring-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dal/scoring-admin")>()),
  updateScoringRule: (...args: unknown[]) => updateScoringRule(...args),
  submitManualAdjustment: (...args: unknown[]) => submitManualAdjustment(...args),
  setSessionHostCompany: (...args: unknown[]) => setSessionHostCompany(...args),
}));

const { intervalToSeconds } = await import("@/lib/dal/scoring-admin");
const { saveManualAdjustment, saveScoringRule, saveSessionHostCompany } = await import("@/app/[locale]/app/admin/scoring/actions");
const { emptySavedState } = await import("@/components/admin/saved-form-state");

const RULE = "11111111-1111-4111-8111-111111111111";
const MEMBER = "22222222-2222-4222-8222-222222222222";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [k, v] of Object.entries(values)) data.set(k, v);
  return data;
}

describe("intervalToSeconds — every shape PostgREST prints", () => {
  it("reads clock intervals, including past 24 hours", () => {
    expect(intervalToSeconds("00:01:00")).toBe(60);
    expect(intervalToSeconds("24:00:00")).toBe(86400);
    expect(intervalToSeconds("8760:00:00")).toBe(31536000);
  });
  it("★ reads a day part, which the old parser returned as «no cooldown»", () => {
    expect(intervalToSeconds("1 day")).toBe(86400);
    expect(intervalToSeconds("3 days")).toBe(259200);
    expect(intervalToSeconds("1 day 02:00:00")).toBe(93600);
  });
  it("null and nonsense are null", () => {
    expect(intervalToSeconds(null)).toBeNull();
    expect(intervalToSeconds("P1D")).toBeNull();
  });
});

describe("saveScoringRule", () => {
  beforeEach(() => updateScoringRule.mockReset());

  it("a deduction is typed as its cost and stored negative, with the cooldown in seconds", async () => {
    const result = await saveScoringRule(
      "ar",
      emptySavedState(),
      form({ ruleId: RULE, kind: "penalty", points: "5", capPerSession: "", cooldownAmount: "2", cooldownUnit: "hours", enabled: "on", reasonAr: "تغيّب بعد الحجز" }),
    );
    expect(result.saved).toBe(true);
    expect(updateScoringRule).toHaveBeenCalledWith("ar", { ruleId: RULE, points: -5, enabled: true, capPerSession: null, cooldownSeconds: 7200, reasonAr: "تغيّب بعد الحجز" });
  });

  it("refuses at the fields, and writes nothing", async () => {
    const result = await saveScoringRule(
      "ar",
      emptySavedState(),
      form({ ruleId: RULE, kind: "reward", points: "1001", capPerSession: "0", cooldownAmount: "1.5", cooldownUnit: "hours", reasonAr: "  " }),
    );
    expect(updateScoringRule).not.toHaveBeenCalled();
    expect(result).toMatchObject({ saved: false, attempt: 1 });
    expect(result.errors).toEqual({ points: "pointsRange", capPerSession: "capInvalid", cooldown: "cooldownInvalid", reasonAr: "reasonRequired" });
    expect(result.values.points).toBe("1001");
  });

  it("the DAL's sign guard lands on the points field; an unchecked «enabled» saves the rule off", async () => {
    updateScoringRule.mockRejectedValueOnce(new Error("sign_mismatch"));
    const refused = await saveScoringRule("ar", emptySavedState(), form({ ruleId: RULE, kind: "reward", points: "3", reasonAr: "تعليق" }));
    expect(refused.errors).toEqual({ points: "signMismatch" });
    expect(updateScoringRule.mock.calls[0][1]).toMatchObject({ enabled: false, points: 3 });
  });
});

describe("saveManualAdjustment", () => {
  beforeEach(() => submitManualAdjustment.mockReset());

  it("«خصم» writes a negative amount; «إضافة» a positive one", async () => {
    await saveManualAdjustment("ar", emptySavedState(), form({ memberId: MEMBER, direction: "deduct", amount: "50", reason: "تصحيح" }));
    await saveManualAdjustment("ar", emptySavedState(), form({ memberId: MEMBER, direction: "add", amount: "50", reason: "تصحيح" }));
    expect(submitManualAdjustment.mock.calls.map((c) => c[1].amount)).toEqual([-50, 50]);
  });

  it("a missing member, amount and reason are each refused at the field", async () => {
    const result = await saveManualAdjustment("ar", emptySavedState(), form({ memberId: "", direction: "add", amount: "", reason: "" }));
    expect(result.errors).toEqual({ memberId: "memberRequired", amount: "amountRequired", reason: "reasonRequired" });
    expect(submitManualAdjustment).not.toHaveBeenCalled();
  });

  it("the RPC's refusals come back at their fields", async () => {
    submitManualAdjustment.mockRejectedValueOnce(new Error("member_not_found"));
    const result = await saveManualAdjustment("ar", emptySavedState(), form({ memberId: MEMBER, direction: "add", amount: "5", reason: "تصحيح" }));
    expect(result.errors).toEqual({ memberId: "memberNotFound" });
  });
});

describe("saveSessionHostCompany", () => {
  beforeEach(() => setSessionHostCompany.mockReset());

  it("no session is refused at the session; «بلا شركة» clears the host", async () => {
    expect((await saveSessionHostCompany("ar", emptySavedState(), form({ sessionId: "", companyId: "" }))).errors).toEqual({ sessionId: "sessionRequired" });
    const saved = await saveSessionHostCompany("ar", emptySavedState(), form({ sessionId: MEMBER, companyId: "" }));
    expect(saved.saved).toBe(true);
    expect(setSessionHostCompany).toHaveBeenCalledWith("ar", { sessionId: MEMBER, companyId: null });
  });
});

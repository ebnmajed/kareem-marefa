// SCR-053's Server Actions and the interval reader — REQ-PTS-004 … 009, REQ-UIX-100. ★ wave 22: `saveScoringRule`'s
// cases are re-said for `saveCatalogue`, the one save of edit mode (a ledger line); the adjustment's are unchanged.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/dal/session", () => ({ sessionClient: vi.fn() }));

const saveScoringCatalogue = vi.fn();
const submitManualAdjustment = vi.fn();
vi.mock("@/lib/dal/scoring-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dal/scoring-admin")>()),
  saveScoringCatalogue: (...args: unknown[]) => saveScoringCatalogue(...args),
  submitManualAdjustment: (...args: unknown[]) => submitManualAdjustment(...args),
}));

const { intervalToSeconds } = await import("@/lib/dal/scoring-admin");
const { saveCatalogue, saveManualAdjustment } = await import("@/app/[locale]/app/admin/scoring/actions");
const { emptyCatalogueState } = await import("@/app/[locale]/app/admin/scoring/state");
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

describe("saveCatalogue — one save for every rule edit mode shows", () => {
  beforeEach(() => saveScoringCatalogue.mockReset());
  const opened = (penalty: boolean) => JSON.stringify({ rules: [{ id: RULE, actionKey: penalty ? "no_show" : "comment", version: 4, penalty }], company: [] });
  const f = (field: string) => `rule-${RULE}-${field}`;

  it("a deduction is typed as its cost and sent negative, with the cooldown in seconds and its version", async () => {
    saveScoringCatalogue.mockResolvedValueOnce({ at: "2026-10-03T09:00:00Z", wrote: ["no_show.points"] });
    const result = await saveCatalogue(
      "ar",
      emptyCatalogueState,
      form({ opened: opened(true), [f("points")]: "5", [f("cap")]: "", [f("cooldownAmount")]: "2", [f("cooldownUnit")]: "hours", [f("enabled")]: "on", [f("reason")]: "تغيّب بعد الحجز" }),
    );
    expect(result.receipt).toEqual({ at: "2026-10-03T09:00:00Z", wrote: ["no_show.points"] });
    expect(saveScoringCatalogue).toHaveBeenCalledWith("ar", {
      rules: [{ id: RULE, version: 4, points: -5, enabled: true, cap_per_session: null, cooldown_seconds: 7200, reason_ar: "تغيّب بعد الحجز" }],
      company: [],
    });
  });

  it("refuses at the fields, and sends nothing", async () => {
    const result = await saveCatalogue(
      "ar",
      emptyCatalogueState,
      form({ opened: opened(false), [f("points")]: "1001", [f("cap")]: "0", [f("cooldownAmount")]: "1.5", [f("cooldownUnit")]: "hours", [f("reason")]: "  " }),
    );
    expect(saveScoringCatalogue).not.toHaveBeenCalled();
    expect(result.receipt).toBeNull();
    expect(result.errors).toEqual({ [f("points")]: "pointsRange", [f("cap")]: "capInvalid", [f("cooldownAmount")]: "cooldownInvalid", [f("reason")]: "reasonRequired" });
    expect(result.values[f("points")]).toBe("1001");
  });

  it("the function's sign guard lands on that rule's value; a stale form is said as stale; an unchecked switch sends the rule off", async () => {
    saveScoringCatalogue.mockRejectedValueOnce(new Error("sign_mismatch:comment"));
    const refused = await saveCatalogue("ar", emptyCatalogueState, form({ opened: opened(false), [f("points")]: "3", [f("reason")]: "تعليق" }));
    expect(refused.errors).toEqual({ [f("points")]: "signMismatch" });
    expect(saveScoringCatalogue.mock.calls[0][1].rules[0]).toMatchObject({ enabled: false, points: 3 });
    saveScoringCatalogue.mockRejectedValueOnce(new Error("stale"));
    const stale = await saveCatalogue("ar", emptyCatalogueState, form({ opened: opened(false), [f("points")]: "3", [f("reason")]: "تعليق" }));
    expect(stale.formError).toBe("stale");
  });

  it("a receipt that wrote nothing comes back as one — the page says «لم يتغيّر شيء» from it", async () => {
    saveScoringCatalogue.mockResolvedValueOnce({ at: null, wrote: [] });
    const result = await saveCatalogue("ar", emptyCatalogueState, form({ opened: opened(false), [f("points")]: "3", [f("enabled")]: "on", [f("reason")]: "تعليق" }));
    expect(result.receipt).toEqual({ at: null, wrote: [] });
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

// SCR-014's two actions — REQ-CHK-003, REQ-UIX-046, DEC-195 §2.1, DEC-197 §4.
//
// ★ `submitCheckInForm` is the no-JS path and it redirects exactly as it always
// has, for every envelope — the one change is `reservation_required`, which used
// to read «unknown» (DEC-197 §4, a ledger line). ★ `checkInForMoment` is the
// hydrated path: identical redirects for «already» and every refusal, and for a
// fresh check-in it RETURNS the row's id and refreshes — the occurrence moment 2
// plays from, which a redirect would drop.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));
const refresh = vi.fn();
vi.mock("next/cache", () => ({ refresh: () => refresh() }));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { to });
  },
}));
const submitCheckIn = vi.fn();
vi.mock("@/lib/dal/checkin", async () => {
  const { z } = await import("zod");
  return { checkInInput: z.object({ code: z.string().trim().toUpperCase().length(6) }), submitCheckIn: (...a: unknown[]) => submitCheckIn(...a) };
});

const { submitCheckInForm, checkInForMoment } = await import("@/app/[locale]/app/sessions/[id]/check-in/actions");

const SESSION = "11111111-1111-4111-8111-111111111111";
const BASE = `/ar/app/sessions/${SESSION}/check-in`;
const form = (code: string) => {
  const fd = new FormData();
  fd.set("code", code);
  return fd;
};

async function redirectOf(run: () => Promise<unknown>): Promise<string> {
  try {
    await run();
  } catch (e) {
    return (e as { to: string }).to;
  }
  throw new Error("did not redirect");
}

beforeEach(() => {
  submitCheckIn.mockReset();
  refresh.mockReset();
});

const OK = { ok: true, checkInId: "ci-1", alreadyCheckedIn: false, method: "code", arrivedAt: "2026-09-29T15:41:00Z" };

describe("the no-JS path — submitCheckInForm", () => {
  it.each([
    ["a malformed code", null, "m7k", `${BASE}?error=invalid_code&code=M7K`],
    ["a refusal", { ok: false, error: "invalid_code" }, "zzzzzz", `${BASE}?error=invalid_code&code=ZZZZZZ`],
    ["an overlap, with its conflict", { ok: false, error: "overlap", conflictSessionId: "s2" }, "M7K3QX", `${BASE}?error=overlap&code=M7K3QX&conflict=s2`],
    ["an unknown status", { ok: false, error: "weird" }, "M7K3QX", `${BASE}?error=unknown&code=M7K3QX`],
    ["already checked in", { ...OK, alreadyCheckedIn: true }, "M7K3QX", `${BASE}?already=1`],
    ["a fresh check-in", OK, "M7K3QX", `${BASE}?success=1`],
  ])("%s → the same redirect as before", async (_, result, code, to) => {
    if (result) submitCheckIn.mockResolvedValue(result);
    expect(await redirectOf(() => submitCheckInForm("ar", SESSION, form(code)))).toBe(to);
    expect(refresh).not.toHaveBeenCalled();
  });

  it("★ reservation_required is its own refusal now, not «unknown» (DEC-197 §4)", async () => {
    submitCheckIn.mockResolvedValue({ ok: false, error: "reservation_required" });
    expect(await redirectOf(() => submitCheckInForm("ar", SESSION, form("M7K3QX")))).toBe(`${BASE}?error=reservation_required&code=M7K3QX`);
  });
});

describe("the hydrated path — checkInForMoment", () => {
  it("★ a fresh check-in returns its id and refreshes; it never redirects", async () => {
    submitCheckIn.mockResolvedValue(OK);
    await expect(checkInForMoment("ar", SESSION, form("M7K3QX"))).resolves.toEqual({ checkInId: "ci-1" });
    expect(refresh).toHaveBeenCalledOnce();
  });

  it("«already» and every refusal redirect exactly as the no-JS path does, with no refresh and no id", async () => {
    submitCheckIn.mockResolvedValue({ ...OK, alreadyCheckedIn: true });
    expect(await redirectOf(() => checkInForMoment("ar", SESSION, form("M7K3QX")))).toBe(`${BASE}?already=1`);
    submitCheckIn.mockResolvedValue({ ok: false, error: "rate_limited" });
    expect(await redirectOf(() => checkInForMoment("ar", SESSION, form("M7K3QX")))).toBe(`${BASE}?error=rate_limited&code=M7K3QX`);
    expect(await redirectOf(() => checkInForMoment("ar", SESSION, form("ab")))).toBe(`${BASE}?error=invalid_code&code=AB`);
    expect(refresh).not.toHaveBeenCalled();
  });
});

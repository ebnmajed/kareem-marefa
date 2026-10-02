// SCR-029's writes — REQ-UIX-077, DEC-218 §2.1, DEC-219 §1. ★ The proof that every preference `preference-matrix`
// wrote is still written, BY THE FUNCTION THAT WROTE IT: `setPreference()`, mocked here and asserted call by call.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CategoryPreference, NotificationCategory } from "@/lib/dal/notifications";

const setPreference = vi.fn();
const getPreferenceMatrix = vi.fn();
const setLeaderboardOptOut = vi.fn();
vi.mock("@/lib/dal/notifications", async () => ({
  CATEGORIES: ["new_sessions", "my_sessions", "reminders", "ratings", "social", "recognition", "certificates", "moderation", "proposals", "admin_queue", "account"],
  setPreference: (...args: unknown[]) => setPreference(...args),
  getPreferenceMatrix: (...args: unknown[]) => getPreferenceMatrix(...args),
}));
vi.mock("@/lib/dal/members", () => ({ setLeaderboardOptOut: (...args: unknown[]) => setLeaderboardOptOut(...args) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("server-only", () => ({}));

const { saveCategory, setEmailMaster, saveVisibility } = await import("@/app/[locale]/app/me/settings/actions");

const FIXED: NotificationCategory[] = ["certificates", "moderation", "account"];
const row = (category: NotificationCategory, email = true, inApp = true): CategoryPreference => ({
  category,
  switchable: !FIXED.includes(category),
  available: { inApp: true, email: true },
  enabled: { inApp, email },
  alwaysOn: [],
});
const MEMBER: NotificationCategory[] = ["new_sessions", "my_sessions", "reminders", "ratings", "social", "recognition", "proposals"];
const rows = (over: Partial<Record<NotificationCategory, [boolean, boolean]>> = {}, staff = false) =>
  [...MEMBER, ...(staff ? (["admin_queue"] as NotificationCategory[]) : []), ...FIXED].map((c) => row(c, ...(over[c] ?? [true, true])));

const form = (fields: Record<string, string>) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
};
const ON = { checked: true, failed: false };

beforeEach(() => {
  setPreference.mockReset().mockResolvedValue(undefined);
  setLeaderboardOptOut.mockReset().mockResolvedValue(undefined);
  getPreferenceMatrix.mockReset().mockResolvedValue({ rows: rows(), timeZone: "Asia/Riyadh" });
});

describe("a category switch (P8, DEC-218 §2.1)", () => {
  it("writes its email preference and sets in-app on beside it — through setPreference, nothing else", async () => {
    expect(await saveCategory("ar", ON, form({ category: "reminders" }))).toEqual({ checked: false, failed: false });
    expect(setPreference.mock.calls).toEqual([
      ["ar", { category: "reminders", channel: "email", enabled: false }],
      ["ar", { category: "reminders", channel: "in_app", enabled: true }],
    ]);
  });

  it("refuses a category the member's matrix does not offer as a switch — a fixed one, or admin_queue for a member", async () => {
    for (const category of ["certificates", "moderation", "account", "admin_queue", "nonsense"]) {
      expect(await saveCategory("ar", ON, form({ category }))).toEqual({ checked: true, failed: true });
    }
    expect(setPreference).not.toHaveBeenCalled();
  });

  it("a failed write puts the first one back and reports the refusal", async () => {
    setPreference.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("down"));
    expect(await saveCategory("ar", ON, form({ category: "social" }))).toEqual({ checked: true, failed: true });
    expect(setPreference.mock.calls.at(-1)).toEqual(["ar", { category: "social", channel: "email", enabled: true }]);
  });
});

describe("«إشعارات البريد» (DEC-219 §1)", () => {
  it("OFF writes email=false and in_app=true for every optional category the member may hold — never a fixed one", async () => {
    expect(await setEmailMaster("ar", ON, form({}))).toEqual({ checked: false, failed: false });
    const written = setPreference.mock.calls.map(([, input]) => input as { category: string; channel: string; enabled: boolean });
    expect(written.filter((w) => w.channel === "email").map((w) => [w.category, w.enabled])).toEqual(MEMBER.map((c) => [c, false]));
    expect(written.filter((w) => w.channel === "in_app").every((w) => w.enabled)).toBe(true);
    for (const fixed of [...FIXED, "admin_queue"]) expect(written.some((w) => w.category === fixed)).toBe(false);
  });

  it("staff: admin_queue is written too", async () => {
    getPreferenceMatrix.mockResolvedValue({ rows: rows({}, true), timeZone: "Asia/Riyadh" });
    await setEmailMaster("ar", ON, form({}));
    expect(setPreference.mock.calls.some(([, i]) => (i as { category: string }).category === "admin_queue")).toBe(true);
  });

  it("★ M5 — ON after three categories were silenced turns all of them back on: the owner's accepted trade, not a bug", async () => {
    getPreferenceMatrix.mockResolvedValue({ rows: rows({ social: [false, true], ratings: [false, true], reminders: [false, true] }), timeZone: "Asia/Riyadh" });
    expect(await setEmailMaster("ar", { checked: false, failed: false }, form({ enabled: "on" }))).toEqual({ checked: true, failed: false });
    const emailOn = setPreference.mock.calls.filter(([, i]) => (i as { channel: string }).channel === "email").map(([, i]) => i);
    expect(emailOn).toEqual(MEMBER.map((category) => ({ category, channel: "email", enabled: true })));
  });

  it("M4 — a failure on the fourth write reverts the three before it, in reverse, to what they held, and re-derives", async () => {
    getPreferenceMatrix.mockResolvedValue({ rows: rows({ my_sessions: [true, false] }), timeZone: "Asia/Riyadh" });
    setPreference
      .mockResolvedValueOnce(undefined) // new_sessions email
      .mockResolvedValueOnce(undefined) // new_sessions in_app
      .mockResolvedValueOnce(undefined) // my_sessions email
      .mockRejectedValueOnce(new Error("down")); // my_sessions in_app
    const result = await setEmailMaster("ar", ON, form({}));
    expect(result).toEqual({ checked: true, failed: true }); // the fresh read is all-on again
    expect(setPreference.mock.calls.slice(4)).toEqual([
      ["ar", { category: "my_sessions", channel: "email", enabled: true }],
      ["ar", { category: "new_sessions", channel: "in_app", enabled: true }],
      ["ar", { category: "new_sessions", channel: "email", enabled: true }],
    ]);
  });
});

describe("«الظهور في لوحات الصدارة» (O1, REQ-LDR-008)", () => {
  it("on is NOT opted out; off is — through the one-column writer", async () => {
    expect(await saveVisibility("ar", { checked: false, failed: false }, form({ enabled: "on" }))).toEqual({ checked: true, failed: false });
    expect(await saveVisibility("ar", ON, form({}))).toEqual({ checked: false, failed: false });
    expect(setLeaderboardOptOut.mock.calls).toEqual([
      ["ar", false],
      ["ar", true],
    ]);
  });

  it("a refused write keeps the switch where it was", async () => {
    setLeaderboardOptOut.mockRejectedValueOnce(new Error("down"));
    expect(await saveVisibility("ar", ON, form({}))).toEqual({ checked: true, failed: true });
  });
});

// The presenters section's two Server Actions and the DAL beneath them
// (REQ-SES-019, DEC-174). Shape and wording only — authority is the RPCs',
// proven in `tests/rls/session-presenters-admin.test.ts`.
//
// A NEW file (wave-12 rule 3).
import { beforeEach, describe, expect, it, vi } from "vitest";
import scheduleAr from "@/messages/ar/schedule.json";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));

const ERRORS = scheduleAr.schedule.presenters.errors;
vi.mock("next-intl/server", () => ({
  getTranslations: async () => {
    const t = (key: string) => (ERRORS as Record<string, string>)[key];
    t.has = (key: string) => key in ERRORS;
    return t;
  },
}));

const SESSION = "00000000-0000-4000-8000-0000000000cc";
const MEMBER = "00000000-0000-4000-8000-0000000000dd";

const rpc = vi.fn();
vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: "me", orgId: "org", role: "admin" }, supabase: { rpc } }),
}));

const { presenterChangeError, addSessionPresenter, PRESENTER_CHANGE_ERRORS } = await import("@/lib/dal/sessions");
const { addPresenter, removePresenter } = await import("@/app/[locale]/app/admin/sessions/[id]/schedule/actions");

const form = (memberId?: string) => {
  const fd = new FormData();
  if (memberId !== undefined) fd.set("memberId", memberId);
  return fd;
};

beforeEach(() => rpc.mockReset());

describe("presenterChangeError", () => {
  it("reads every refusal the RPCs raise, by name, out of a Postgres message", () => {
    for (const code of PRESENTER_CHANGE_ERRORS) expect(presenterChangeError(code)).toBe(code);
    expect(presenterChangeError('new row violates check: "last_presenter"')).toBe("last_presenter");
  });

  it("names nothing it was not given — a fault is not a refusal", () => {
    expect(presenterChangeError("connection reset")).toBeNull();
    expect(presenterChangeError("xlast_presenterx")).toBeNull();
  });

  it("every refusal is worded, in Arabic, on the screen", () => {
    for (const code of PRESENTER_CHANGE_ERRORS) expect(ERRORS[code as keyof typeof ERRORS], code).toBeTruthy();
  });
});

describe("addSessionPresenter", () => {
  it("calls the RPC with the session and member, and returns a named refusal as a value", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "member_checked_in" } });
    expect(await addSessionPresenter("ar", SESSION, MEMBER)).toEqual({ ok: false, error: "member_checked_in" });
    expect(rpc).toHaveBeenCalledWith("add_session_presenter", { p_session: SESSION, p_member: MEMBER });
  });

  it("throws on a fault it cannot name", async () => {
    rpc.mockResolvedValueOnce({ error: { message: "boom" } });
    await expect(addSessionPresenter("ar", SESSION, MEMBER)).rejects.toThrow(/add_session_presenter: boom/);
  });
});

describe("addPresenter (the Server Action)", () => {
  it("nobody chosen is `pick`, and the RPC is never called", async () => {
    expect(await addPresenter("ar", SESSION, { status: "idle" }, form())).toEqual({ status: "refused", error: "pick", memberId: null });
    expect(await addPresenter("ar", SESSION, { status: "idle" }, form("not-a-uuid"))).toMatchObject({ error: "pick" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("added, or refused with the member handed back", async () => {
    rpc.mockResolvedValueOnce({ error: null });
    expect(await addPresenter("ar", SESSION, { status: "idle" }, form(MEMBER))).toEqual({ status: "added", memberId: MEMBER });
    rpc.mockResolvedValueOnce({ error: { message: "already_presenter" } });
    expect(await addPresenter("ar", SESSION, { status: "idle" }, form(MEMBER))).toEqual({ status: "refused", error: "already_presenter", memberId: MEMBER });
    rpc.mockResolvedValueOnce({ error: { message: "boom" } });
    expect(await addPresenter("ar", SESSION, { status: "idle" }, form(MEMBER))).toEqual({ status: "refused", error: "failed", memberId: MEMBER });
  });
});

describe("removePresenter (the Server Action)", () => {
  it("returns nothing on success, and the refusal already worded", async () => {
    rpc.mockResolvedValueOnce({ error: null });
    expect(await removePresenter("ar", SESSION, MEMBER)).toBeUndefined();
    expect(rpc).toHaveBeenCalledWith("remove_session_presenter", { p_session: SESSION, p_member: MEMBER });

    rpc.mockResolvedValueOnce({ error: { message: "last_presenter" } });
    expect(await removePresenter("ar", SESSION, MEMBER)).toEqual({ error: ERRORS.last_presenter });
    rpc.mockResolvedValueOnce({ error: { message: "boom" } });
    expect(await removePresenter("ar", SESSION, MEMBER)).toEqual({ error: ERRORS.failed });
  });
});

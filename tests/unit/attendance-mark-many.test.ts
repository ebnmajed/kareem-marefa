// SCR-044's manual mark, several members at once — DEC-299 (REQ-SES-025, REQ-CHK-008).
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
const markCheckedInManually = vi.fn();
vi.mock("@/lib/dal/checkin", () => ({
  markCheckedInManually,
  manualCheckInInput: z.object({ memberId: z.uuid(), reason: z.string().trim().min(1).max(300) }),
  removeCheckIn: vi.fn(),
  removeCheckInInput: z.object({}),
  revokeCodeResult: vi.fn(),
  setCheckInOpen: vi.fn(),
}));

const { markManually } = await import("@/app/[locale]/app/admin/sessions/[id]/attendance/actions");

const SESSION = "00000000-0000-4000-8000-000000000001";
const A = "00000000-0000-4000-8000-00000000000a";
const B = "00000000-0000-4000-8000-00000000000b";
const C = "00000000-0000-4000-8000-00000000000c";

function form(ids: string[], reason: string) {
  const fd = new FormData();
  for (const id of ids) fd.append("memberId", id);
  fd.set("reason", reason);
  fd.set("dayId", "");
  return fd;
}

beforeEach(() => markCheckedInManually.mockReset());

describe("markManually — many members, one reason", () => {
  it("marks each selected member once, in order, with the one reason", async () => {
    markCheckedInManually.mockResolvedValue({ ok: true, arrivedAt: "2026-01-01T10:00:00Z" });
    const state = await markManually("ar", SESSION, { error: null, done: false }, form([A, B, A, C], "سُجّلت بأثر رجعي"));
    expect(state).toMatchObject({ error: null, done: true, marked: 3 });
    expect(markCheckedInManually.mock.calls.map((c) => c[2])).toEqual([A, B, C]);
    expect(markCheckedInManually.mock.calls.every((c) => c[3] === "سُجّلت بأثر رجعي")).toBe(true);
  });

  it("stops at the first refusal and keeps the members not yet marked selected", async () => {
    markCheckedInManually.mockResolvedValueOnce({ ok: true, arrivedAt: "x" }).mockResolvedValueOnce({ ok: false, error: "presenter_cannot_check_in" });
    const state = await markManually("ar", SESSION, { error: null, done: false }, form([A, B, C], "سبب"));
    expect(state).toMatchObject({ error: "presenter_cannot_check_in", done: false, marked: 1, memberIds: [B, C] });
    expect(markCheckedInManually).toHaveBeenCalledTimes(2);
  });

  it("a blank reason marks nobody", async () => {
    const state = await markManually("ar", SESSION, { error: null, done: false }, form([A, B], "  "));
    expect(state.error).toBe("reason_required");
    expect(markCheckedInManually).not.toHaveBeenCalled();
  });

  it("one member is the call it always was", async () => {
    markCheckedInManually.mockResolvedValue({ ok: true, arrivedAt: "x" });
    const state = await markManually("ar", SESSION, { error: null, done: false }, form([A], "نسي الهاتف"));
    expect(state).toMatchObject({ error: null, done: true, marked: 1 });
    expect(markCheckedInManually).toHaveBeenCalledWith("ar", SESSION, A, "نسي الهاتف", null);
  });
});

// REQ-CHK-017, REQ-UIX-013 — SCR-044's revoke. ★ Re-pointed in wave 21 (DEC-208): the removal form was deleted and the
// revoke is now the row menu's «ألغِ الحضور» → a dialog naming the member and the session, with the mandatory reason
// inside it. Every case the old file held is kept, against the new control; each change is a ledger line in STATUS.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { RemoveState } from "@/app/[locale]/app/admin/sessions/[id]/attendance/actions";
import { KHALID, SARA, renderBoard, row } from "./attendance-board-fixture";

type RemoveAction = (prev: RemoveState, formData: FormData) => Promise<RemoveState>;

async function openRevoke(name = "سارة العتيبي") {
  await userEvent.click(screen.getAllByRole("button", { name: `إجراءات ${name}` })[0]);
  await userEvent.click(await screen.findByRole("menuitem", { name: "ألغِ الحضور" }));
  return screen.findByRole("dialog");
}

describe("SCR-044's revoke (REQ-CHK-017)", () => {
  it("offers no revoke when no one is checked in — the row menu holds nothing to revoke", async () => {
    renderBoard({ rows: [KHALID] });
    await userEvent.click(screen.getAllByRole("button", { name: "إجراءات خالد الحربي" })[0]);
    expect(screen.queryByRole("menuitem", { name: "ألغِ الحضور" })).toBeNull();
  });

  it("a row with nothing to do draws no menu at all", () => {
    renderBoard({ rows: [row({ memberId: "m3", name: "نورة", status: "none" })] });
    expect(screen.queryByRole("button", { name: "إجراءات نورة" })).toBeNull();
  });

  it("the confirm stays disabled until a reason is given", async () => {
    renderBoard();
    const dialog = await openRevoke();
    const confirm = within(dialog).getByRole("button", { name: "ألغِ تسجيل الحضور" });
    expect(confirm).toBeDisabled();
    await userEvent.type(within(dialog).getByLabelText("سبب الإلغاء", { exact: false }), "خطأ في التسجيل");
    expect(confirm).toBeEnabled();
  });

  it("★ the dialog names both the member and the session (REQ-UIX-013)", async () => {
    renderBoard();
    const dialog = await openRevoke();
    expect(within(dialog).getByText("سارة العتيبي", { exact: false })).toBeInTheDocument();
    expect(within(dialog).getByText("جلسة اختبار", { exact: false })).toBeInTheDocument();
  });

  it("cancelling the dialog never calls the action", async () => {
    const action = vi.fn<RemoveAction>(async () => ({ error: null, done: true }));
    renderBoard({ removeAction: action });
    const dialog = await openRevoke();
    await userEvent.type(within(dialog).getByLabelText("سبب الإلغاء", { exact: false }), "خطأ");
    await userEvent.click(within(dialog).getByRole("button", { name: "تراجع" }));
    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("confirming submits the member, the day and the reason, and closes on success", async () => {
    const action = vi.fn<RemoveAction>(async () => ({ error: null, done: true }));
    renderBoard({ removeAction: action });
    const dialog = await openRevoke();
    await userEvent.type(within(dialog).getByLabelText("سبب الإلغاء", { exact: false }), "خطأ في التسجيل");
    await userEvent.click(within(dialog).getByRole("button", { name: "ألغِ تسجيل الحضور" }));
    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const fd = action.mock.calls[0][1];
    expect(fd.get("memberId")).toBe(SARA.memberId);
    expect(fd.get("dayId")).toBe("d1");
    expect(fd.get("reason")).toBe("خطأ في التسجيل");
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows the app's own refusal, not a silently blocked submission, when the RPC refuses", async () => {
    renderBoard({ removeAction: async () => ({ error: "not_an_admin", done: false }) });
    const dialog = await openRevoke();
    await userEvent.type(within(dialog).getByLabelText("سبب الإلغاء", { exact: false }), "خطأ");
    await userEvent.click(within(dialog).getByRole("button", { name: "ألغِ تسجيل الحضور" }));
    expect(await within(screen.getByRole("dialog")).findByRole("alert")).toHaveTextContent("إلغاء تسجيل الحضور متاح للمشرف العام فقط");
  });

  it("the form has noValidate — the app's own error is the only validator, never a native bubble", async () => {
    renderBoard();
    const dialog = await openRevoke();
    expect(dialog.querySelector("form")).toHaveAttribute("novalidate");
  });
});

// SCR-044 at three days, and at one — DEC-119, DEC-150 contract 4. ★ Re-pointed in wave 21 (DEC-208): the day is now
// the page's chip (`?day=`), not a select inside each form, so the rule this file guards becomes: the mark and the
// revoke SEND the day the page is showing, at one day too (a hidden field, never the clock's answer), and the lists
// are that day's. Each changed case is a ledger line in STATUS.
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ManualMarkState, RemoveState } from "@/app/[locale]/app/admin/sessions/[id]/attendance/actions";
import { KHALID, SARA, renderBoard, row } from "./attendance-board-fixture";

describe("the day travels with every write (DEC-119)", () => {
  it("the manual mark sends the day the page shows, and offers only that day's missing members", async () => {
    const action = vi.fn<(p: ManualMarkState, f: FormData) => Promise<ManualMarkState>>(async () => ({ error: null, done: true }));
    renderBoard({ dayId: "d2", markAction: action, candidates: [{ value: "m2", label: "خالد الحربي" }] });
    await userEvent.click(screen.getByRole("button", { name: "تسجيل يدوي" }));
    const sheet = await screen.findByRole("dialog", { name: "تسجيل حضور يدوي" });
    const combo = within(sheet).getByRole("combobox");
    await userEvent.click(combo);
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["خالد الحربي"]);
    await userEvent.click(screen.getByRole("option", { name: "خالد الحربي" }));
    await userEvent.type(within(sheet).getByLabelText("السبب", { exact: false }), "حضر ولم يُسجَّل رمزه");
    await userEvent.click(within(sheet).getByRole("button", { name: "سجّل حضوره" }));
    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const fd = action.mock.calls[0][1];
    expect(fd.get("dayId")).toBe("d2");
    expect(fd.get("memberId")).toBe("m2");
  });

  it("the row menu's «سجّل حضوره» opens the sheet with that member already chosen", async () => {
    const action = vi.fn<(p: ManualMarkState, f: FormData) => Promise<ManualMarkState>>(async () => ({ error: null, done: true }));
    renderBoard({ markAction: action });
    await userEvent.click(screen.getAllByRole("button", { name: "إجراءات خالد الحربي" })[0]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "سجّل حضوره" }));
    const sheet = await screen.findByRole("dialog", { name: "تسجيل حضور يدوي" });
    await userEvent.type(within(sheet).getByLabelText("السبب", { exact: false }), "سبب");
    await userEvent.click(within(sheet).getByRole("button", { name: "سجّل حضوره" }));
    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0][1].get("memberId")).toBe("m2");
  });

  it("the revoke sends the day the page shows", async () => {
    const action = vi.fn<(p: RemoveState, f: FormData) => Promise<RemoveState>>(async () => ({ error: null, done: true }));
    renderBoard({ dayId: "d3", removeAction: action });
    await userEvent.click(screen.getAllByRole("button", { name: "إجراءات سارة العتيبي" })[0]);
    await userEvent.click(await screen.findByRole("menuitem", { name: "ألغِ الحضور" }));
    const dialog = await screen.findByRole("dialog");
    await userEvent.type(within(dialog).getByLabelText("سبب الإلغاء", { exact: false }), "خطأ");
    await userEvent.click(within(dialog).getByRole("button", { name: "ألغِ تسجيل الحضور" }));
    await vi.waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0][1].get("dayId")).toBe("d3");
  });

  it("above one day the table carries «الأيام» and «مكتمل»; at one day it carries neither", () => {
    const { unmount } = renderBoard({ manyDays: true, rows: [{ ...SARA, days: "2 من 3", complete: true }, KHALID] });
    expect(screen.getAllByRole("columnheader", { name: "الأيام" })).toHaveLength(1);
    expect(screen.getAllByText("مكتمل").length).toBeGreaterThan(0);
    unmount();
    renderBoard();
    expect(screen.queryByRole("columnheader", { name: "الأيام" })).toBeNull();
  });

  it("before the day begins a confirmed member reads «—», not «لم يحضر» (D7)", () => {
    renderBoard({ rows: [row({ memberId: "m4", name: "ريم", status: "none" })] });
    const table = screen.getByRole("table");
    expect(within(table).queryByText("لم يحضر")).toBeNull();
  });

  it("the sheet and the dialog are noValidate", async () => {
    renderBoard();
    await userEvent.click(screen.getByRole("button", { name: "تسجيل يدوي" }));
    expect((await screen.findByRole("dialog", { name: "تسجيل حضور يدوي" })).querySelector("form")).toHaveAttribute("novalidate");
  });
});

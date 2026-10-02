// SCR-042's row actions (REQ-SES-005, REQ-UIX-013) — the cancel confirmation
// and the early-completion confirmation, proved in jsdom against a fake action.
//
// ★ Wave 21 (DEC-208), ledger L6: `SessionControls` (buttons under the table,
// the reason behind a `<details>`, «أكّد الإلغاء» before the dialog) became
// `SessionRowActions` (the row's ⋯, the reason inside the dialog). The two
// behaviours this file pinned are kept: the dialog names the session and
// submits the typed reason; an empty reason shows the app's own error.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { SessionRowActions } from "@/app/[locale]/app/admin/sessions/session-controls";
import ar from "@/messages/ar/admin.json";

type TransitionState = { error: string | null; done: boolean };
type TransitionAction = (prev: TransitionState, fd: FormData) => Promise<TransitionState>;

function renderActions(action: TransitionAction, actions: ("cancel" | "complete")[] = ["cancel"], endsAt: string | null = null) {
  render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <SessionRowActions title="جلسة تجريبية" links={[]} actions={actions} action={action} endsAt={endsAt} />
    </NextIntlClientProvider>,
  );
}

async function choose(name: string) {
  await userEvent.click(screen.getByRole("button", { name: /مزيد من الإجراءات على جلسة تجريبية/ }));
  await userEvent.click(await screen.findByRole("menuitem", { name }));
}

describe("SessionRowActions — cancel confirmation", () => {
  it("★ the dialog names the session, and confirming submits the typed reason", async () => {
    const action = vi.fn<TransitionAction>().mockResolvedValue({ error: null, done: true });
    renderActions(action);
    await choose("ألغِ الجلسة");
    const dialog = await screen.findByRole("dialog", { name: "إلغاء «جلسة تجريبية»؟" });
    expect(action).not.toHaveBeenCalled();
    await userEvent.type(within(dialog).getByLabelText(/سبب الإلغاء الذي سيصل الحاضرين/), "انقطاع الكهرباء");
    await userEvent.click(within(dialog).getByRole("button", { name: "تأكيد الإلغاء" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const fd = action.mock.calls[0][1];
    expect(fd.get("action")).toBe("cancel");
    expect(fd.get("reason")).toBe("انقطاع الكهرباء");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("an empty cancel reason shows the app's own error, at the field", async () => {
    const action = vi.fn<TransitionAction>().mockResolvedValue({ error: "cancelReasonRequired", done: false });
    renderActions(action);
    await choose("ألغِ الجلسة");
    const dialog = await screen.findByRole("dialog");
    await userEvent.click(within(dialog).getByRole("button", { name: "تأكيد الإلغاء" }));
    expect(await within(dialog).findByText("اكتب سبب الإلغاء أولًا.")).toBeInTheDocument();
  });
});

describe("SessionRowActions — completing early", () => {
  it("before the scheduled end, «أنهِ الجلسة» confirms with what it does to check-in", async () => {
    const action = vi.fn<TransitionAction>().mockResolvedValue({ error: null, done: true });
    renderActions(action, ["complete"], new Date(Date.now() + 3_600_000).toISOString());
    await choose("أنهِ الجلسة");
    const dialog = await screen.findByRole("dialog", { name: "إنهاء «جلسة تجريبية»؟" });
    expect(within(dialog).getByText("الإنهاء المبكر يغلق تسجيل الحضور فورًا.")).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole("button", { name: "أنهِ الجلسة" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(action.mock.calls[0][1].get("action")).toBe("complete");
  });

  it("after the scheduled end, one press", async () => {
    const action = vi.fn<TransitionAction>().mockResolvedValue({ error: null, done: true });
    renderActions(action, ["complete"], new Date(Date.now() - 3_600_000).toISOString());
    await choose("أنهِ الجلسة");
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

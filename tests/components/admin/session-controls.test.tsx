// SCR-042's SessionControls — the cancel flow's confirm dialog (REQ-UIX-013),
// proved in jsdom against a fake action, the same shape
// `proposals-review-card.test.tsx` already established for the sibling form.
// No test file existed for this component before — added alongside the
// `noValidate` sweep (`16` §8.2) rather than assumed still covered elsewhere.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { SessionControls } from "@/app/[locale]/app/admin/sessions/session-controls";
import ar from "@/messages/ar/admin.json";

type TransitionState = { error: string | null; done: boolean };
type TransitionAction = (prev: TransitionState, fd: FormData) => Promise<TransitionState>;

function renderControls(action: TransitionAction) {
  render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <SessionControls action={action} actions={["cancel"]} sessionTitle="جلسة تجريبية" />
    </NextIntlClientProvider>,
  );
}

describe("SessionControls — cancel confirmation", () => {
  it("★ the dialog names the session, and confirming submits the SAME form across the portal with the typed reason", async () => {
    const action = vi.fn<TransitionAction>().mockResolvedValue({ error: null, done: true });
    renderControls(action);

    await userEvent.click(screen.getByText("ألغِ الجلسة"));
    await userEvent.type(screen.getByLabelText("سبب الإلغاء الذي سيصل الحاضرين"), "تعارض في الجدول");
    await userEvent.click(screen.getByRole("button", { name: "أكّد الإلغاء" }));

    const dialog = await screen.findByRole("dialog", { name: "إلغاء «جلسة تجريبية»؟" });
    await userEvent.click(within(dialog).getByRole("button", { name: "تأكيد الإلغاء" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0][1] as FormData;
    expect(submitted.get("action")).toBe("cancel");
    expect(submitted.get("reason")).toBe("تعارض في الجدول");
  });

  // ★ The reason box has no `required` attribute at all (the component's own
  // header comment: it would sit inside a collapsed `<details>` and silently
  // block the whole form) — `noValidate` on the form is a house-convention
  // addition (`16` §8.2), not a fix for an active bug here. This proves the
  // round trip's own error still reaches the screen once the RPC refuses an
  // empty reason.
  it("an empty cancel reason shows the app's own error", async () => {
    const action = vi.fn<TransitionAction>().mockResolvedValue({ error: "cancelReasonRequired", done: false });
    renderControls(action);

    await userEvent.click(screen.getByText("ألغِ الجلسة"));
    await userEvent.click(screen.getByRole("button", { name: "أكّد الإلغاء" }));
    const dialog = await screen.findByRole("dialog", { name: "إلغاء «جلسة تجريبية»؟" });
    await userEvent.click(within(dialog).getByRole("button", { name: "تأكيد الإلغاء" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("اكتب سبب الإلغاء أولًا.")).toBeVisible();
  });
});

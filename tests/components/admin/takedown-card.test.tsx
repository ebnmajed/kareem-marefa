// SCR-051's TakedownCard — the remove flow's confirm dialog (REQ-UIX-013),
// restore staying one click with no dialog, proved in jsdom against a fake
// action. Same shape as `report-card.test.tsx` (reports' sibling); no test
// file existed for this component before — added alongside the `noValidate`
// sweep (`16` §8.2) rather than assumed still covered elsewhere.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { TakedownCard } from "@/app/[locale]/app/admin/moderation/photos/takedown-card";
import ar from "@/messages/ar/admin.json";

type ModerationState = { error: string | null; done: boolean };
type ModerationAction = (prev: ModerationState, fd: FormData) => Promise<ModerationState>;

function renderCard(action: ModerationAction) {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <TakedownCard action={action} photoUrl="https://example.com/photo.jpg" sessionTitle="جلسة الاختبار">
        <p>سياق الطلب</p>
      </TakedownCard>
    </NextIntlClientProvider>,
  );
}

describe("TakedownCard", () => {
  it("restore submits immediately, with no dialog", async () => {
    const action = vi.fn<ModerationAction>().mockResolvedValue({ error: null, done: true });
    renderCard(action);

    await userEvent.click(screen.getByRole("button", { name: "أعد الإظهار" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const submitted = action.mock.calls[0][1] as FormData;
    expect(submitted.get("action")).toBe("restore");
  });

  it("★ removing confirms in a dialog naming the session, and the reason travels through the portalled form", async () => {
    const action = vi.fn<ModerationAction>().mockResolvedValue({ error: null, done: true });
    renderCard(action);

    await userEvent.click(screen.getByRole("button", { name: "أزل" }));
    const dialog = await screen.findByRole("dialog", { name: "حذف صورة من «جلسة الاختبار»؟" });
    await userEvent.type(within(dialog).getByLabelText("السبب الذي يُسجَّل في سجل التدقيق", { exact: false }), "طلب مكرر");
    await userEvent.click(within(dialog).getByRole("button", { name: "أرسل" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0][1] as FormData;
    expect(submitted.get("action")).toBe("remove");
    expect(submitted.get("reason")).toBe("طلب مكرر");
  });

  it("cancelling the dialog never calls the action", async () => {
    const action = vi.fn<ModerationAction>().mockResolvedValue({ error: null, done: false });
    renderCard(action);

    await userEvent.click(screen.getByRole("button", { name: "أزل" }));
    const dialog = await screen.findByRole("dialog", { name: "حذف صورة من «جلسة الاختبار»؟" });
    await userEvent.click(within(dialog).getByRole("button", { name: "تراجع" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(action).not.toHaveBeenCalled();
  });

  // ★ The dialog's own `<form>` has `noValidate` — the reason field's
  // `required` is `<Field>`-context-only, never a native attribute here, so
  // nothing was ever going to block this submission. This proves the OTHER
  // half of `16` §8.2's rule: once the round trip returns `reason_required`,
  // the app's own inline `<Field>` error actually renders.
  it("an empty reason shows the app's own inline error, not a silently blocked submission", async () => {
    const action = vi.fn<ModerationAction>().mockResolvedValue({ error: "reason_required", done: false });
    renderCard(action);

    await userEvent.click(screen.getByRole("button", { name: "أزل" }));
    const dialog = await screen.findByRole("dialog", { name: "حذف صورة من «جلسة الاختبار»؟" });
    await userEvent.click(within(dialog).getByRole("button", { name: "أرسل" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(await within(dialog).findByText("اكتب السبب أولًا.")).toBeVisible();
    expect(dialog).toBeVisible();
  });

  it("has no axe violations, closed or with the remove dialog open", async () => {
    const { container } = renderCard(vi.fn<ModerationAction>().mockResolvedValue({ error: null, done: false }));
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "أزل" }));
    await screen.findByRole("dialog");
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  }, 20000);
});

// SCR-052's ReportCard — the remove flow's confirm dialog (REQ-UIX-013) and
// dismiss's separate, undialogued form, proved in jsdom against a fake
// action. `tests/e2e/admin-reports.spec.ts` proves the same shape end to
// end; this file is the fast, cheap check for the wiring itself.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { ReportCard } from "@/app/[locale]/app/admin/moderation/reports/report-card";
import ar from "@/messages/ar/admin.json";

type ModerationState = { error: string | null; done: boolean };
type ModerationAction = (prev: ModerationState, fd: FormData) => Promise<ModerationState>;

function renderCard(action: ModerationAction) {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <ReportCard action={action} photoUrl="https://example.com/photo.jpg" sessionTitle="جلسة الاختبار">
        <p>سياق البلاغ</p>
      </ReportCard>
    </NextIntlClientProvider>,
  );
}

describe("ReportCard", () => {
  it("dismiss submits immediately, with no dialog", async () => {
    const action = vi.fn<ModerationAction>().mockResolvedValue({ error: null, done: true });
    renderCard(action);

    await userEvent.click(screen.getByRole("button", { name: "تجاهل البلاغ" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    const submitted = action.mock.calls[0][1] as FormData;
    expect(submitted.get("action")).toBe("dismiss");
  });

  it("★ removing confirms in a dialog naming the session, and the reason travels through the portalled form", async () => {
    const action = vi.fn<ModerationAction>().mockResolvedValue({ error: null, done: true });
    renderCard(action);

    await userEvent.click(screen.getByRole("button", { name: "أزل" }));
    const dialog = await screen.findByRole("dialog", { name: "حذف صورة من «جلسة الاختبار»؟" });
    await userEvent.type(within(dialog).getByLabelText("السبب الذي يُسجَّل في سجل التدقيق", { exact: false }), "محتوى غير لائق");
    await userEvent.click(within(dialog).getByRole("button", { name: "أرسل" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0][1] as FormData;
    expect(submitted.get("action")).toBe("remove");
    expect(submitted.get("reason")).toBe("محتوى غير لائق");
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

  it("has no axe violations, closed or with the remove dialog open", async () => {
    const { container } = renderCard(vi.fn<ModerationAction>().mockResolvedValue({ error: null, done: false }));
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
    await userEvent.click(screen.getByRole("button", { name: "أزل" }));
    await screen.findByRole("dialog");
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false } } })).violations).toEqual([]);
  }, 20000);
});

// SCR-041's ReviewCard — the reject flow's confirm dialog (REQ-UIX-013),
// proved in jsdom against a fake action so it does not need real Supabase.
// `tests/e2e/admin-proposals.spec.ts` proves the same shape end to end; this
// file is the fast, cheap check for the wiring itself — the dialog naming
// the proposal, cancel never submitting, confirm submitting the SAME form
// across a Radix portal (`form={id}`, not DOM ancestry).
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { ReviewCard } from "@/app/[locale]/app/admin/proposals/review-card";
import ar from "@/messages/ar/admin.json";

function renderCard(action: (prev: { error: string | null; done: boolean; reason: string }, fd: FormData) => Promise<{ error: string | null; done: boolean; reason: string }>) {
  render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <ReviewCard action={action} proposalId="p1" proposalTitle="مقترح تجريبي">
        <h2>مقترح تجريبي</h2>
      </ReviewCard>
    </NextIntlClientProvider>,
  );
  // ★ jsdom does not hide a closed <details>'s content from queries the way a
  // real browser/Playwright does — scoping to the reject `<details>`
  // specifically is what the e2e spec gets from the browser's own
  // accessibility tree for free. (Each decision's reason box has its own
  // label now — `reasonLabelReject`/`reasonLabelRequestChanges` — a real
  // build's own run found them sharing one before.)
  const rejectDetails = screen.getByText("ارفض المقترح").closest("details")!;
  return within(rejectDetails);
}

describe("ReviewCard — reject confirmation", () => {
  it("★ the dialog names the proposal, and cancel never calls the action", async () => {
    const action = vi.fn().mockResolvedValue({ error: null, done: false, reason: "" });
    const reject = renderCard(action);

    await userEvent.click(reject.getByText("ارفض المقترح"));
    await userEvent.type(reject.getByLabelText("سبب الرفض الذي سيصل صاحب المقترح"), "سبب الرفض");
    await userEvent.click(reject.getByRole("button", { name: "أرسل" }));

    const dialog = await screen.findByRole("dialog", { name: "رفض «مقترح تجريبي»؟" });
    expect(dialog).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "تراجع" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(action).not.toHaveBeenCalled();
  });

  it("confirming submits the SAME form across the dialog's portal, with action=reject", async () => {
    const action = vi.fn().mockResolvedValue({ error: null, done: true, reason: "" });
    const reject = renderCard(action);

    await userEvent.click(reject.getByText("ارفض المقترح"));
    await userEvent.type(reject.getByLabelText("سبب الرفض الذي سيصل صاحب المقترح"), "سبب الرفض");
    await userEvent.click(reject.getByRole("button", { name: "أرسل" }));
    await userEvent.click(await screen.findByRole("button", { name: "تأكيد الرفض" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0][1] as FormData;
    expect(submitted.get("action")).toBe("reject");
    expect(submitted.get("proposalId")).toBe("p1");
    expect(submitted.get("reason-reject")).toBe("سبب الرفض");
  });

  it("approving needs no dialog and calls the action directly", async () => {
    const action = vi.fn().mockResolvedValue({ error: null, done: true, reason: "" });
    renderCard(action);

    await userEvent.click(screen.getByRole("button", { name: "اعتمد المقترح" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect((action.mock.calls[0][1] as FormData).get("action")).toBe("approve");
  });
});

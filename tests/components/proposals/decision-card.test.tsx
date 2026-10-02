// SCR-041's decision card (REQ-PRO-005, REQ-UIX-013, REQ-UIX-088) — the review card's four cases, carried against the
// card that replaced it (W21.7), and the two the rebuild adds: approval refuses a typed message (DEC-228 §4.1), and a
// decision hands focus to the next proposal in the queue.
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { DecisionCard } from "@/app/[locale]/app/admin/proposals/_components/decision-card";
import { SplitView } from "@/components/ui/split-view";
import ar from "@/messages/ar/proposals.json";

type State = { error: string | null; done: boolean; reason: string };

function mount(action: (prev: State, fd: FormData) => Promise<State>) {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <SplitView
        label="المقترحات"
        narrow="list"
        currentId="p1"
        items={[
          { id: "p1", href: "/app/admin/proposals/p1", children: "مقترح تجريبي" },
          { id: "p2", href: "/app/admin/proposals/p2", children: "المقترح التالي" },
        ]}
        detail={<DecisionCard action={action} proposalId="p1" proposalTitle="مقترح تجريبي" />}
      />
    </NextIntlClientProvider>,
  );
}

const box = () => screen.getByLabelText("رسالة للمقترِح");

describe("DecisionCard", () => {
  it("★ «ارفض» opens a dialog naming the proposal, and «تراجع» never calls the action", async () => {
    const action = vi.fn();
    mount(action);
    await userEvent.type(box(), "سبب الرفض");
    await userEvent.click(screen.getByRole("button", { name: "ارفض" }));
    expect(await screen.findByRole("dialog", { name: "رفض «مقترح تجريبي»؟" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "تراجع" }));
    expect(action).not.toHaveBeenCalled();
  });

  it("confirming submits the SAME form across the dialog's portal, with action=reject and the one message", async () => {
    const action = vi.fn().mockResolvedValue({ error: null, done: true, reason: "" });
    mount(action);
    await userEvent.type(box(), "سبب الرفض");
    await userEvent.click(screen.getByRole("button", { name: "ارفض" }));
    await userEvent.click(await screen.findByRole("button", { name: "تأكيد الرفض" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0][1] as FormData;
    expect(submitted.get("action")).toBe("reject");
    expect(submitted.get("proposalId")).toBe("p1");
    expect(submitted.get("reason")).toBe("سبب الرفض");
  });

  it("approving needs no dialog and calls the action directly", async () => {
    const action = vi.fn().mockResolvedValue({ error: null, done: true, reason: "" });
    mount(action);
    await userEvent.click(screen.getByRole("button", { name: "اعتمد" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect((action.mock.calls[0][1] as FormData).get("action")).toBe("approve");
  });

  it("an empty message on «اطلب تعديلًا» is said at the box", async () => {
    const action = vi.fn().mockResolvedValue({ error: "reasonRequired", done: false, reason: "" });
    mount(action);
    await userEvent.click(screen.getByRole("button", { name: "اطلب تعديلًا" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(ar.proposals.review.reasonRequired)).toBeVisible();
    expect(box()).toHaveAttribute("aria-invalid", "true");
  });

  it("★ a message typed before «اعتمد» comes back at the box, kept — never discarded in silence (DEC-228 §4.1)", async () => {
    const action = vi.fn().mockResolvedValue({ error: "approveWithMessage", done: false, reason: "شكرًا" });
    mount(action);
    await userEvent.type(box(), "شكرًا");
    await userEvent.click(screen.getByRole("button", { name: "اعتمد" }));
    expect(await screen.findByText(ar.proposals.review.approveWithMessage)).toBeVisible();
    expect(box()).toHaveValue("شكرًا");
  });

  it("★ after a decision, focus lands on the next proposal in the queue — one Enter away", async () => {
    const action = vi.fn().mockResolvedValue({ error: null, done: true, reason: "" });
    mount(action);
    await userEvent.click(screen.getByRole("button", { name: "اعتمد" }));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByRole("link", { name: "المقترح التالي" })));
  });
});

// `RemovePresenter` — the proposal's confirm (REQ-PRO-003), generalised in
// wave 12 so SCR-043 can say «session» where the proposal says «proposal»
// (REQ-SES-019, DEC-174).
//
// ★ THE FIRST CASE IS THE CONTRACT: without `messages` it says exactly what it
// said before wave 12, from `proposals.proposal.*`. No test covered the
// component until this file, so that path is pinned here first.
//
// A NEW file (wave-12 rule 3).
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import proposalsAr from "@/messages/ar/proposals.json";
import uiAr from "@/messages/ar/ui.json";
import { RemovePresenter } from "@/components/sessions/remove-presenter";

const MESSAGES = { ...proposalsAr, ...uiAr };
const P = proposalsAr.proposals.proposal;

function mount(ui: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="ar" messages={MESSAGES}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("★ without `messages`, the proposal's words, unchanged", () => {
  it("names the person, in <bdi>, on the trigger and in the confirm", async () => {
    mount(<RemovePresenter name="سارة العتيبي" action={async () => {}} />);
    const trigger = screen.getByRole("button", { name: "أزل سارة العتيبي من المقدّمين" });
    expect(trigger.querySelector("bdi")?.textContent).toBe("سارة العتيبي");

    await userEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "إزالة سارة العتيبي من المُقدِّمين؟" });
    expect(dialog).toHaveTextContent(P.removeConfirmBody);
    expect(screen.getByRole("button", { name: P.removeConfirm })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: P.cancel })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("confirming runs the action once, and a void result shows nothing", async () => {
    const action = vi.fn(async () => {});
    mount(<RemovePresenter name="سارة" action={action} />);
    await userEvent.click(screen.getByRole("button", { name: /أزل/ }));
    await userEvent.click(await screen.findByRole("button", { name: P.removeConfirm }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});

describe("the caller's words, and a refusal shown where it was pressed", () => {
  const messages = {
    trigger: <>أزل <bdi>خالد</bdi> من مُقدِّمي الجلسة</>,
    title: <>إزالة <bdi>خالد</bdi> من مُقدِّمي الجلسة؟</>,
    body: "لن يظهر اسمه بين مُقدِّمي هذه الجلسة.",
    confirm: "أزل",
    cancel: "تراجع",
  };

  it("renders the caller's strings instead of the proposal's", async () => {
    mount(<RemovePresenter name="خالد" action={async () => {}} messages={messages} />);
    await userEvent.click(screen.getByRole("button", { name: "أزل خالد من مُقدِّمي الجلسة" }));
    const dialog = await screen.findByRole("dialog", { name: "إزالة خالد من مُقدِّمي الجلسة؟" });
    expect(dialog).toHaveTextContent(messages.body);
    expect(dialog).not.toHaveTextContent(P.removeConfirmBody);
  });

  it("a returned error is an alert inside the dialog, and the dialog stays open", async () => {
    const refusal = "لا يمكن إزالة آخر مُقدِّم في الجلسة. أضف غيره أولًا.";
    mount(<RemovePresenter name="خالد" action={async () => ({ error: refusal })} messages={messages} />);
    await userEvent.click(screen.getByRole("button", { name: /أزل خالد/ }));
    await userEvent.click(await screen.findByRole("button", { name: "أزل" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(refusal);
    expect(screen.getByRole("dialog")).toContainElement(alert);
  });
});

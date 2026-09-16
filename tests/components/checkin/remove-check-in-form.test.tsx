// REQ-CHK-017, C3 — the removal control's fast jsdom check. The lead's own
// note on why this replaces an e2e pass here: the local e2e build is a
// point-in-time `.next` (Playwright's `webServer` never rebuilds), so it
// cannot see same-session UI work until the lead's next sync build — this
// file is what actually exercises the wiring in the meantime, the same
// role `tests/components/admin/members-table.test.tsx` plays for its own
// dialog-confirmed destructive action.
//
// `RemoveCheckInForm` differs from that precedent's shape on purpose: the
// member and reason are chosen in the OUTER form (not inside the dialog),
// because the confirmation dialog's own text needs to read the current
// selection before the member ever submits anything (REQ-UIX-013: naming
// who AND which session). The dialog's own button is what actually
// triggers the request via `formRef.current?.requestSubmit()`.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { RemoveCheckInForm } from "@/app/[locale]/app/admin/sessions/[id]/attendance/remove-check-in-form";
import type { RemoveState } from "@/app/[locale]/app/admin/sessions/[id]/attendance/actions";
import type { UncheckedAttendee } from "@/lib/dal/checkin";
import checkinAr from "@/messages/ar/checkin.json";
import uiAr from "@/messages/ar/ui.json";

// `ui/field.tsx` (sessions' primitive, consumed by `Field`/`Select`/
// `Textarea` here) reads `ui.field.required` for the «مطلوب» marker it
// appends to every required label's own accessible name — a second
// namespace this form does not otherwise touch, merged in so
// `getByLabelText` sees the real Arabic word (`members-table.test.tsx`'s
// own established pattern for the identical reason).
const ar = { ...checkinAr, ...uiAr };

const CANDIDATES: UncheckedAttendee[] = [
  { memberId: "m1", displayName: "سارة العتيبي" },
  { memberId: "m2", displayName: "خالد الحربي" },
];

type RemoveAction = (prev: RemoveState, formData: FormData) => Promise<RemoveState>;

function renderForm(action: RemoveAction, candidates: UncheckedAttendee[] = CANDIDATES) {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <RemoveCheckInForm action={action} candidates={candidates} sessionTitle="جلسة اختبار" />
    </NextIntlClientProvider>,
  );
}

async function fillAndOpen() {
  // `{ exact: false }`: `<Field required>` appends «مطلوب» to the label's
  // own accessible name (REQ-UIX-011) — a real, permanent suffix, not
  // something to match verbatim here.
  await userEvent.selectOptions(screen.getByLabelText("العضو المراد إلغاء تسجيل حضوره", { exact: false }), "m1");
  await userEvent.type(screen.getByLabelText("سبب الإلغاء", { exact: false }), "خطأ في التسجيل");
  await userEvent.click(screen.getByRole("button", { name: "ألغِ تسجيل الحضور" }));
  return screen.findByRole("dialog", { name: "تأكيد إلغاء تسجيل الحضور" });
}

describe("RemoveCheckInForm", () => {
  it("shows the empty state and no controls when no one is currently checked in", () => {
    renderForm(vi.fn(), []);
    expect(screen.getByText("لا أحد مسجَّل حضوره حاليًا لإلغاء تسجيله.")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("the submit trigger stays disabled until both a member and a reason are given", async () => {
    renderForm(vi.fn<RemoveAction>());
    const trigger = screen.getByRole("button", { name: "ألغِ تسجيل الحضور" });
    expect(trigger).toBeDisabled();

    await userEvent.selectOptions(screen.getByLabelText("العضو المراد إلغاء تسجيل حضوره", { exact: false }), "m1");
    expect(trigger).toBeDisabled(); // a member alone is not enough

    await userEvent.type(screen.getByLabelText("سبب الإلغاء", { exact: false }), "خطأ في التسجيل");
    expect(trigger).toBeEnabled();
  });

  it("★ the confirm dialog names both the member and the session (REQ-UIX-013)", async () => {
    renderForm(vi.fn<RemoveAction>());
    const dialog = await fillAndOpen();
    expect(within(dialog).getByText("سارة العتيبي")).toBeInTheDocument();
    expect(within(dialog).getByText("جلسة اختبار")).toBeInTheDocument();
  });

  it("cancelling the dialog never calls the action", async () => {
    const action = vi.fn<RemoveAction>().mockResolvedValue({ error: null, done: true });
    renderForm(action);
    const dialog = await fillAndOpen();
    // Two controls answer to the accessible name "تراجع" here — `ui/dialog`'s
    // own icon close button (`closeLabel`) and this form's explicit Cancel
    // button share the same word by design (`takedown-button.tsx`'s
    // identical shape). `getByText` finds only the labelled one: the icon
    // button carries "تراجع" as an `aria-label`, never as visible text.
    await userEvent.click(within(dialog).getByText("تراجع"));
    expect(action).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("confirming submits the chosen member and reason, and shows the done message", async () => {
    const action = vi.fn<RemoveAction>().mockResolvedValue({ error: null, done: true });
    renderForm(action);
    const dialog = await fillAndOpen();
    // The trigger (now hidden behind the dialog) and the dialog's own
    // confirm button share a label on purpose — REQ-UIX-013's whole point
    // is that the SAME action reads the same either place; scoped to the
    // dialog is what a member actually clicks last.
    await userEvent.click(within(dialog).getByRole("button", { name: "ألغِ تسجيل الحضور" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    const submitted = action.mock.calls[0][1] as FormData;
    expect(submitted.get("memberId")).toBe("m1");
    expect(submitted.get("reason")).toBe("خطأ في التسجيل");
    expect(await screen.findByText("أُلغي تسجيل الحضور")).toBeInTheDocument();
  });

  // content's real-build bug class (7f4809f): a form with a `required`
  // field and no `noValidate` never reaches the action at all on an empty
  // value — the browser blocks it silently. Proven here the same way
  // `members-table.test.tsx` proves the other half: the round trip DOES
  // happen and the app's own Arabic refusal renders.
  it("shows the app's own refusal, not a silently blocked submission, when the RPC refuses", async () => {
    const action = vi.fn<RemoveAction>().mockResolvedValue({ error: "not_found", done: false });
    renderForm(action);
    const dialog = await fillAndOpen();
    await userEvent.click(within(dialog).getByRole("button", { name: "ألغِ تسجيل الحضور" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect(await screen.findByText("لا يوجد تسجيل حضور نشط لهذا العضو لإلغائه")).toBeInTheDocument();
  });

  it("the form has noValidate — the app's own error is the only validator, never a native bubble", () => {
    const { container } = renderForm(vi.fn<RemoveAction>());
    expect(container.querySelector("form")).toHaveAttribute("novalidate", "");
  });
});

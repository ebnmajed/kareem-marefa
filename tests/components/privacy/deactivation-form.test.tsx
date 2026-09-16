// `DeactivationForm` — REQ-PRF-007, REQ-UIX-013 (every destructive action
// confirms in a dialog). Real ar/privacy.json through NextIntlClientProvider;
// only the Server Action is mocked, matching comment-composer.test.tsx's
// pattern.
//
// The one thing worth a dedicated test here: the confirm dialog must not
// open over an empty required reason field — `reportValidity()` runs first,
// so a member sees the browser's own validation on the FIELD, not a
// confirm dialog for a request that cannot actually submit.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import privacyAr from "@/messages/ar/privacy.json";
import uiAr from "@/messages/ar/ui.json";
import type { PrivacyState } from "@/app/[locale]/app/me/privacy/actions";

// `<Field required>` needs `ui.field.required` («مطلوب») — same gap
// `tests/components/me/profile-form.test.tsx` found first.
const ar = { ...privacyAr, ...uiAr };

const { DeactivationForm } = await import("@/app/[locale]/app/me/privacy/forms");

function renderForm(action: (prev: PrivacyState, formData: FormData) => Promise<PrivacyState>) {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <DeactivationForm action={action} />
    </NextIntlClientProvider>,
  );
}

describe("DeactivationForm", () => {
  it("does not open the confirm dialog when the required reason is empty", () => {
    const action = vi.fn();
    renderForm(action);
    fireEvent.click(screen.getByRole("button", { name: "أرسل الطلب" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(action).not.toHaveBeenCalled();
  });

  it("opens the confirm dialog once a reason is written, and submits only on confirm", async () => {
    const action = vi.fn().mockResolvedValue({ error: null, ok: true } satisfies PrivacyState);
    renderForm(action);

    fireEvent.change(screen.getByLabelText("سبب الطلب", { exact: false }), { target: { value: "لم أعد أستخدم المنصة" } });
    fireEvent.click(screen.getByRole("button", { name: "أرسل الطلب" }));

    const dialog = await screen.findByRole("dialog", { name: "تأكيد إرسال الطلب" });
    expect(dialog).toHaveTextContent("سيصل طلبك إلى مشرف مؤسستك");

    // Two buttons now share the visible name "أرسل الطلب" — the opener
    // (outside the dialog) and the dialog's own confirm. Scope to the dialog.
    fireEvent.click(within(dialog).getByRole("button", { name: "أرسل الطلب" }));

    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("أُرسل طلبك"));
  });

  it("cancelling the dialog does not submit", async () => {
    const action = vi.fn();
    renderForm(action);
    fireEvent.change(screen.getByLabelText("سبب الطلب", { exact: false }), { target: { value: "سبب صالح" } });
    fireEvent.click(screen.getByRole("button", { name: "أرسل الطلب" }));
    const dialog = await screen.findByRole("dialog");
    // Two controls share the accessible name "إلغاء" here by house
    // convention (`ui/dialog`'s own × close button carries the same
    // `closeLabel`, matching `takedown-button.tsx`'s identical shape) — the
    // explicit Cancel button is the one with VISIBLE text, unlike the ×,
    // which is icon-only.
    fireEvent.click(within(dialog).getByText("إلغاء"));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(action).not.toHaveBeenCalled();
  });

  it("is axe-clean, including with the confirm dialog open", async () => {
    const action = vi.fn();
    const { container } = renderForm(action);
    fireEvent.change(screen.getByLabelText("سبب الطلب", { exact: false }), { target: { value: "سبب صالح" } });
    fireEvent.click(screen.getByRole("button", { name: "أرسل الطلب" }));
    await screen.findByRole("dialog");
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});

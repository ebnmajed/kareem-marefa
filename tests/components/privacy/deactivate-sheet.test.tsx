// «إيقاف حسابي» — REQ-PRF-007, REQ-UIX-013, REQ-UIX-117. Real ar/privacy.json; only the Server Action is mocked.
// ★ The four cases of `deactivation-form.test.tsx`, re-homed one-for-one when its file was deleted (DEC-208, the
// ledger in STATUS.md): the confirm is now the sheet itself, so «nothing sent before confirming» reads as «nothing
// sent by opening the sheet», and «nothing sent on an empty reason» is the reason's own check inside it.
import { NextIntlClientProvider } from "next-intl";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import privacyAr from "@/messages/ar/privacy.json";
import uiAr from "@/messages/ar/ui.json";
import type { PrivacyState } from "@/app/[locale]/app/me/privacy/actions";

const ar = { ...privacyAr, ...uiAr };
const { DeactivateSheet } = await import("@/components/privacy/deactivate-sheet");

function renderSheet(action: (prev: PrivacyState, formData: FormData) => Promise<PrivacyState>) {
  return render(
    <NextIntlClientProvider locale="ar" messages={ar}>
      <DeactivateSheet action={action} />
    </NextIntlClientProvider>,
  );
}

const open = async () => {
  fireEvent.click(screen.getByRole("button", { name: "إيقاف حسابي" }));
  return screen.findByRole("dialog", { name: "إيقاف حسابي" });
};

describe("DeactivateSheet", () => {
  it("opening the sheet sends nothing, and an empty reason sends nothing", async () => {
    const action = vi.fn();
    renderSheet(action);
    const sheet = await open();
    expect(action).not.toHaveBeenCalled();
    fireEvent.click(within(sheet).getByRole("button", { name: "أرسل الطلب" }));
    await new Promise((r) => setTimeout(r, 0));
    expect(action).not.toHaveBeenCalled();
  });

  it("★ the honest paragraph is in the sheet, and a written reason is sent once, then the confirmation stays", async () => {
    const action = vi.fn().mockResolvedValue({ error: null, ok: true } satisfies PrivacyState);
    renderSheet(action);
    const sheet = await open();
    expect(sheet).toHaveTextContent("عضو سابق");
    fireEvent.change(within(sheet).getByLabelText("سبب الطلب", { exact: false }), { target: { value: "لم أعد أستخدم المنصة" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "أرسل الطلب" }));
    await waitFor(() => expect(action).toHaveBeenCalledTimes(1));
    expect((action.mock.calls[0][1] as FormData).get("reason")).toBe("لم أعد أستخدم المنصة");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("أُرسل طلبك"));
    expect(screen.queryByRole("button", { name: "إيقاف حسابي" })).not.toBeInTheDocument();
  });

  it("cancelling the sheet does not submit", async () => {
    const action = vi.fn();
    renderSheet(action);
    const sheet = await open();
    fireEvent.change(within(sheet).getByLabelText("سبب الطلب", { exact: false }), { target: { value: "سبب صالح" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "إلغاء" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(action).not.toHaveBeenCalled();
  });

  it("is axe-clean, including with the sheet open", async () => {
    renderSheet(vi.fn());
    await open();
    const results = await axe.run(document.body);
    expect(results.violations).toEqual([]);
  });
});

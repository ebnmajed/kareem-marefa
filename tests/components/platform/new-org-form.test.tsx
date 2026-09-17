// SCR-081's form on the form model — wave 8 (`docs/plan/notes/platform.md` W8.4).
// REQ-TEN-002, REQ-UIX-009, REQ-UIX-010, REQ-UIX-011.
import { NextIntlClientProvider } from "next-intl";
import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import arPlatform from "@/messages/ar/platform.json";
import arUi from "@/messages/ar/ui.json";
import { NewOrgForm } from "@/app/[locale]/app/platform/orgs/new/org-form";
import type { NewOrgState } from "@/app/[locale]/app/platform/orgs/state";

function renderForm(action: (prev: NewOrgState, fd: FormData) => Promise<NewOrgState>) {
  return render(
    <NextIntlClientProvider locale="ar" messages={{ ...arPlatform, ...arUi }}>
      <NewOrgForm action={action} />
    </NextIntlClientProvider>,
  );
}

describe("NewOrgForm", () => {
  it("is noValidate, marks every required field «مطلوب», keeps the Latin controls left to right, and seeds categories by default", () => {
    const { container } = renderForm(async (prev) => prev);
    expect(container.querySelector("form")).toHaveAttribute("novalidate");
    for (const label of [/^اسم المؤسسة/, /^المعرّف في الروابط/, /^بادئة الشهادات/, /^النطاقات المسموح بها/, /^بريد أول مشرف/]) {
      expect(screen.getByLabelText(label)).toBeRequired();
    }
    for (const label of [/^المعرّف في الروابط/, /^بادئة الشهادات/, /^النطاقات المسموح بها/, /^بريد أول مشرف/]) {
      expect(screen.getByLabelText(label)).toHaveAttribute("dir", "ltr");
    }
    expect(screen.getByRole("checkbox", { name: /إضافة التصنيفات الأولية/ })).toBeChecked();
    expect(screen.getByText(/بأي حالة أحرف/)).toBeInTheDocument();
  });

  it("a refused submit summarises every failed field as a link, marks each field, and keeps what was typed", async () => {
    const action = vi.fn(async (prev: NewOrgState, fd: FormData): Promise<NewOrgState> => ({
      errors: { slug: "slugInvalid", certificatePrefix: "prefixRequired" },
      formError: null,
      values: { name: String(fd.get("name")), slug: String(fd.get("slug")), certificatePrefix: "", domains: String(fd.get("domains")), firstAdminEmail: "" },
      lists: {},
      attempt: prev.attempt + 1,
    }));
    const { container } = renderForm(action);
    await userEvent.type(screen.getByLabelText(/^اسم المؤسسة/), "مؤسسة التجربة");
    await userEvent.type(screen.getByLabelText(/^المعرّف في الروابط/), "Bad Slug");
    await userEvent.type(screen.getByLabelText(/^النطاقات المسموح بها/), "Example.COM");
    await act(async () => {
      await userEvent.click(screen.getByRole("button", { name: /أنشئ المؤسسة/ }));
    });

    const summary = await screen.findByRole("alert");
    const links = Array.from(summary.querySelectorAll("a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#slug", "#certificatePrefix"]);
    expect(screen.getByLabelText(/^المعرّف في الروابط/)).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByLabelText(/^اسم المؤسسة/)).toHaveValue("مؤسسة التجربة");
    expect(screen.getByLabelText(/^المعرّف في الروابط/)).toHaveValue("Bad Slug");
    expect(screen.getByLabelText(/^النطاقات المسموح بها/)).toHaveValue("Example.COM");
    // The seed checkbox was not sent after the reset, so it reads as sent: unticked.
    expect(screen.getByRole("checkbox", { name: /إضافة التصنيفات الأولية/ })).not.toBeChecked();
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations).toEqual([]);
  });
});

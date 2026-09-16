// SCR-021's profile form — REQ-PRF-001. Real ar/profile.json through
// NextIntlClientProvider; only the Server Action is mocked, same pattern as
// comment-composer.test.tsx. Covers: initial values come from `me` on a
// fresh load, a field-level failure surfaces in `FormSummary` AND the
// field's own error, a whole-form failure is its own alert, and a
// successful save shows the inline confirmation that replaced the old
// `?saved=1` query param (wave-7 plan §4 item 2).
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import profileAr from "@/messages/ar/profile.json";
import uiAr from "@/messages/ar/ui.json";
import type { Company, SelfProfile } from "@/lib/dal/members";
import type { ProfileState } from "@/app/[locale]/app/me/state";

const saveProfile = vi.fn<(locale: string, prev: ProfileState, formData: FormData) => Promise<ProfileState>>();
vi.mock("@/app/[locale]/app/me/actions", () => ({ saveProfile: (...args: unknown[]) => saveProfile(...(args as Parameters<typeof saveProfile>)) }));

const { ProfileForm } = await import("@/components/me/profile-form");

const ME: SelfProfile = {
  id: "m1",
  email: "reem@example.com",
  displayName: "ريم العتيبي",
  avatarUrl: null,
  companyId: null,
  jobTitle: "مهندسة",
  bio: null,
  role: "member",
  createdAt: "2026-01-01T00:00:00Z",
  status: "active",
  leaderboardOptOut: false,
};

const COMPANIES: Company[] = [{ id: "c1", name: "شركة الاختبار" }];

// `<Field required>` appends `ui.field.required` («مطلوب») to the label
// itself, per that component's own header — a test querying by label must
// match on the whole string, so `ui.json`'s namespace has to be in the
// provider too, alongside `profile.json`'s.
const messages = { ...profileAr, ...uiAr };

function renderForm() {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ProfileForm locale="ar" me={ME} companies={COMPANIES} />
    </NextIntlClientProvider>,
  );
}

describe("ProfileForm", () => {
  it("shows the member's own data on a fresh load", () => {
    renderForm();
    // displayName is required, so its accessible name ends «… مطلوب».
    expect(screen.getByLabelText("الاسم", { exact: false })).toHaveValue("ريم العتيبي");
    expect(screen.getByLabelText("المسمى الوظيفي")).toHaveValue("مهندسة");
  });

  it("renders the summary and the field's own error on a field-level failure", async () => {
    saveProfile.mockResolvedValueOnce({
      errors: { displayName: "displayNameRequired" },
      formError: null,
      values: { displayName: "" },
      lists: {},
      attempt: 1,
      saved: false,
    });
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("يرجى تصحيح الأخطاء التالية"));
    expect(screen.getAllByText("فضلًا أدخل اسمك").length).toBeGreaterThan(0);
  });

  it("renders a whole-form failure as its own alert, not the summary", async () => {
    saveProfile.mockResolvedValueOnce({
      errors: {},
      formError: "failed",
      values: { displayName: "ريم العتيبي" },
      lists: {},
      attempt: 1,
      saved: false,
    });
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("تعذّر حفظ ملفك"));
    expect(screen.queryByText("يرجى تصحيح الأخطاء التالية")).not.toBeInTheDocument();
  });

  it("shows the inline confirmation on a successful save — no query param involved", async () => {
    saveProfile.mockResolvedValueOnce({
      errors: {},
      formError: null,
      values: { displayName: "ريم العتيبي" },
      lists: {},
      attempt: 0,
      saved: true,
    });
    renderForm();
    fireEvent.click(screen.getByRole("button", { name: "حفظ" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("تم الحفظ"));
  });

  it("is axe-clean", async () => {
    const { container } = renderForm();
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});

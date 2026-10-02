// SCR-021 rebuilt (wave 20) — REQ-UIX-071, REQ-PRF-001, DEC-218 §4.2 – §4.3. Read by default, edit on intent.
//
// ★ The six cases of the deleted `profile-form.test.tsx` are re-asserted here against edit mode, each marked
// «(was …)» and each a ledger line in STATUS.md; the rest is new.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import profileAr from "@/messages/ar/profile.json";
import uiAr from "@/messages/ar/ui.json";
import type { Company, MyInterests, SelfProfile } from "@/lib/dal/members";
import type { ProfileState } from "@/app/[locale]/app/me/state";
import { ToastProvider } from "@/components/ui/toast";

const saveProfile = vi.fn<(locale: string, prev: ProfileState, formData: FormData) => Promise<ProfileState>>();
vi.mock("@/app/[locale]/app/me/actions", () => ({ saveProfile: (...args: unknown[]) => saveProfile(...(args as Parameters<typeof saveProfile>)) }));
const replace = vi.fn();
const push = vi.fn();
vi.mock("@/i18n/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("@/i18n/navigation")>()), useRouter: () => ({ replace, push }) }));
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), useRouter: () => ({ push, replace }) }));

const { ProfileEdit } = await import("@/components/me/profile-edit");
const { ProfileRead } = await import("@/components/me/profile-read");

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
const C1 = "11111111-1111-1111-1111-111111111111";
const C2 = "22222222-2222-2222-2222-222222222222";
const INTERESTS: MyInterests = { chosen: [{ id: C1, name: "حوكمة" }], options: [{ id: C1, name: "حوكمة" }, { id: C2, name: "تقارير" }] };

const messages = { ...profileAr, ...uiAr };
const base: ProfileState = { values: {}, errors: {}, formError: null, attempt: 0, saved: false } as unknown as ProfileState;

function renderEdit(me: SelfProfile = ME) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <ProfileEdit locale="ar" me={me} companies={COMPANIES} interests={INTERESTS} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const save = () => fireEvent.click(screen.getByRole("button", { name: "حفظ" }));
const name = () => screen.getByLabelText("الاسم", { exact: false });

beforeEach(() => {
  saveProfile.mockReset();
  replace.mockReset();
  push.mockReset();
});

describe("SCR-021 — read mode", () => {
  const t = createTranslator({ locale: "ar", messages: profileAr, namespace: "profile" });
  function renderRead(me: SelfProfile = ME, interests = INTERESTS.chosen) {
    return render(
      <NextIntlClientProvider locale="ar" messages={messages}>
        <ProfileRead me={me} companyName={me.companyId ? "شركة الاختبار" : null} interests={interests} t={t as never} noBio="لا توجد نبذة بعد" companyMissing="اختر شركتك قبل حجز مقعد أو اقتراح جلسة." />
      </NextIntlClientProvider>,
    );
  }

  it("★ no input exists — values, and one «عدّل ملفك» into /app/me?edit (REQ-UIX-071 acc. 1)", () => {
    const { container } = renderRead({ ...ME, companyId: "c1" });
    expect(container.querySelectorAll("input, select, textarea")).toHaveLength(0);
    expect(screen.getByRole("heading", { level: 2, name: "ملفي" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "عدّل ملفك" })).toHaveAttribute("href", "/ar/app/me?edit");
    expect(screen.getByText("ريم العتيبي")).toBeInTheDocument();
    expect(screen.getByText("حوكمة")).toBeInTheDocument();
    expect(screen.getByText("reem@example.com").closest("bdi")).toHaveAttribute("dir", "ltr");
    expect(screen.getByText("لا توجد نبذة بعد")).toBeInTheDocument();
  });

  it("the company row carries its team dot through `--team`, never a class or a hex in markup", () => {
    const { container } = render(
      <NextIntlClientProvider locale="ar" messages={messages}>
        <ProfileRead me={{ ...ME, companyId: "c1" }} companyName="صنف" companyTeamColor="#ff9a2e" interests={[]} t={t as never} noBio="—" companyMissing="—" />
      </NextIntlClientProvider>,
    );
    const dot = container.querySelector(".bg-team") as HTMLElement;
    expect(dot).not.toBeNull();
    expect(dot.style.getPropertyValue("--team")).toBe("#ff9a2e");
    expect(dot).toHaveAttribute("aria-hidden", "true");
  });

  it("★ no company: says what it blocks, and the company row is the way to choose one", () => {
    renderRead();
    expect(screen.getByRole("status")).toHaveTextContent("اختر شركتك قبل حجز مقعد");
    expect(screen.getByRole("link", { name: "اختر شركتك" })).toHaveAttribute("href", "/ar/app/me?edit");
  });

  it("is axe-clean", async () => {
    const { container } = renderRead();
    expect((await axe.run(container)).violations).toEqual([]);
  });
});

describe("SCR-021 — edit mode", () => {
  it("shows the member's own data on a fresh load (was profile-form: «shows the member's own data»)", () => {
    renderEdit();
    expect(name()).toHaveValue("ريم العتيبي");
    expect(screen.getByLabelText("المسمى الوظيفي")).toHaveValue("مهندسة");
    expect(screen.getByRole("heading", { level: 2, name: "تعديل ملفي" })).toBeInTheDocument();
  });

  it("renders the summary and the field's own error on a field-level failure (was profile-form)", async () => {
    saveProfile.mockResolvedValue({ ...base, values: { displayName: "" }, errors: { displayName: "displayNameRequired" }, attempt: 1 } as ProfileState);
    renderEdit();
    fireEvent.change(name(), { target: { value: "" } });
    save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("يرجى تصحيح الأخطاء التالية"));
    expect(screen.getAllByText("فضلًا أدخل اسمك").length).toBeGreaterThan(0);
    // Edit mode stays.
    expect(replace).not.toHaveBeenCalled();
  });

  it("renders a whole-form failure as its own alert, not the summary (was profile-form)", async () => {
    saveProfile.mockResolvedValue({ ...base, formError: "failed", attempt: 1 } as ProfileState);
    renderEdit();
    fireEvent.change(name(), { target: { value: "ريم" } });
    save();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("تعذّر حفظ ملفك"));
    expect(screen.queryByText("يرجى تصحيح الأخطاء التالية")).not.toBeInTheDocument();
  });

  it("★ a successful save says so once and returns to read mode (was profile-form: «the inline confirmation»)", async () => {
    saveProfile.mockResolvedValue({ ...base, saved: true } as ProfileState);
    renderEdit();
    fireEvent.change(name(), { target: { value: "ريم" } });
    save();
    expect(await screen.findByText("تم الحفظ")).toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/me"));
  });

  it("keeps the chosen company in the select after a refused save (was profile-form: «echoes the saved company»)", async () => {
    saveProfile.mockResolvedValue({ ...base, formError: "failed", attempt: 1 } as ProfileState);
    renderEdit();
    fireEvent.change(screen.getByLabelText("الشركة", { exact: false }), { target: { value: "c1" } });
    save();
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
    expect(screen.getByLabelText("الشركة", { exact: false })).toHaveValue("c1");
  });

  it("★ Save is enabled only when something changed, and the header counts the changes", () => {
    renderEdit();
    expect(screen.getByRole("button", { name: "حفظ" })).toBeDisabled();
    fireEvent.change(name(), { target: { value: "ريم" } });
    fireEvent.change(screen.getByLabelText("المسمى الوظيفي", { exact: false }), { target: { value: "مديرة" } });
    expect(screen.getByRole("button", { name: "حفظ" })).toBeEnabled();
    expect(screen.getByText("تغييران غير محفوظين")).toBeInTheDocument();
    // The changed field is said in words, not by its outline alone (SC 1.4.1).
    expect(name()).toHaveAccessibleName(/معدّل/);
    fireEvent.change(name(), { target: { value: "ريم العتيبي" } });
    expect(screen.getByText("تغيير واحد غير محفوظ")).toBeInTheDocument();
  });

  it("★ interests are categories: add one, remove one, and each chosen id is posted (REQ-PRF-001)", async () => {
    saveProfile.mockResolvedValue({ ...base, saved: true } as ProfileState);
    renderEdit();
    fireEvent.change(screen.getByLabelText("الاهتمامات", { exact: false }), { target: { value: C2 } });
    fireEvent.click(screen.getByRole("button", { name: "أزل حوكمة" }));
    save();
    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    const posted = saveProfile.mock.calls[0][2];
    expect(posted.getAll("interests")).toEqual([C2]);
  });

  it("★ PR B: the leaderboard opt-out is not here and is never posted — it lives on /app/me/settings (contract 5)", async () => {
    saveProfile.mockResolvedValue({ ...base, saved: true } as ProfileState);
    renderEdit();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.change(name(), { target: { value: "ريم" } });
    save();
    await waitFor(() => expect(saveProfile).toHaveBeenCalled());
    expect(saveProfile.mock.calls[0][2].has("leaderboardOptOut")).toBe(false);
  });

  it("★ «إلغاء» is a link back to read mode; with changes, leaving asks first", async () => {
    renderEdit();
    const cancel = within(screen.getByRole("group", { name: "حفظ ملفي" })).getByRole("link", { name: "إلغاء" });
    expect(cancel).toHaveAttribute("href", "/ar/app/me");
    fireEvent.change(name(), { target: { value: "ريم" } });
    fireEvent.click(cancel);
    const dialog = await screen.findByRole("dialog", { name: "تجاهل التغييرات؟" });
    fireEvent.click(within(dialog).getByRole("button", { name: "تجاهل" }));
    expect(push).toHaveBeenCalledWith("/ar/app/me");
  });

  it("is axe-clean (was profile-form)", async () => {
    const { container } = renderEdit();
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});

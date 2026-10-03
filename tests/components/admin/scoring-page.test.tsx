// SCR-053 · /app/admin/scoring, rebuilt from `AdminScoring.dc.html` (wave 22, `REQ-UIX-100`, `REQ-UIX-091`). The
// wave-8 cases re-said against the rebuild — each a ledger line in STATUS: read mode shows the catalogue as values, with
// the reason a member reads under each action, the deductions apart with their cost, the company rules as one line, the
// saved mark from the history with its author, and no control at all; «عدّل» and «تعديل يدوي» are links that work
// without JS. Edit mode: a staged switch writes nothing and is counted and named; a refusal lands at its field; the toast
// says «حُفظ» or «لم يتغيّر شيء» from the receipt alone. The manual adjustment confirms by name and amount. The history is
// in words under `history-heading`. axe on both modes.
import type React from "react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScoringAdminData } from "@/lib/dal/scoring-admin";
import adminAr from "@/messages/ar/admin.json";
import scoringAr from "@/messages/ar/scoring.json";
import uiAr from "@/messages/ar/ui.json";

const messages = { ...adminAr, ...scoringAr, ...uiAr };

const replace = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace, push: vi.fn() }), Link: (props: React.ComponentProps<"a">) => <a {...props} /> }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {
    throw new Error("not_found");
  },
}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/dal/admin-members", () => ({ listMembersForAdmin: vi.fn() }));
vi.mock("@/lib/dal/scoring-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dal/scoring-admin")>()),
  getScoringAdminData: vi.fn(),
  getConfigLastSave: vi.fn(),
}));
const actions = { saveCatalogue: vi.fn(), saveManualAdjustment: vi.fn() };
vi.mock("@/app/[locale]/app/admin/scoring/actions", () => actions);
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "scoring.admin" }),
  setRequestLocale: () => {},
}));

const { getScoringAdminData, getConfigLastSave } = await import("@/lib/dal/scoring-admin");
const { listMembersForAdmin } = await import("@/lib/dal/admin-members");
const { default: ScoringAdminPage } = await import("@/app/[locale]/app/admin/scoring/page");
const { ToastProvider } = await import("@/components/ui/toast");

const rule = (id: string, actionKey: string, points: number, extra: Partial<ScoringAdminData["rules"][number]> = {}) => ({
  id,
  actionKey,
  actor: "attendee" as const,
  points,
  enabled: true,
  capPerSession: null,
  cooldownSeconds: null,
  reasonAr: actionKey,
  version: 3,
  ...extra,
});

const COMMENT = "22222222-2222-4222-8222-222222222222";
const DATA: ScoringAdminData = {
  rules: [
    rule("11111111-1111-4111-8111-111111111111", "check_in", 20, { capPerSession: 1, reasonAr: "تسجيل حضور مؤكَّد" }),
    rule(COMMENT, "comment", 2, { capPerSession: 5, cooldownSeconds: 60, reasonAr: "تعليق مفيد" }),
    rule("33333333-3333-4333-8333-333333333333", "session_delivered", 50, { reasonAr: "قدّمت جلسة للمجتمع" }),
    rule("44444444-4444-4444-8444-444444444444", "no_show", 0, { reasonAr: "تغيّب بعد الحجز", enabled: false }),
    rule("55555555-5555-4555-8555-555555555555", "late_cancellation", -5, { reasonAr: "إلغاء متأخر" }),
  ],
  companyRules: [
    { id: "66666666-6666-4666-8666-666666666666", actionKey: "company_hosting", enabled: true, points: 30, pointsPerPercent: null, capPoints: null, minActiveMembers: null, reasonAr: "استضافة جلسة", version: 1 },
    { id: "77777777-7777-4777-8777-777777777777", actionKey: "company_attendance_pct", enabled: true, points: null, pointsPerPercent: 1, capPoints: 50, minActiveMembers: 3, reasonAr: "حضور", version: 1 },
  ],
  history: [
    { id: "h1", scope: "scoring", actionKey: "comment", field: "points", oldValue: 1, newValue: 2, actorId: "a1", actorName: "مشرفة النقاط", changedAt: "2026-09-17T09:00:00Z" },
    { id: "h2", scope: "scoring", actionKey: "comment", field: "cooldown", oldValue: null, newValue: "00:01:00", actorId: "a1", actorName: "مشرفة النقاط", changedAt: "2026-09-17T09:00:00Z" },
  ],
  timeZone: "Asia/Riyadh",
};

async function renderPage(searchParams: Record<string, string> = {}) {
  vi.mocked(getScoringAdminData).mockResolvedValue(DATA);
  vi.mocked(getConfigLastSave).mockResolvedValue({ at: "2026-09-17T09:00:00Z", timeZone: "Asia/Riyadh", actor: { id: "a1", displayName: "مشرفة النقاط" } });
  vi.mocked(listMembersForAdmin).mockResolvedValue([{ id: "m1", displayName: "سارة العتيبي", email: "sara@example.com" }] as never);
  const element = await ScoringAdminPage({ params: Promise.resolve({ locale: "ar" }), searchParams: Promise.resolve(searchParams) });
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <main>{element}</main>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const rowsOf = (name: string) => within(screen.getAllByRole("table", { name })[0]).getAllByRole("row").slice(1);
// The submit button reads «جارٍ الحفظ…» until the action settles, so each submit waits for «احفظ» to come back.
const submit = async () => fireEvent.submit((await screen.findByRole("button", { name: /^احفظ/ })).closest("form") as HTMLFormElement);
const settled = (attempt: number, receipt: { at: string | null; wrote: string[] } | null, errors: Record<string, string> = {}) => ({
  errors,
  formError: null,
  values: {},
  lists: {},
  attempt,
  receipt,
});

beforeEach(() => {
  Object.values(actions).forEach((a) => a.mockReset());
  replace.mockReset();
});

describe("ScoringAdminPage — read mode", () => {
  it("the catalogue as values: one line per action, its value, cap and cooldown in words, its state in words — and no control", async () => {
    await renderPage();
    const rows = rowsOf("كتالوج النقاط");
    expect(rows).toHaveLength(3);
    expect(rows[1]).toHaveTextContent("تعليق");
    // The member's text is edit mode's, not a second line here (the lead's ruling on D2).
    expect(rows[1]).not.toHaveTextContent("تعليق مفيد");
    expect(rows[1]).toHaveTextContent("نقطتان");
    expect(rows[1]).toHaveTextContent("5 مرات لكل جلسة");
    expect(rows[1]).toHaveTextContent("دقيقة واحدة");
    expect(rows[1]).toHaveTextContent("✓ مفعّل");
    expect(screen.queryByRole("switch")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("the deductions apart, each as its cost and its STORED state — the heading claims nothing about them; الحجز and التفاعل are absent", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { name: "سلبية" })).toBeInTheDocument();
    const rows = rowsOf("سلبية");
    expect(rows[0]).toHaveTextContent("لا خصم");
    expect(rows[0]).toHaveTextContent("— متوقف");
    expect(rows[1]).toHaveTextContent("خصم 5 نقاط");
    expect(rows[1]).toHaveTextContent("✓ مفعّل");
    // The catalogue's check constraint does not admit them: no row names either action.
    expect(screen.queryByText("الحجز", { exact: true })).toBeNull();
    expect(screen.queryByText("التفاعل", { exact: true })).toBeNull();
  });

  it("the company rules are one line, every value read, and its «عدّل» enters edit mode at them; nothing names a session's host", async () => {
    await renderPage();
    const line = screen.getByText(/^الشركات:/).closest("p") as HTMLElement;
    expect(line).toHaveTextContent("استضافة 30");
    expect(line).toHaveTextContent("حضور 1 لكل نقطة مئوية بحد 50");
    expect(within(line).getByRole("link", { name: "عدّل" })).toHaveAttribute("href", "/app/admin/scoring?edit#company-rules");
    expect(document.body).not.toHaveTextContent("الشركة المستضيفة");
  });

  it("the saved mark is the last save's time and author, read from the history; «عدّل» and «تعديل يدوي» are links", async () => {
    await renderPage();
    expect(screen.getByText(/✓✓ حُفظ/)).toHaveTextContent("مشرفة النقاط");
    expect(screen.getAllByRole("link", { name: "عدّل" })[0]).toHaveAttribute("href", "/app/admin/scoring?edit");
    expect(screen.getByRole("link", { name: "تعديل يدوي" })).toHaveAttribute("href", "/app/admin/scoring?adjust=1#manual-adjustment");
  });

  it("the history names the rule, the field, the change in words, and who made it — under `history-heading`", async () => {
    await renderPage();
    const rows = rowsOf("تعديلات القواعد");
    expect(rows[0]).toHaveTextContent("تعليق");
    expect(rows[0]).toHaveTextContent("من 1 إلى 2");
    expect(rows[0]).toHaveTextContent("مشرفة النقاط");
    expect(rows[1]).toHaveTextContent("من — إلى دقيقة واحدة");
    expect(document.getElementById("history-heading")).not.toBeNull();
  });

  it("the manual adjustment, in its sheet: confirmed by name and amount, then posted with its reason", async () => {
    // What the Server Action answers on a write — a SavedFormState, never undefined.
    actions.saveManualAdjustment.mockResolvedValueOnce({ errors: {}, formError: null, values: {}, lists: {}, attempt: 0, saved: true });
    await renderPage({ adjust: "1" });
    const sheet = await screen.findByRole("dialog", { name: "تعديل يدوي" });
    fireEvent.change(within(sheet).getByRole("combobox", { name: "العضو مطلوب" }), { target: { value: "سارة" } });
    fireEvent.click(screen.getByRole("option", { name: /سارة العتيبي/ }));
    fireEvent.click(within(sheet).getByRole("radio", { name: "خصم نقاط" }));
    fireEvent.change(within(sheet).getByLabelText("عدد النقاط مطلوب"), { target: { value: "50" } });
    fireEvent.change(within(sheet).getByLabelText("السبب مطلوب"), { target: { value: "تصحيح خطأ" } });
    fireEvent.click(within(sheet).getByRole("button", { name: "نفّذ التعديل" }));
    const confirm = await screen.findByRole("dialog", { name: "خصم 50 نقطة من «سارة العتيبي»؟" });
    expect(actions.saveManualAdjustment).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: "أكّد التعديل" }));
    await waitFor(() => expect(actions.saveManualAdjustment).toHaveBeenCalledTimes(1));
    const posted: FormData = actions.saveManualAdjustment.mock.calls[0][2];
    expect([posted.get("memberId"), posted.get("direction"), posted.get("amount"), posted.get("reason")]).toEqual(["m1", "deduct", "50", "تصحيح خطأ"]);
    // Written: the toast says so and the sheet closes back to the catalogue.
    expect(await screen.findByText("نُفِّذ التعديل", { exact: true })).toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/admin/scoring"));
  });

  it("has no axe violations in read mode", async () => {
    const { container } = await renderPage();
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }, 30000);
});

describe("ScoringAdminPage — edit mode", () => {
  it("a switch STAGES its change — nothing is written — and edit mode counts it and names it «(معدّل)»", async () => {
    await renderPage({ edit: "" });
    expect(screen.getByRole("heading", { name: "تعديل النقاط" })).toBeInTheDocument();
    await userEvent.click(screen.getByRole("switch", { name: "مفعّل — تعليق" }));
    expect(actions.saveCatalogue).not.toHaveBeenCalled();
    expect(screen.getByText("تغيير واحد غير محفوظ")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "مفعّل (معدّل) — تعليق" })).not.toBeChecked();
    expect(screen.getByRole("button", { name: /احفظ \(1\)/ })).toBeEnabled();
  });

  it("the reason a member reads is editable, and a deduction is typed as its cost", async () => {
    await renderPage({ edit: "" });
    expect(screen.getByRole("textbox", { name: "ما يقرؤه العضو — تعليق" })).toHaveValue("تعليق مفيد");
    expect(screen.getByRole("textbox", { name: "الخصم — إلغاء متأخر" })).toHaveValue("5");
  });

  it("«لم يتغيّر شيء» from an empty receipt, «حُفظ» from one that wrote rows — and back to read mode each time", async () => {
    actions.saveCatalogue.mockResolvedValueOnce(settled(1, { at: null, wrote: [] }));
    await renderPage({ edit: "" });
    await submit();
    expect(await screen.findByText("لم يتغيّر شيء", { exact: true })).toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/admin/scoring"));

    actions.saveCatalogue.mockResolvedValueOnce(settled(2, { at: "2026-10-03T09:00:00Z", wrote: ["comment.points"] }));
    await submit();
    expect(await screen.findByText("حُفظ", { exact: true })).toBeInTheDocument();
  });

  it("a refusal lands at its field and the summary links to it; nothing returns to read mode", async () => {
    const field = `rule-${COMMENT}-points`;
    actions.saveCatalogue.mockResolvedValueOnce(settled(1, null, { [field]: "signMismatch" }));
    await renderPage({ edit: "" });
    await submit();
    const summary = await screen.findByRole("alert");
    expect(within(summary).getByRole("link", { name: /القيمة — تعليق/ })).toHaveAttribute("href", `#${field}`);
    expect(screen.getAllByText("هذه القاعدة لا تقبل هذه الإشارة.").length).toBeGreaterThan(0);
    expect(replace).not.toHaveBeenCalled();
  });

  it("has no axe violations in edit mode", async () => {
    const { container } = await renderPage({ edit: "" });
    const result = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }, 30000);
});

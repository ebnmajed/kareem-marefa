// SCR-053 · /app/admin/scoring on the M9 system (wave 8, K5) — REQ-PTS-004 …
// 010. The async page awaited with a mocked DAL and the real Arabic catalogue:
// the fixed catalogue in three groups with the deductions «مغلق» at 0, a rule
// edited in its dialog and refused at the field, the manual adjustment
// confirmed by name, and the history in words.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScoringAdminData } from "@/lib/dal/scoring-admin";
import { ToastProvider } from "@/components/ui/toast";
import { formStateFrom, withErrors } from "@/lib/form-state";
import adminAr from "@/messages/ar/admin.json";
import scoringAr from "@/messages/ar/scoring.json";
import uiAr from "@/messages/ar/ui.json";

const messages = { ...adminAr, ...scoringAr, ...uiAr };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/dal/admin-members", () => ({ listMembersForAdmin: vi.fn() }));
vi.mock("@/lib/dal/scoring-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dal/scoring-admin")>()),
  getScoringAdminData: vi.fn(),
  listHostableSessions: vi.fn(),
}));
const actions = {
  saveScoringRule: vi.fn(),
  saveCompanyHostingRule: vi.fn(),
  saveCompanyPercentRule: vi.fn(),
  saveSessionHostCompany: vi.fn(),
  saveManualAdjustment: vi.fn(),
};
vi.mock("@/app/[locale]/app/admin/scoring/actions", () => actions);
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "scoring.admin" }),
  setRequestLocale: () => {},
}));

const { getScoringAdminData, listHostableSessions } = await import("@/lib/dal/scoring-admin");
const { listMembersForAdmin } = await import("@/lib/dal/admin-members");
const { default: ScoringAdminPage } = await import("@/app/[locale]/app/admin/scoring/page");

const rule = (id: string, actionKey: string, points: number, extra: Partial<ScoringAdminData["rules"][number]> = {}) => ({
  id,
  actionKey,
  actor: "attendee" as const,
  points,
  enabled: true,
  capPerSession: null,
  cooldownSeconds: null,
  reasonAr: actionKey,
  version: 1,
  ...extra,
});

const DATA: ScoringAdminData = {
  rules: [
    rule("r-check", "check_in", 20, { reasonAr: "تسجيل حضور مؤكَّد" }),
    rule("r-comment", "comment", 2, { capPerSession: 5, cooldownSeconds: 60, reasonAr: "تعليق" }),
    rule("r-delivered", "session_delivered", 50, { reasonAr: "قدّمت جلسة للمجتمع" }),
    rule("r-noshow", "no_show", 0, { reasonAr: "تغيّب بعد الحجز" }),
    rule("r-late", "late_cancellation", -5, { reasonAr: "إلغاء متأخر" }),
  ],
  companyRules: [
    { id: "c-host", actionKey: "company_hosting", enabled: true, points: 100, pointsPerPercent: null, capPoints: null, minActiveMembers: null, reasonAr: "استضافة جلسة", version: 1 },
  ],
  history: [
    { id: "h1", scope: "scoring", actionKey: "comment", field: "points", oldValue: 1, newValue: 2, actorId: "a1", actorName: "مشرفة النقاط", changedAt: "2026-09-17T09:00:00Z" },
    { id: "h2", scope: "scoring", actionKey: "comment", field: "cooldown", oldValue: null, newValue: "00:01:00", actorId: "a1", actorName: "مشرفة النقاط", changedAt: "2026-09-17T09:00:00Z" },
  ],
  companies: [{ id: "co1", name: "شركة المعرفة" }],
  timeZone: "Asia/Riyadh",
};

async function renderPage() {
  vi.mocked(getScoringAdminData).mockResolvedValue(DATA);
  vi.mocked(listHostableSessions).mockResolvedValue([]);
  vi.mocked(listMembersForAdmin).mockResolvedValue([{ id: "m1", displayName: "سارة العتيبي", email: "sara@example.com" }] as never);
  const element = await ScoringAdminPage({ params: Promise.resolve({ locale: "ar" }) });
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <main>{element}</main>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const section = (name: string) => screen.getByRole("heading", { name }).closest("section") as HTMLElement;
const cards = (el: HTMLElement) => within(el.querySelector("ul.space-y-3") as HTMLElement).getAllByRole("listitem");

describe("ScoringAdminPage", () => {
  beforeEach(() => Object.values(actions).forEach((a) => a.mockReset()));

  it("the catalogue is three fixed groups; a deduction at 0 reads «لا خصم» and «مغلق», and a set one as its cost", async () => {
    await renderPage();
    const attendee = cards(section("للحاضرين"));
    expect(attendee.map((c) => within(c).getAllByRole("paragraph")[0].textContent)).toEqual(["تسجيل حضور مؤكَّد", "تعليق"]);
    expect(attendee[1]).toHaveTextContent("نقطتان");
    expect(attendee[1]).toHaveTextContent("5 مرات لكل جلسة");
    expect(attendee[1]).toHaveTextContent("دقيقة واحدة");
    // The member-facing reason is shown only where it differs from the name —
    // the seed's equals it on twelve of fourteen rules, and a card that reads
    // its own name twice is noise.
    expect(attendee[0]).not.toHaveTextContent("يظهر للعضو");
    expect(cards(section("للمُقدِّمين"))[0]).toHaveTextContent("يظهر للعضو: قدّمت جلسة للمجتمع");

    const penalties = cards(section("الخصومات"));
    expect(penalties[0]).toHaveTextContent("لا خصم");
    expect(penalties[0]).toHaveTextContent("مغلق");
    expect(penalties[1]).toHaveTextContent("خصم 5 نقاط");
    expect(screen.getByText("مغلقة افتراضيًا: لا يخسر أحد نقاطًا حتى تحدّد مقدار خصم لإجراء منها.")).toBeInTheDocument();
    // No «add an action» anywhere: the catalogue is fixed.
    expect(screen.queryByRole("button", { name: /أضف/ })).toBeNull();
  });

  it("a rule's dialog opens on the stored values — a cost as a positive number — and a refusal lands at the field", async () => {
    actions.saveScoringRule.mockImplementation(async (_locale: string, previous: never, formData: FormData) => ({
      ...withErrors(formStateFrom<string>(formData, { fields: ["points", "reasonAr"], previous }), { points: "pointsRange" }),
      saved: false,
    }));
    await renderPage();
    const late = cards(section("الخصومات"))[1];
    fireEvent.click(within(late).getByRole("button", { name: "عدّل: إلغاء متأخر" }));
    const dialog = await screen.findByRole("dialog", { name: "تعديل «إلغاء متأخر»" });
    const cost = within(dialog).getByLabelText("مقدار الخصم مطلوب");
    expect(cost).toHaveValue(5);
    fireEvent.change(cost, { target: { value: "1500" } });
    fireEvent.submit(dialog.querySelector("form")!);
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("لم تُحفظ القاعدة");
    expect(within(dialog).getByLabelText("مقدار الخصم مطلوب")).toHaveAccessibleDescription(/من صفر إلى ألف\./);
    expect(actions.saveScoringRule.mock.calls[0][2].get("kind")).toBe("penalty");
  });

  it("a saved rule closes its dialog and says so", async () => {
    actions.saveScoringRule.mockResolvedValue({ errors: {}, formError: null, values: {}, lists: {}, attempt: 0, saved: true });
    await renderPage();
    fireEvent.click(within(cards(section("للحاضرين"))[0]).getByRole("button", { name: "عدّل: تسجيل حضور مؤكَّد" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.submit(dialog.querySelector("form")!);
    expect(await screen.findByText("حُفظت القاعدة")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("a complete manual adjustment confirms by name and amount before it is written; an incomplete one goes straight to the server", async () => {
    actions.saveManualAdjustment.mockResolvedValue({ errors: {}, formError: null, values: {}, lists: {}, attempt: 0, saved: true });
    await renderPage();
    const manual = section("تعديل يدوي");
    fireEvent.click(within(manual).getByRole("button", { name: "نفّذ التعديل" }));
    await waitFor(() => expect(actions.saveManualAdjustment).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).toBeNull();

    fireEvent.change(within(manual).getByRole("combobox", { name: "العضو مطلوب" }), { target: { value: "سارة" } });
    fireEvent.click(screen.getByRole("option", { name: /سارة العتيبي/ }));
    fireEvent.click(within(manual).getByRole("radio", { name: "خصم نقاط" }));
    fireEvent.change(within(manual).getByLabelText("عدد النقاط مطلوب"), { target: { value: "50" } });
    fireEvent.change(within(manual).getByLabelText("السبب مطلوب"), { target: { value: "تصحيح خطأ" } });
    fireEvent.click(within(manual).getByRole("button", { name: "نفّذ التعديل" }));

    const confirm = await screen.findByRole("dialog", { name: "خصم 50 نقطة من «سارة العتيبي»؟" });
    expect(confirm).toHaveTextContent("السبب: تصحيح خطأ");
    fireEvent.click(within(confirm).getByRole("button", { name: "أكّد التعديل" }));
    await waitFor(() => expect(actions.saveManualAdjustment).toHaveBeenCalledTimes(2));
    const posted: FormData = actions.saveManualAdjustment.mock.calls[1][2];
    expect([posted.get("memberId"), posted.get("direction"), posted.get("amount"), posted.get("reason")]).toEqual(["m1", "deduct", "50", "تصحيح خطأ"]);
  });

  it("the history names the rule, the field, the change in words, and who made it", async () => {
    await renderPage();
    const [points, cooldown] = cards(section("سجل التعديلات"));
    expect(points).toHaveTextContent("تعليق");
    expect(points).toHaveTextContent("النقاط");
    expect(points).toHaveTextContent("من 1 إلى 2");
    expect(points).toHaveTextContent("مشرفة النقاط");
    expect(cooldown).toHaveTextContent("من — إلى دقيقة واحدة");
    expect(document.getElementById("history-heading")).not.toBeNull();
  });

  it("has no axe violations, with a rule's dialog open", async () => {
    const { container } = await renderPage();
    const page = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(page.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
    fireEvent.click(within(cards(section("للحاضرين"))[1]).getByRole("button", { name: "عدّل: تعليق" }));
    await screen.findByRole("dialog");
    const open = await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } });
    expect(open.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }, 30000);
});

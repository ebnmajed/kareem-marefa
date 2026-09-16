// SCR-054 · /app/admin/recognition on the M9 system (wave 8, K4) — REQ-REC-001
// … 008, REQ-CRT-012. The async page awaited with a mocked DAL and the real
// Arabic catalogue: held certificates first and only when there are any,
// released after a confirmation that counts them; badges created and edited
// with their rule; retiring confirmed; a badge already held said at the member.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { formStateFrom, withErrors } from "@/lib/form-state";
import type { CertificateRow } from "@/lib/dal/certificates";
import type { RecognitionAdminData } from "@/lib/dal/scoring-admin";
import adminAr from "@/messages/ar/admin.json";
import recognitionAr from "@/messages/ar/recognition.json";
import uiAr from "@/messages/ar/ui.json";

const messages = { ...adminAr, ...recognitionAr, ...uiAr };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/dal/admin-members", () => ({ listMembersForAdmin: vi.fn() }));
vi.mock("@/lib/dal/proposals", () => ({ getOrgPrefs: async () => ({ timeZone: "Asia/Riyadh", maxCoPresenters: 4 }) }));
vi.mock("@/lib/dal/certificates", () => ({ listHeldAchievements: vi.fn() }));
vi.mock("@/lib/dal/scoring-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dal/scoring-admin")>()),
  getRecognitionAdminData: vi.fn(),
}));
const actions = { saveBadge: vi.fn(), retireBadge: vi.fn(), saveLevel: vi.fn(), saveStreakRule: vi.fn(), savePerk: vi.fn(), awardBadge: vi.fn() };
vi.mock("@/app/[locale]/app/admin/recognition/actions", () => actions);
const releaseAchievements = vi.fn();
vi.mock("@/components/certificates/actions", () => ({ releaseAchievements: (...a: unknown[]) => releaseAchievements(...a) }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "recognition.admin" }),
  setRequestLocale: () => {},
}));

const { getRecognitionAdminData } = await import("@/lib/dal/scoring-admin");
const { listHeldAchievements } = await import("@/lib/dal/certificates");
const { listMembersForAdmin } = await import("@/lib/dal/admin-members");
const { default: RecognitionAdminPage } = await import("@/app/[locale]/app/admin/recognition/page");

const DATA: RecognitionAdminData = {
  badges: [
    { id: "b1", key: "regular", name: "حاضر دائم", description: "عشرة تسجيلات حضور", issuesCertificate: false, retiredAt: null, rule: { metric: "check_ins_count", gte: 10, minSessions: null }, isManual: false },
    { id: "b2", key: "rated_presenter", name: "مُقدِّم مُقيَّم", description: null, issuesCertificate: true, retiredAt: null, rule: { metric: "presenter_rating_avg", gte: 4.5, minSessions: 3 }, isManual: false },
    { id: "b3", key: "annual", name: "كريم المعرفة السنوي", description: null, issuesCertificate: true, retiredAt: "2026-01-01T00:00:00Z", rule: { metric: "manual", gte: null, minSessions: null }, isManual: true },
  ],
  levels: [
    { id: "l1", name: "مشارِك", thresholdPoints: 0, sortOrder: 1 },
    { id: "l2", name: "صاحب أثر", thresholdPoints: 300, sortOrder: 2 },
  ],
  perks: [{ id: "p1", key: "can_host", enabled: false, requiredLevelId: "l2", requiredBadgeId: null, requiredLevelName: "صاحب أثر", requiredBadgeName: null }],
  streakRules: [{ id: "s1", key: "monthly_3", requiredCount: 3, bonusPoints: 15, enabled: true }],
};

const cert = (id: string, name: string, extra: Partial<CertificateRow>): CertificateRow => ({
  id,
  kind: "achievement",
  state: "held",
  serial: `KM-2026-${id}`,
  verificationCode: id,
  recipientName: name,
  issuedAt: null,
  revokedAt: null,
  revocationReason: null,
  sessionId: null,
  sessionTitle: null,
  achievementName: null,
  documentId: null,
  pdfPath: null,
  ...extra,
});

async function renderPage(held: CertificateRow[] = []) {
  vi.mocked(getRecognitionAdminData).mockResolvedValue(DATA);
  vi.mocked(listHeldAchievements).mockResolvedValue({ certificates: held, canRelease: true });
  vi.mocked(listMembersForAdmin).mockResolvedValue([{ id: "m1", displayName: "سارة العتيبي", email: "sara@example.com" }] as never);
  const element = await RecognitionAdminPage({ params: Promise.resolve({ locale: "ar" }) });
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <main>{element}</main>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const section = (name: string | RegExp) => screen.getByRole("heading", { name }).closest("section") as HTMLElement;
const cards = (el: HTMLElement) => within(el.querySelector("ul.space-y-3") as HTMLElement).getAllByRole("listitem");

describe("RecognitionAdminPage", () => {
  beforeEach(() => {
    Object.values(actions).forEach((a) => a.mockReset());
    releaseAchievements.mockReset();
  });

  it("no held certificates: no section and no heading over nothing", async () => {
    await renderPage([]);
    expect(screen.queryByRole("heading", { name: /بانتظار الإطلاق/ })).toBeNull();
  });

  it("held certificates come first, named by badge or by period, and release after a confirmation that counts them", async () => {
    releaseAchievements.mockResolvedValue(undefined);
    const { container } = await renderPage([
      cert("c1", "ريم القحطاني", { badgeName: "مُقدِّم مُقيَّم" }),
      cert("c2", "خالد الحربي", { period: { kind: "monthly", start: "2026-08-01", end: "2026-08-31" } }),
    ]);
    const headings = Array.from(container.querySelectorAll("h2")).map((h) => h.textContent);
    expect(headings[0]).toContain("شهادات إنجاز بانتظار الإطلاق");
    // The heading carries its count: «… بانتظار الإطلاق 2».
    const [first, second] = cards(section(/شهادات إنجاز بانتظار الإطلاق/));
    expect(first).toHaveTextContent("شارة «مُقدِّم مُقيَّم»");
    expect(second).toHaveTextContent("المتصدّرون · أغسطس 2026");
    expect(second).not.toHaveTextContent("2026-08-01");

    for (const card of [first, second]) fireEvent.click(within(card).getByRole("checkbox"));
    fireEvent.click(screen.getAllByRole("button", { name: "أطلِق المحدَّدة" })[0]);
    const confirm = await screen.findByRole("dialog", { name: "إطلاق شهادتين؟" });
    expect(confirm).toHaveTextContent("لا تُسحب بعد ذلك إلا بإلغائها");
    fireEvent.click(within(confirm).getByRole("button", { name: "أطلِق الشهادات" }));
    await waitFor(() => expect(releaseAchievements).toHaveBeenCalledTimes(1));
    expect((releaseAchievements.mock.calls[0][0] as FormData).getAll("id")).toEqual(["c1", "c2"]);
    expect(await screen.findByText("أُطلقت شهادتان")).toBeInTheDocument();
  });

  it("badges read their rule in words, a retired one says so, and retiring asks first, naming the badge", async () => {
    actions.retireBadge.mockResolvedValue(undefined);
    await renderPage();
    const [regular, rated, annual] = cards(section("الشارات"));
    // Ten is Arabic's «few» form.
    expect(regular).toHaveTextContent("بعد 10 تسجيلات حضور");
    expect(rated).toHaveTextContent("بمتوسط تقييم 4.5 فأعلى على 3 جلسات على الأقل");
    expect(annual).toHaveTextContent("يدويًا فقط");
    expect(annual).toHaveTextContent("متوقفة");

    fireEvent.click(within(regular).getByRole("button", { name: "أوقف الشارة" }));
    const confirm = await screen.findByRole("dialog", { name: "إيقاف شارة «حاضر دائم»؟" });
    expect(confirm).toHaveTextContent("من يحملها يحتفظ بها");
    fireEvent.click(within(confirm).getByRole("button", { name: "أوقف الشارة" }));
    await waitFor(() => expect(actions.retireBadge).toHaveBeenCalledWith("ar", "b1", true));
  });

  it("a new badge: the rule's fields follow the metric, and a refusal lands at the field", async () => {
    actions.saveBadge.mockImplementation(async (_l: string, previous: never, formData: FormData) => ({
      ...withErrors(formStateFrom<string>(formData, { fields: ["name", "metric", "avg"], previous }), { avg: "avgInvalid" }),
      saved: false,
    }));
    await renderPage();
    fireEvent.click(within(section("الشارات")).getAllByRole("button", { name: "أضف شارة" })[0]);
    const dialog = await screen.findByRole("dialog", { name: "شارة جديدة" });
    expect(within(dialog).getByLabelText("الحد المطلوب مطلوب")).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("تُمنح بحسب مطلوب"), { target: { value: "presenter_rating_avg" } });
    expect(within(dialog).queryByLabelText("الحد المطلوب مطلوب")).toBeNull();
    fireEvent.change(within(dialog).getByLabelText("اسم الشارة مطلوب"), { target: { value: "نجم المُقدِّمين" } });
    fireEvent.change(within(dialog).getByLabelText("أدنى متوسط تقييم مطلوب"), { target: { value: "7" } });
    fireEvent.submit(dialog.querySelector("form")!);
    expect(await within(dialog).findByRole("alert")).toBeInTheDocument();
    expect(within(dialog).getByLabelText("أدنى متوسط تقييم مطلوب")).toHaveAccessibleDescription(/اكتب متوسطًا من واحد إلى خمسة\./);
    expect((actions.saveBadge.mock.calls[0][2] as FormData).get("badgeId")).toBe("");
  });

  it("the manual award says a badge already held at the member field, with since when", async () => {
    actions.awardBadge.mockImplementation(async (_l: string, previous: never, formData: FormData) => {
      const refused = withErrors(formStateFrom<string>(formData, { fields: ["memberId", "badgeId", "reason"], previous }), { memberId: "alreadyHeld" });
      return { ...refused, values: { ...refused.values, alreadyHeldSince: "2026-08-01T10:00:00Z" }, saved: false };
    });
    await renderPage();
    const award = section("منح شارة يدويًا");
    fireEvent.click(within(award).getByRole("button", { name: "امنح الشارة" }));
    await waitFor(() => expect(actions.awardBadge).toHaveBeenCalled());
    // At the field, and in the summary that links to it.
    expect((await within(award).findAllByText(/يحمل هذا العضو الشارة منذ .*2026/)).length).toBeGreaterThan(0);
    // Retired badges are not offered.
    expect(within(award).queryByRole("option", { name: "كريم المعرفة السنوي" })).toBeNull();
  });

  it("a perk names what grants it, and the hosting gate keeps its warning", async () => {
    await renderPage();
    const [host] = cards(section("الامتيازات"));
    expect(host).toHaveTextContent("عند بلوغ مستوى «صاحب أثر»");
    expect(host).toHaveTextContent("معطَّل افتراضيًا");
  });

  it("has no axe violations, held certificates included", async () => {
    const { container } = await renderPage([cert("c1", "ريم القحطاني", { badgeName: "مُقدِّم مُقيَّم" })]);
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }, 30000);
});

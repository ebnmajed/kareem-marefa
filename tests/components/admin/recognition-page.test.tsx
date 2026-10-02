// SCR-054 · /app/admin/recognition, rebuilt from `AdminRecognition.dc.html` (wave 22, `REQ-UIX-101`, `REQ-UIX-091`).
// The wave-8 cases re-said against the rebuild — each a ledger line in STATUS: read mode shows levels with their ramp
// colour in words, badges with their rule in words and how many hold them, perks and the streak, and no control; the
// held certificates are shown only when there are any, named by badge or by period, issued from the row after a
// confirmation naming the member, released many at once through the selection, and «أوقف» opens its reason sheet. The
// badge sheet's rule follows its metric; the manual award says a badge already held, at the member. Edit mode stages a
// switch and never offers `bonus_points`; the toast reads the receipt. axe on both modes.
import type React from "react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axe from "axe-core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { formStateFrom, withErrors } from "@/lib/form-state";
import type { HeldCertificateRow } from "@/lib/dal/certificates";
import type { RecognitionAdminData } from "@/lib/dal/scoring-admin";
import adminAr from "@/messages/ar/admin.json";
import recognitionAr from "@/messages/ar/recognition.json";
import uiAr from "@/messages/ar/ui.json";

const messages = { ...adminAr, ...recognitionAr, ...uiAr };

const replace = vi.fn();
const push = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/i18n/navigation", () => ({ useRouter: () => ({ replace, push }), Link: (props: React.ComponentProps<"a">) => <a {...props} /> }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => {
    throw new Error("not_found");
  },
}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: vi.fn(), requireSession: vi.fn() }));
vi.mock("@/lib/dal/admin-members", () => ({ listMembersForAdmin: vi.fn() }));
vi.mock("@/lib/dal/proposals", () => ({ getOrgPrefs: async () => ({ timeZone: "Asia/Riyadh", maxCoPresenters: 4 }) }));
vi.mock("@/lib/dal/certificates", () => ({ listHeldAchievements: vi.fn() }));
vi.mock("@/lib/dal/scoring-admin", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/dal/scoring-admin")>()),
  getRecognitionAdminData: vi.fn(),
  getConfigLastSave: vi.fn(),
  listAvatarHrefs: async (_l: string, ids: string[]) => Object.fromEntries(ids.map((id) => [id, null])),
}));
const actions = {
  saveRecognitionEdit: vi.fn(),
  saveBadgeSheet: vi.fn(),
  releaseHeldCertificate: vi.fn(),
  revokeHeldCertificate: vi.fn(),
  awardBadge: vi.fn(),
};
vi.mock("@/app/[locale]/app/admin/recognition/actions", () => actions);
const releaseAchievements = vi.fn();
vi.mock("@/components/certificates/actions", () => ({ releaseAchievements: (...a: unknown[]) => releaseAchievements(...a) }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "recognition.admin" }),
  setRequestLocale: () => {},
}));

const { getRecognitionAdminData, getConfigLastSave } = await import("@/lib/dal/scoring-admin");
const { listHeldAchievements } = await import("@/lib/dal/certificates");
const { listMembersForAdmin } = await import("@/lib/dal/admin-members");
const { default: RecognitionAdminPage } = await import("@/app/[locale]/app/admin/recognition/page");
const { ToastProvider } = await import("@/components/ui/toast");

const T = "2026-10-01T10:00:00.000000+00:00";
const B1 = "b1111111-1111-4111-8111-111111111111";
const DATA: RecognitionAdminData = {
  badges: [
    { id: B1, key: "regular", name: "حاضر دائم", description: "عشرة تسجيلات حضور", issuesCertificate: false, retiredAt: null, rule: { metric: "check_ins_count", gte: 10, minSessions: null }, isManual: false, updatedAt: T, holders: 187 },
    { id: "b2", key: "rated_presenter", name: "مُقدِّم مُقيَّم", description: null, issuesCertificate: true, retiredAt: null, rule: { metric: "presenter_rating_avg", gte: 4.5, minSessions: 3 }, isManual: false, updatedAt: T, holders: 9 },
    { id: "b3", key: "annual", name: "كريم المعرفة السنوي", description: null, issuesCertificate: true, retiredAt: "2026-01-01T00:00:00Z", rule: { metric: "manual", gte: null, minSessions: null }, isManual: true, updatedAt: T, holders: 0 },
  ],
  levels: [
    { id: "l1", name: "مشارِك", thresholdPoints: 0, sortOrder: 1, updatedAt: T },
    { id: "l2", name: "صاحب أثر", thresholdPoints: 300, sortOrder: 3, updatedAt: T },
  ],
  perks: [{ id: "p1", key: "can_host", enabled: false, requiredLevelId: "l2", requiredBadgeId: null, requiredLevelName: "صاحب أثر", requiredBadgeName: null, updatedAt: T }],
  streakRules: [{ id: "s1", key: "monthly_3", requiredCount: 3, bonusPoints: 15, enabled: true, updatedAt: T }],
};

const cert = (id: string, name: string, extra: Partial<HeldCertificateRow>): HeldCertificateRow => ({
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
  memberId: `m-${id}`,
  createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  ...extra,
});

async function renderPage(held: HeldCertificateRow[] = [], searchParams: Record<string, string> = {}) {
  vi.mocked(getRecognitionAdminData).mockResolvedValue(DATA);
  vi.mocked(getConfigLastSave).mockResolvedValue(null);
  vi.mocked(listHeldAchievements).mockResolvedValue({ certificates: held, canRelease: true });
  vi.mocked(listMembersForAdmin).mockResolvedValue([{ id: "m1", displayName: "سارة العتيبي", email: "sara@example.com" }] as never);
  const element = await RecognitionAdminPage({ params: Promise.resolve({ locale: "ar" }), searchParams: Promise.resolve(searchParams) });
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <main>{element}</main>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const rowsOf = (name: string) => within(screen.getAllByRole("table", { name })[0]).getAllByRole("row").slice(1);

beforeEach(() => {
  Object.values(actions).forEach((a) => a.mockReset());
  releaseAchievements.mockReset();
  replace.mockReset();
  push.mockReset();
});

describe("RecognitionAdminPage — read mode", () => {
  it("levels with their ramp colour in words; badges with their rule in words and how many hold them; no control", async () => {
    await renderPage();
    const [first, second] = rowsOf("مستويات المؤسسة");
    expect(first).toHaveTextContent("مشارِك");
    expect(first).toHaveTextContent("رمادي");
    expect(second).toHaveTextContent("300");
    expect(second).toHaveTextContent("فضي");
    const [regular, rated, annual] = rowsOf("شارات المؤسسة");
    // Ten is Arabic's «few» form.
    expect(regular).toHaveTextContent("بعد 10 تسجيلات حضور");
    expect(regular).toHaveTextContent("187");
    expect(rated).toHaveTextContent("بمتوسط تقييم 4.5 فأعلى على 3 جلسات على الأقل");
    expect(annual).toHaveTextContent("يدويًا فقط");
    expect(annual).toHaveTextContent("— متوقف");
    expect(within(regular).getByRole("link", { name: "حاضر دائم" })).toHaveAttribute("href", `/app/admin/recognition?badge=${B1}#badge-editor`);
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("perks name what grants them, and the streak reads its count in the month — never a bonus that nothing pays", async () => {
    await renderPage();
    expect(rowsOf("امتيازات المؤسسة")[0]).toHaveTextContent("عند بلوغ مستوى «صاحب أثر»");
    const [streak] = rowsOf("سلاسل الحضور");
    expect(streak).toHaveTextContent("3 تسجيلات حضور في الشهر");
    expect(streak).not.toHaveTextContent("15");
  });

  it("no held certificates: no section and no heading over nothing", async () => {
    await renderPage([]);
    expect(screen.queryByRole("heading", { name: /بانتظار الإصدار/ })).toBeNull();
  });

  it("held certificates: named by badge or by period, their age, and «أصدر» from the row after a confirmation naming the member", async () => {
    actions.releaseHeldCertificate.mockResolvedValue({ ok: true });
    await renderPage([
      cert("c1", "ريم القحطاني", { badgeName: "مُقدِّم مُقيَّم" }),
      cert("c2", "خالد الحربي", { period: { kind: "monthly", start: "2026-08-01", end: "2026-08-31" } }),
    ]);
    expect(screen.getByRole("heading", { name: /شهادات الإنجاز بانتظار الإصدار/ })).toBeInTheDocument();
    const [first, second] = rowsOf("الشهادات المحجوزة");
    expect(first).toHaveTextContent("شارة «مُقدِّم مُقيَّم»");
    expect(first).toHaveTextContent("يومان");
    expect(second).toHaveTextContent("المتصدّرون · أغسطس 2026");
    expect(second).not.toHaveTextContent("2026-08-01");

    fireEvent.click(within(first).getByRole("button", { name: "أصدر — ريم القحطاني" }));
    const confirm = await screen.findByRole("dialog", { name: "إصدار شهادة «ريم القحطاني»؟" });
    expect(actions.releaseHeldCertificate).not.toHaveBeenCalled();
    fireEvent.click(within(confirm).getByRole("button", { name: "أصدر" }));
    await waitFor(() => expect(actions.releaseHeldCertificate).toHaveBeenCalledWith("ar", "c1"));
    expect(await screen.findByText("أُصدرت الشهادة")).toBeInTheDocument();
  });

  it("«أوقف» opens its reason sheet; many are released at once through the selection, the toast counting what was released", async () => {
    releaseAchievements.mockResolvedValue({ status: "ok", count: 2 });
    await renderPage([cert("c1", "ريم القحطاني", { badgeName: "مُقدِّم مُقيَّم" }), cert("c2", "خالد الحربي", { badgeName: "حاضر دائم" })]);
    const [first, second] = rowsOf("الشهادات المحجوزة");
    fireEvent.click(within(first).getByRole("button", { name: "أوقف — ريم القحطاني" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/app/admin/recognition?revoke=c1#revoke-editor"));

    for (const row of [first, second]) fireEvent.click(within(row).getByRole("checkbox"));
    fireEvent.click(screen.getAllByRole("button", { name: "أطلِق المحدَّدة" })[0]);
    const confirm = await screen.findByRole("dialog", { name: "إطلاق شهادتين؟" });
    fireEvent.click(within(confirm).getByRole("button", { name: "أطلِق الشهادات" }));
    await waitFor(() => expect(releaseAchievements).toHaveBeenCalledTimes(1));
    expect((releaseAchievements.mock.calls[0][0] as FormData).getAll("id")).toEqual(["c1", "c2"]);
    expect(await screen.findByText("أُطلقت شهادتان")).toBeInTheDocument();
  });

  it("«أوقف»'s sheet asks for the reason, and posts it with the certificate", async () => {
    actions.revokeHeldCertificate.mockImplementation(async (_l: string, previous: never, formData: FormData) => ({
      ...withErrors(formStateFrom<string>(formData, { fields: ["certificateId", "reason"], previous }), { reason: "reasonRequired" }),
      saved: false,
    }));
    await renderPage([cert("c1", "ريم القحطاني", { badgeName: "مُقدِّم مُقيَّم" })], { revoke: "c1" });
    const sheet = await screen.findByRole("dialog", { name: "إيقاف شهادة «ريم القحطاني»" });
    fireEvent.submit(sheet.querySelector("form")!);
    await waitFor(() => expect(actions.revokeHeldCertificate).toHaveBeenCalled());
    expect((actions.revokeHeldCertificate.mock.calls[0][2] as FormData).get("certificateId")).toBe("c1");
    expect(await within(sheet).findByText("اكتب السبب.")).toBeInTheDocument();
  });

  it("a new badge, in its sheet: the rule's fields follow the metric, and a refusal lands at the field", async () => {
    actions.saveBadgeSheet.mockImplementation(async (_l: string, previous: never, formData: FormData) => ({
      ...withErrors(formStateFrom<string>(formData, { fields: ["name", "metric", "avg"], previous }), { avg: "avgInvalid" }),
      receipt: null,
    }));
    await renderPage([], { badge: "new" });
    const sheet = await screen.findByRole("dialog", { name: "شارة جديدة" });
    expect(within(sheet).getByLabelText("الحد المطلوب مطلوب")).toBeInTheDocument();
    fireEvent.change(within(sheet).getByLabelText("تُمنح بحسب مطلوب"), { target: { value: "presenter_rating_avg" } });
    expect(within(sheet).queryByLabelText("الحد المطلوب مطلوب")).toBeNull();
    fireEvent.change(within(sheet).getByLabelText("اسم الشارة مطلوب"), { target: { value: "نجم المُقدِّمين" } });
    fireEvent.change(within(sheet).getByLabelText("أدنى متوسط تقييم مطلوب"), { target: { value: "7" } });
    fireEvent.submit(sheet.querySelector("form")!);
    expect(await within(sheet).findByRole("alert")).toBeInTheDocument();
    expect(within(sheet).getByLabelText("أدنى متوسط تقييم مطلوب")).toHaveAccessibleDescription(/اكتب متوسطًا من واحد إلى خمسة\./);
    expect((actions.saveBadgeSheet.mock.calls[0][2] as FormData).get("badgeId")).toBe("");
  });

  it("the manual award says a badge already held at the member field, with since when; retired badges are not offered", async () => {
    actions.awardBadge.mockImplementation(async (_l: string, previous: never, formData: FormData) => {
      const refused = withErrors(formStateFrom<string>(formData, { fields: ["memberId", "badgeId", "reason"], previous }), { memberId: "alreadyHeld" });
      return { ...refused, values: { ...refused.values, alreadyHeldSince: "2026-08-01T10:00:00Z" }, saved: false };
    });
    await renderPage([], { award: "1" });
    const award = await screen.findByRole("dialog", { name: "منح شارة يدويًا" });
    const badge = within(award).getByRole("combobox", { name: /الشارة/ });
    fireEvent.change(badge, { target: { value: (within(badge).getByRole("option", { name: "حاضر دائم" }) as HTMLOptionElement).value } });
    fireEvent.click(within(award).getByRole("button", { name: "امنح الشارة" }));
    await waitFor(() => expect(actions.awardBadge).toHaveBeenCalled());
    const said = await within(award).findAllByText((_, el) => /^يحمل هذا العضو شارة «حاضر دائم» منذ .*2026/.test(el?.textContent ?? "") && el?.children.length !== 0);
    expect(said.length).toBeGreaterThan(0);
    expect((badge as HTMLSelectElement).selectedOptions[0]).toHaveTextContent("حاضر دائم");
    expect(within(award).queryByRole("option", { name: "كريم المعرفة السنوي" })).toBeNull();
  });

  it("has no axe violations, held certificates included", async () => {
    const { container } = await renderPage([cert("c1", "ريم القحطاني", { badgeName: "مُقدِّم مُقيَّم" })]);
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }, 30000);
});

describe("RecognitionAdminPage — edit mode", () => {
  it("a badge's switch STAGES its retirement — nothing is written — counted and named «(معدّل)»; the streak offers no bonus", async () => {
    await renderPage([], { edit: "" });
    await userEvent.click(screen.getByRole("switch", { name: "مفعّل — حاضر دائم" }));
    expect(actions.saveRecognitionEdit).not.toHaveBeenCalled();
    expect(screen.getByText("تغيير واحد غير محفوظ")).toBeInTheDocument();
    expect(screen.getByRole("switch", { name: "مفعّل (معدّل) — حاضر دائم" })).not.toBeChecked();
    expect(screen.queryByRole("textbox", { name: /المكافأة/ })).toBeNull();
    expect(screen.getByText(/معطَّل افتراضيًا/)).toBeInTheDocument();
  });

  it("«لم يتغيّر شيء» from an empty receipt; a refused threshold lands at its level", async () => {
    actions.saveRecognitionEdit.mockResolvedValueOnce({ errors: {}, formError: null, values: {}, lists: {}, attempt: 1, receipt: { at: null, wrote: [] } });
    await renderPage([], { edit: "" });
    fireEvent.submit(screen.getByRole("button", { name: /^احفظ/ }).closest("form") as HTMLFormElement);
    expect(await screen.findByText("لم يتغيّر شيء", { exact: true })).toBeInTheDocument();
    await waitFor(() => expect(replace).toHaveBeenCalledWith("/app/admin/recognition"));

    actions.saveRecognitionEdit.mockResolvedValueOnce({ errors: { "level-l2-threshold": "thresholdOrder" }, formError: null, values: {}, lists: {}, attempt: 2, receipt: null });
    fireEvent.submit(screen.getByRole("button", { name: /^احفظ/ }).closest("form") as HTMLFormElement);
    const summary = await screen.findByRole("alert");
    expect(within(summary).getByRole("link", { name: /من — صاحب أثر/ })).toHaveAttribute("href", "#level-l2-threshold");
  });

  it("has no axe violations in edit mode", async () => {
    const { container } = await renderPage([], { edit: "" });
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }, 30000);
});

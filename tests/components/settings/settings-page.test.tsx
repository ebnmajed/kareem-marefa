// SCR-029 · /app/me/settings — REQ-UIX-077, DEC-216 §5.15, DEC-218 §2, DEC-219 §1. Mocked DAL, real messages; the
// lead's top row stubbed to the page's heading. The facts `preference-matrix.test.tsx` held are re-asserted here
// (ledger, `029`'s delete): the fixed categories are one sentence and no switch; a category with no optional email
// message (`proposals`) is no row; axe.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import arSettings from "@/messages/ar/settings.json";
import arNotifications from "@/messages/ar/notifications.json";
import arCalendar from "@/messages/ar/calendar.json";
import type { CategoryPreference, MatrixRow, NotificationCategory } from "@/lib/dal/notifications";

const messages = { ...arSettings, ...arNotifications, ...arCalendar };

vi.mock("@/lib/dal/notifications", () => ({ getPreferenceMatrix: vi.fn(), getNotificationMatrix: vi.fn() }));
vi.mock("@/lib/dal/calendar", () => ({ getCalendarConnection: vi.fn() }));
vi.mock("@/lib/dal/members", () => ({ getMe: vi.fn() }));
vi.mock("@/app/[locale]/app/me/settings/actions", () => ({ saveCategory: vi.fn(), setEmailMaster: vi.fn(), saveVisibility: vi.fn() }));
vi.mock("@/components/shell/hub-top-row", () => ({ HubTopRow: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "settings" }),
  setRequestLocale: () => {},
}));

const { getPreferenceMatrix, getNotificationMatrix } = await import("@/lib/dal/notifications");
const { getCalendarConnection } = await import("@/lib/dal/calendar");
const { getMe } = await import("@/lib/dal/members");
const { default: SettingsPage } = await import("@/app/[locale]/app/me/settings/page");

const FIXED: NotificationCategory[] = ["certificates", "moderation", "account"];
const OPTIONAL: NotificationCategory[] = ["new_sessions", "my_sessions", "reminders", "ratings", "social", "recognition", "proposals"];
const row = (category: NotificationCategory, email = true): CategoryPreference => ({
  category,
  switchable: !FIXED.includes(category),
  available: { inApp: true, email: true },
  enabled: { inApp: true, email },
  alwaysOn: [],
});
const MATRIX: MatrixRow[] = [...OPTIONAL.filter((c) => c !== "proposals"), "admin_queue" as NotificationCategory].map((category) => ({
  key: `MSG-${category}`,
  category,
  inApp: true,
  email: true,
  optional: true,
}));

async function renderPage({ staff = false, off = [] as NotificationCategory[], optOut = false, connected = true } = {}) {
  const cats = [...OPTIONAL, ...(staff ? (["admin_queue"] as NotificationCategory[]) : []), ...FIXED];
  vi.mocked(getPreferenceMatrix).mockResolvedValue({ rows: cats.map((c) => row(c, !off.includes(c))), timeZone: "Asia/Riyadh" });
  vi.mocked(getNotificationMatrix).mockResolvedValue(MATRIX);
  vi.mocked(getCalendarConnection).mockResolvedValue(connected ? { provider: "google", connectedAt: "2026-09-01T00:00:00Z", disconnectedAt: null } : null);
  vi.mocked(getMe).mockResolvedValue({ email: "yaman@pp.sa", leaderboardOptOut: optOut } as Awaited<ReturnType<typeof getMe>>);
  const element = await SettingsPage({ params: Promise.resolve({ locale: "ar" }) });
  return render(<NextIntlClientProvider locale="ar" messages={messages}>{element}</NextIntlClientProvider>);
}

const switchNamed = (name: string) => screen.getByRole("switch", { name });

describe("SettingsPage", () => {
  it("draws its own heading and no hub strip, then the master, six category switches and the visibility switch", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "الإعدادات" })).toBeInTheDocument();
    expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
    const names = screen.getAllByRole("switch").map((s) => s.closest("label")!.textContent);
    expect(names).toEqual(["إشعارات البريد", "جلسات جديدة", "جلساتي", "التذكيرات", "التقييمات", "التعليقات والإشارات", "النقاط والتكريم", "الظهور في لوحات الصدارة"]);
  });

  it("★ the fixed categories and the seventeen are ONE sentence, never a switch; proposals is no row (D3)", async () => {
    await renderPage();
    expect(screen.getByText(/تصلك دائمًا رسائل لا تُطفأ/)).toBeInTheDocument();
    for (const name of ["الشهادات", "إشعارات الإشراف", "الحساب", "المقترحات"]) expect(screen.queryByRole("switch", { name })).not.toBeInTheDocument();
  });

  it("admin_queue is a switch for staff only", async () => {
    const { unmount } = await renderPage();
    expect(screen.queryByRole("switch", { name: "قائمة عمل المشرف" })).not.toBeInTheDocument();
    unmount();
    await renderPage({ staff: true });
    expect(switchNamed("قائمة عمل المشرف")).toBeInTheDocument();
  });

  it("the master is derived: on when all are on, off when one is; each category shows its own email preference", async () => {
    const { unmount } = await renderPage();
    expect(switchNamed("إشعارات البريد")).toBeChecked();
    unmount();
    await renderPage({ off: ["social"] });
    expect(switchNamed("إشعارات البريد")).not.toBeChecked();
    expect(switchNamed("التعليقات والإشارات")).not.toBeChecked();
    expect(switchNamed("التذكيرات")).toBeChecked();
  });

  it("each category switch posts its category; visibility is on unless opted out (O1)", async () => {
    const { unmount } = await renderPage();
    expect(switchNamed("التذكيرات").closest("form")!.querySelector('input[type="hidden"][name="category"]')).toHaveAttribute("value", "reminders");
    expect(switchNamed("الظهور في لوحات الصدارة")).toBeChecked();
    unmount();
    await renderPage({ optOut: true });
    expect(switchNamed("الظهور في لوحات الصدارة")).not.toBeChecked();
  });

  it("links to the calendar with its state and to privacy; no «اللغة» row (D6); sign-out posts; the email in <bdi>", async () => {
    await renderPage({ connected: false });
    const calendar = screen.getByRole("link", { name: /تقويم Google/ });
    expect(within(calendar).getByText("غير متصل")).toBeInTheDocument();
    expect(calendar.getAttribute("href")).toMatch(/\/app\/me\/calendar$/);
    expect(screen.getByRole("link", { name: /البيانات والخصوصية/ }).getAttribute("href")).toMatch(/\/app\/me\/privacy$/);
    expect(screen.queryByText("اللغة")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "تسجيل الخروج" }).closest("form")).toHaveAttribute("action", "/api/auth/sign-out");
    expect(screen.getByText("yaman@pp.sa").tagName).toBe("BDI");
  });

  it("is axe-clean", async () => {
    const { container } = await renderPage({ staff: true });
    expect((await axe.run(container)).violations).toEqual([]);
  });
});

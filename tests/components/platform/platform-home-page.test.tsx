// `/app/platform` — the console's home (REQ-ADM-001, REQ-ADM-003, wave 8,
// `docs/plan/notes/platform.md` W8.2). An async Server Component awaited
// directly, the DAL mocked, the real `ar/platform.json`.
//
// ★ The case that matters most is the third: when the alert read FAILS the
// page must say so, and never render «لا شيء يحتاج انتباهك» — an all-clear
// from a function that did not answer is the one lie this screen cannot tell.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/platform.json";
import type { PlatformAlert, PlatformTotals } from "@/lib/dal/platform";

vi.mock("@/lib/dal/platform", async () => ({
  PLATFORM_ALERTS: [],
  listPlatformAlerts: vi.fn(),
  getPlatformTotals: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "platform" }),
  setRequestLocale: () => {},
}));

const { listPlatformAlerts, getPlatformTotals } = await import("@/lib/dal/platform");
const { default: PlatformHomePage } = await import("@/app/[locale]/app/platform/page");

const TOTALS: PlatformTotals = {
  orgs: 3,
  activeOrgs: 2,
  suspendedOrgs: 1,
  members: 1250,
  activeMembers: 1100,
  sessions: 48,
  certificates: 900,
  activeImpersonations: 0,
};

const quiet = (alert: PlatformAlert["alert"], detail: PlatformAlert["detail"] = {}): PlatformAlert => ({ alert, fired: false, detail });

async function renderPage(alerts: PlatformAlert[] | null, totals: PlatformTotals | null = TOTALS) {
  vi.mocked(listPlatformAlerts).mockResolvedValue(alerts);
  vi.mocked(getPlatformTotals).mockResolvedValue(totals);
  const element = await PlatformHomePage({ params: Promise.resolve({ locale: "ar" }) });
  return render(<NextIntlClientProvider locale="ar" messages={ar}>{element}</NextIntlClientProvider>);
}

describe("PlatformHomePage", () => {
  it("renders its own h1 and one primary action — it is a page, not a redirect", async () => {
    await renderPage([quiet("queue_stalled", { oldest_pending_seconds: 3, threshold_seconds: 300 })]);
    expect(screen.getByRole("heading", { level: 1, name: "لوحة المنصة" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "مؤسسة جديدة" })).toHaveAttribute("href", expect.stringContaining("/app/platform/orgs/new"));
  });

  it("lists only the FIRED alerts, in words and Western figures, each linking to the metrics", async () => {
    await renderPage([
      { alert: "queue_stalled", fired: true, detail: { oldest_pending_seconds: 420, threshold_seconds: 300 } },
      quiet("ledger_divergence", { divergences_24h: 0 }),
      { alert: "email_bounce_spike", fired: true, detail: { sent_1h: 40, bounced_1h: 5, rate: 0.125 } },
    ]);
    const section = screen.getByRole("region", { name: /يحتاج انتباهك/ });
    const items = within(section).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent("طابور المهام متوقف");
    expect(items[0]).toHaveTextContent("أقدم مهمة منتظرة: 7 دقائق — الحد: 5 دقائق");
    expect(items[1]).toHaveTextContent("نسبة الارتداد في الساعة الأخيرة: 12.5٪ — المُرسَل: 40");
    expect(section).not.toHaveTextContent("اختلاف في أرصدة النقاط");
    expect(section.textContent).not.toMatch(/[٠-٩۰-۹]/);
  });

  it("★ says the alerts could not be read when the read fails — never an all-clear", async () => {
    await renderPage(null);
    const section = screen.getByRole("region", { name: /يحتاج انتباهك/ });
    expect(section).toHaveTextContent("تعذّر قراءة حالة التنبيهات");
    expect(section).not.toHaveTextContent("لا شيء يحتاج انتباهك");
  });

  it("all clear is a quiet line with a way to the metrics, and the four numbers link to their screens", async () => {
    await renderPage([quiet("queue_stalled", { oldest_pending_seconds: 0, threshold_seconds: 300 })]);
    expect(screen.getByText(/لا شيء يحتاج انتباهك الآن/)).toBeInTheDocument();
    // No bare «0» beside the heading when nothing fires (sync 2).
    expect(screen.getByRole("heading", { level: 2, name: /يحتاج انتباهك/ })).toHaveTextContent(/^يحتاج انتباهك$/);
    const numbers = screen.getByRole("region", { name: "المنصة بالأرقام" });
    expect(within(numbers).getByRole("link", { name: /الأعضاء النشطون/ })).toHaveTextContent("1,100");
    expect(within(numbers).getByRole("link", { name: /المؤسسات النشطة/ })).toHaveAttribute("href", expect.stringContaining("/app/platform/orgs"));
  });

  it("is axe-clean with an alert firing", async () => {
    const { container } = await renderPage([{ alert: "storage_prefix_violation", fired: true, detail: { violations_24h: 1 } }]);
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations).toEqual([]);
  });
});

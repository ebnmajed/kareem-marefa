// SCR-084 · /app/platform/metrics — wave 8 (`docs/plan/notes/platform.md` W8.7).
// REQ-ADM-003 («… job health, error rates — aggregate only»), REQ-NFR-016.
//
// The page is an async Server Component with three client tables; the DAL is
// mocked, the real `ar/platform.json` renders. The two properties that matter:
// all eight alerts appear with the worker's own readings (the «error rates» the
// requirement names), and a FAILED alert read is said, never shown as quiet rows.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import arPlatform from "@/messages/ar/platform.json";
import arAdmin from "@/messages/ar/admin.json";
import type { JobHealthRow, OrgSummary, PlatformAlert } from "@/lib/dal/platform";

vi.mock("@/lib/dal/platform", () => ({
  listPlatformAlerts: vi.fn(),
  getPlatformTotals: vi.fn(async () => ({
    orgs: 2,
    activeOrgs: 2,
    suspendedOrgs: 0,
    members: 30,
    activeMembers: 28,
    sessions: 6,
    certificates: 9,
    activeImpersonations: 1,
  })),
  getJobHealth: vi.fn(async (): Promise<JobHealthRow[]> => [{ task: "render_variant", pending: 3, failed: 1, oldestPendingSeconds: 420 }]),
  listOrgs: vi.fn(async (): Promise<OrgSummary[]> => [
    {
      id: "0c1a3a2e-6a55-4d6f-8f1e-3f5b0b9e2a11",
      name: "Acme",
      slug: "acme",
      status: "active",
      createdAt: "2026-09-01T00:00:00Z",
      members: 30,
      activeMembers: 28,
      sessions: 6,
      publishedSessions: 4,
      completedSessions: 2,
      certificates: 9,
      deletionPending: false,
    },
  ]),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: arPlatform, namespace: namespace as "platform" }),
  setRequestLocale: () => {},
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ refresh: vi.fn() }),
}));

const { listPlatformAlerts } = await import("@/lib/dal/platform");
const { default: PlatformMetricsPage } = await import("@/app/[locale]/app/platform/metrics/page");

const EIGHT: PlatformAlert[] = [
  { alert: "queue_stalled", fired: false, detail: { oldest_pending_seconds: 12, threshold_seconds: 300 } },
  { alert: "ledger_divergence", fired: false, detail: { divergences_24h: 0 } },
  { alert: "parity_failure", fired: false, detail: { failed_fonts_24h: 0 } },
  { alert: "calendar_backlog", fired: false, detail: { pending: 0, oldest_seconds: 0 } },
  { alert: "email_bounce_spike", fired: true, detail: { sent_1h: 40, bounced_1h: 5, rate: 0.125 } },
  { alert: "render_failures", fired: false, detail: { consecutive_failures: 1, threshold: 3 } },
  { alert: "storage_prefix_violation", fired: false, detail: { violations_24h: 0 } },
  { alert: "impersonation_active", fired: false, detail: { open_over_hours: 2, sessions: 0 } },
];

async function renderPage(alerts: PlatformAlert[] | null) {
  vi.mocked(listPlatformAlerts).mockResolvedValue(alerts);
  const element = await PlatformMetricsPage({ params: Promise.resolve({ locale: "ar" }) });
  return render(<NextIntlClientProvider locale="ar" messages={{ ...arPlatform, ...arAdmin }}>{element}</NextIntlClientProvider>);
}

describe("PlatformMetricsPage", () => {
  it("★ REQ-ADM-003: all eight alerts, the error rates among them, in the worker's own readings", async () => {
    await renderPage(EIGHT);
    const section = screen.getByRole("region", { name: /التنبيهات/ });
    const table = within(section).getByRole("table", { name: "التنبيهات" });
    expect(within(table).getAllByRole("row")).toHaveLength(9); // header + eight
    expect(table).toHaveTextContent("نسبة الارتداد في الساعة الأخيرة: 12.5٪ — المُرسَل: 40");
    expect(table).toHaveTextContent("إخفاقات متتالية: 1 — الحد: 3");
    expect(within(table).getAllByText("مُطلق")).toHaveLength(1);
    expect(section.textContent).not.toMatch(/[٠-٩۰-۹]/);
  });

  it("★ a failed alert read is said, not shown as eight quiet rows", async () => {
    await renderPage(null);
    const section = screen.getByRole("region", { name: /التنبيهات/ });
    expect(section).toHaveTextContent("تعذّر قراءة حالة التنبيهات");
    expect(within(section).queryByText("سليم")).not.toBeInTheDocument();
  });

  it("job health puts the oldest pending age second, in words, and the totals are aggregate", async () => {
    await renderPage(EIGHT);
    const jobs = screen.getByRole("table", { name: "صحة المهام" });
    const headers = within(jobs).getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers[1]).toBe("أقدم منتظرة");
    expect(jobs).toHaveTextContent("7 دقائق");
    expect(screen.getByRole("region", { name: "الأرقام الإجمالية" })).toHaveTextContent("28");
  });

  it("is axe-clean", async () => {
    const { container } = await renderPage(EIGHT);
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations).toEqual([]);
  });
});

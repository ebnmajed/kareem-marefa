// `/app/platform` — `job_exhausted` on the console's home (wave 11,
// REQ-NFR-016, REQ-ADM-003, `docs/plan/notes/platform.md` W11.3).
//
// A job that has used its last attempt is listed by its TASK and a COUNT —
// never a payload (DEC-014). And the rule the alerts already keep: when the
// read fails the page says so, and never renders «لا شيء يحتاج انتباهك».
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/platform.json";
import type { ExhaustedTask, PlatformAlert, PlatformTotals } from "@/lib/dal/platform";

vi.mock("@/lib/dal/platform", async () => ({
  PLATFORM_ALERTS: [],
  listPlatformAlerts: vi.fn(),
  getPlatformTotals: vi.fn(),
  listExhaustedJobs: vi.fn(),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "platform" }),
  setRequestLocale: () => {},
}));

const { listPlatformAlerts, getPlatformTotals, listExhaustedJobs } = await import("@/lib/dal/platform");
const { default: PlatformHomePage } = await import("@/app/[locale]/app/platform/page");

const TOTALS: PlatformTotals = {
  orgs: 1,
  activeOrgs: 1,
  suspendedOrgs: 0,
  members: 10,
  activeMembers: 10,
  sessions: 2,
  certificates: 0,
  activeImpersonations: 0,
};
const QUIET: PlatformAlert[] = [{ alert: "queue_stalled", fired: false, detail: { oldest_pending_seconds: 0, threshold_seconds: 300 } }];

async function renderPage(exhausted: ExhaustedTask[] | null, alerts: PlatformAlert[] | null = QUIET) {
  vi.mocked(listPlatformAlerts).mockResolvedValue(alerts);
  vi.mocked(getPlatformTotals).mockResolvedValue(TOTALS);
  vi.mocked(listExhaustedJobs).mockResolvedValue(exhausted);
  const element = await PlatformHomePage({ params: Promise.resolve({ locale: "ar" }) });
  return render(<NextIntlClientProvider locale="ar" messages={ar}>{element}</NextIntlClientProvider>);
}

const attention = () => screen.getByRole("region", { name: /يحتاج انتباهك/ });

describe("PlatformHomePage — jobs that used their last attempt", () => {
  it("★ lists each task by name, isolated left-to-right, with its count in words and Western figures", async () => {
    await renderPage([
      { task: "record_survey_response", jobs: 12 },
      { task: "issue_certificates", jobs: 1 },
    ]);
    const section = attention();
    expect(within(section).getByRole("heading", { level: 2 })).toHaveTextContent("يحتاج انتباهك (1)");
    const list = within(section).getByRole("list", { name: "مهام استنفدت محاولاتها" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("record_survey_response");
    expect(rows[0]).toHaveTextContent("12 مهمة");
    expect(rows[1]).toHaveTextContent("مهمة واحدة");
    const name = rows[0].querySelector("bdi");
    expect(name).toHaveAttribute("dir", "ltr");
    expect(name).toHaveTextContent(/^record_survey_response$/);
    expect(within(section).getByRole("link", { name: "عرض صحة المهام" })).toHaveAttribute(
      "href",
      expect.stringContaining("/app/platform/metrics#jobs"),
    );
    expect(section).not.toHaveTextContent("لا شيء يحتاج انتباهك");
    expect(section.textContent).not.toMatch(/[٠-٩۰-۹]/);
  });

  it("sits beside a fired alert, and the heading counts both", async () => {
    await renderPage(
      [{ task: "record_survey_response", jobs: 2 }],
      [{ alert: "storage_prefix_violation", fired: true, detail: { violations_24h: 1 } }],
    );
    const section = attention();
    expect(within(section).getByRole("heading", { level: 2 })).toHaveTextContent("يحتاج انتباهك (2)");
    expect(within(section).getByText("مهمتان")).toBeInTheDocument();
  });

  it("nothing dead and every alert quiet is the all-clear, with no card", async () => {
    await renderPage([]);
    expect(attention()).toHaveTextContent("لا شيء يحتاج انتباهك الآن");
    expect(screen.queryByText("مهام استنفدت محاولاتها")).not.toBeInTheDocument();
  });

  it("★ a failed read is said, and blocks the all-clear", async () => {
    await renderPage(null);
    const section = attention();
    expect(section).toHaveTextContent("تعذّر قراءة المهام المتعثرة");
    expect(section).not.toHaveTextContent("لا شيء يحتاج انتباهك");
  });

  it("the cards survive a failed ALERT read — both failures are said", async () => {
    await renderPage([{ task: "record_survey_response", jobs: 1 }], null);
    const section = attention();
    expect(section).toHaveTextContent("تعذّر قراءة حالة التنبيهات");
    expect(section).toHaveTextContent("record_survey_response");
  });

  it("is axe-clean with the card showing", async () => {
    const { container } = await renderPage([{ task: "record_survey_response", jobs: 3 }]);
    expect((await axe.run(container, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations).toEqual([]);
  });
});

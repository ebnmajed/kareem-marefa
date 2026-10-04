// /app/me/privacy — REQ-UIX-117, REQ-PRF-006, REQ-NFR-005, REQ-EVT-012, DEC-251 §3. The DAL is mocked; the copy is the
// real Arabic. ★ Each export state is drawn from the row, never assumed: never asked, requested, building, ready with
// its date and «نزّل», expired, failed — and the 24-hour limit said before the click.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import privacyAr from "@/messages/ar/privacy.json";
import uiAr from "@/messages/ar/ui.json";
import appAr from "@/messages/ar/app.json";
import settingsAr from "@/messages/ar/settings.json";
import type { DataExportRequest } from "@/lib/dal/privacy";

const messages = { ...privacyAr, ...uiAr, ...appAr, ...settingsAr };

vi.mock("@/lib/dal/privacy", () => ({ getMyExportRequest: vi.fn(), countMyPhotoRemovalRequests: vi.fn() }));
vi.mock("@/lib/dal/proposals", () => ({ getOrgPrefs: vi.fn(async () => ({ timeZone: "Asia/Riyadh", maxCoPresenters: 2 })) }));
vi.mock("@/components/privacy/avatar-section", () => ({ AvatarSection: () => <section aria-label="avatar" /> }));
vi.mock("@/components/shell/hub-top-row", () => ({ HubTopRow: ({ title, backHref, backLabel }: { title: string; backHref: string; backLabel: string }) => <h1 data-back={backHref} data-back-label={backLabel}>{title}</h1> }));
vi.mock("@/app/[locale]/app/me/privacy/actions", () => ({ requestExportAction: vi.fn(), requestDeactivationAction: vi.fn() }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "privacy.page" }),
}));

const { getMyExportRequest, countMyPhotoRemovalRequests } = await import("@/lib/dal/privacy");
const { default: MyPrivacyPage } = await import("@/app/[locale]/app/me/privacy/page");

const OLD = "2026-10-01T09:00:00Z";
const row = (over: Partial<DataExportRequest>): DataExportRequest => ({
  id: "r1",
  status: "queued",
  requestedAt: OLD,
  completedAt: null,
  byteSize: null,
  error: null,
  canRequestAgain: true,
  ...over,
});

async function show() {
  const el = await MyPrivacyPage({ params: Promise.resolve({ locale: "ar" }) });
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      {el}
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  vi.mocked(countMyPhotoRemovalRequests).mockResolvedValue(3);
});

describe("/app/me/privacy", () => {
  it("★ the artboard's title, and back goes to settings (DEC-NEXT-39)", async () => {
    vi.mocked(getMyExportRequest).mockResolvedValue(null);
    await show();
    expect(screen.getByRole("heading", { level: 1, name: "البيانات والخصوصية" })).toHaveAttribute("data-back", "/app/me/settings");
    expect(screen.getByRole("heading", { level: 1 })).toHaveAttribute("data-back-label", "الإعدادات");
  });

  it("never asked: the request control", async () => {
    vi.mocked(getMyExportRequest).mockResolvedValue(null);
    await show();
    expect(screen.getByRole("button", { name: "اطلب التصدير" })).toBeInTheDocument();
  });

  it("requested: «طُلب» with its date, no control", async () => {
    vi.mocked(getMyExportRequest).mockResolvedValue(row({ status: "queued", canRequestAgain: false }));
    await show();
    expect(screen.getByText("طُلب · 1 أكتوبر")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /اطلب/ })).not.toBeInTheDocument();
  });

  it("building: «جارٍ», no control", async () => {
    vi.mocked(getMyExportRequest).mockResolvedValue(row({ status: "building", canRequestAgain: false }));
    await show();
    expect(screen.getByText("جارٍ")).toBeInTheDocument();
  });

  it("★ ready: its date, «نزّل» as a plain download link, and the seven days", async () => {
    vi.mocked(getMyExportRequest).mockResolvedValue(row({ status: "ready", completedAt: "2026-10-02T09:00:00Z", canRequestAgain: false }));
    await show();
    expect(screen.getByText("جاهز · 2 أكتوبر")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "نزّل" });
    expect(link).toHaveAttribute("href", "/api/me/export");
    expect(link).toHaveAttribute("download");
    expect(screen.getByText(/سبعة أيام/)).toBeInTheDocument();
  });

  it("expired: said, and a fresh copy offered once the window has passed", async () => {
    vi.mocked(getMyExportRequest).mockResolvedValue(row({ status: "expired" }));
    await show();
    expect(screen.getByText("انتهت صلاحيته")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "اطلب نسخة جديدة" })).toBeInTheDocument();
  });

  it("★ REQ-NFR-005: failed inside the 24 hours — the limit said before the click, no button", async () => {
    vi.mocked(getMyExportRequest).mockResolvedValue(row({ status: "failed", canRequestAgain: false }));
    await show();
    expect(screen.getByText("تعثّر")).toBeInTheDocument();
    expect(screen.getByText(/أربع وعشرين ساعة/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /اطلب/ })).not.toBeInTheDocument();
  });

  it("★ DEC-251 §3.1: the photos row counts the member's own removal requests and offers no page-level «أزلني»", async () => {
    vi.mocked(getMyExportRequest).mockResolvedValue(null);
    await show();
    expect(screen.getByText("صور طلبت إزالتها")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "أزلني" })).not.toBeInTheDocument();
  });

  it("the two legal links, the export's promise, the avatar answer, and «إيقاف حسابي»", async () => {
    vi.mocked(getMyExportRequest).mockResolvedValue(null);
    await show();
    expect(screen.getByRole("link", { name: /سياسة الخصوصية/ })).toHaveAttribute("href", "/legal/privacy");
    expect(screen.getByRole("link", { name: /الشروط والأحكام/ })).toHaveAttribute("href", "/legal/terms");
    expect(screen.getByText(/لا يحوي الملف بيانات شخصية لعضو آخر/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "avatar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إيقاف حسابي" })).toBeInTheDocument();
  });
});

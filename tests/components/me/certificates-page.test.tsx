// `/app/me/certificates` — SCR-023, REQ-CRT-013, REQ-CRT-014. Same
// real-messages + mocked-DAL pattern as materials/list.test.tsx: an async
// Server Component, awaited directly, real ar/certificates.json through
// next-intl's createTranslator.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/certificates.json";
import type { CertificateRow, MyCertificates } from "@/lib/dal/certificates";

vi.mock("@/lib/dal/certificates", () => ({
  listMyCertificates: vi.fn(),
  signCertificateUrl: vi.fn().mockResolvedValue(null),
  getOrgTimeZone: vi.fn().mockResolvedValue("Asia/Riyadh"),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "certificates" }),
}));

const { listMyCertificates, signCertificateUrl } = await import("@/lib/dal/certificates");
const { default: MyCertificatesPage } = await import("@/app/[locale]/app/me/certificates/page");

function cert(overrides: Partial<CertificateRow> = {}): CertificateRow {
  return {
    id: "c1",
    kind: "attendance",
    state: "issued",
    serial: "KM-2026-000123",
    verificationCode: "abcdefghijklmnopqrstuvwx",
    recipientName: "ريم العتيبي",
    issuedAt: "2026-09-10T10:00:00Z",
    revokedAt: null,
    revocationReason: null,
    sessionId: "s1",
    sessionTitle: "جلسة الاختبار",
    achievementName: null,
    documentId: "d1",
    pdfPath: "orgs/o1/certs/c1.pdf",
    ...overrides,
  };
}

async function renderPage(certificates: CertificateRow[]) {
  vi.mocked(listMyCertificates).mockResolvedValue({ certificates } as MyCertificates);
  const element = await MyCertificatesPage({ params: Promise.resolve({ locale: "ar" }) });
  return render(<NextIntlClientProvider locale="ar" messages={ar}>{element}</NextIntlClientProvider>);
}

describe("MyCertificatesPage", () => {
  it("shows the empty state with its own next action — REQ-UIX-012, the lead's sync-2 ruling", async () => {
    await renderPage([]);
    expect(screen.getByText("لا شهادات بعد", { exact: false })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "تصفّح الجلسات" })).toHaveAttribute("href", "/ar/app/sessions");
  });

  it("shows an issued certificate's serial and code isolated LTR inside their own <bdi>", async () => {
    await renderPage([cert()]);
    const serial = screen.getByText("KM-2026-000123");
    expect(serial.closest("bdi")).toHaveAttribute("dir", "ltr");
    expect(screen.getByText("صالحة")).toBeInTheDocument();
  });

  it("shows a revoked certificate's reason — the one place a member sees it", async () => {
    await renderPage([cert({ state: "revoked", revokedAt: "2026-09-12T10:00:00Z", revocationReason: "تكرار الإصدار بالخطأ" })]);
    expect(screen.getByText("ملغاة")).toBeInTheDocument();
    expect(screen.getByText(/تكرار الإصدار بالخطأ/)).toBeInTheDocument();
  });

  it("shows 'preparing' rather than a broken download when the PDF has not rendered yet", async () => {
    vi.mocked(signCertificateUrl).mockResolvedValueOnce(null);
    await renderPage([cert({ pdfPath: null })]);
    expect(screen.getByText("الشهادة قيد التجهيز")).toBeInTheDocument();
    expect(screen.queryByText("نزّل الشهادة")).not.toBeInTheDocument();
  });

  it("is axe-clean with a mixed list", async () => {
    const { container } = await renderPage([cert(), cert({ id: "c2", state: "revoked", revocationReason: "سبب" })]);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});

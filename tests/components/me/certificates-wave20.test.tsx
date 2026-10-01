// SCR-023 rebuilt (wave 20) — REQ-UIX-073, REQ-CRT-013, DEC-218 §4.1. The row is ONE link to the audited route; a
// revoked row is struck, says «ملغاة» and keeps its reason and its download; a valid row says nothing about its state.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/certificates.json";
import type { CertificateRow, MyCertificates } from "@/lib/dal/certificates";

vi.mock("@/lib/dal/certificates", () => ({
  listMyCertificates: vi.fn(),
  getOrgTimeZone: vi.fn().mockResolvedValue("Asia/Riyadh"),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "certificates" }),
  setRequestLocale: () => {},
}));
vi.mock("@/components/shell/hub-top-row", () => ({ HubTopRow: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/shell/hub-strip", () => ({ HubStrip: () => null }));

const { listMyCertificates } = await import("@/lib/dal/certificates");
const { default: MyCertificatesPage } = await import("@/app/[locale]/app/me/certificates/page");

const YEAR = new Date().getFullYear();

function cert(overrides: Partial<CertificateRow> = {}): CertificateRow {
  return {
    id: "c1",
    kind: "attendance",
    state: "issued",
    serial: "KM-2026-000123",
    verificationCode: "abcdefghijklmnopqrstuvwx",
    recipientName: "ريم العتيبي",
    issuedAt: `${YEAR}-10-01T10:00:00Z`,
    revokedAt: null,
    revocationReason: null,
    sessionId: "s1",
    sessionTitle: "الأرقام التي تكذب",
    achievementName: null,
    documentId: "d1",
    pdfPath: "orgs/o1/certs/c1.pdf",
    downloadHref: "/api/designer/downloads/a1",
    ...overrides,
  };
}

async function renderPage(certificates: CertificateRow[], download?: string) {
  vi.mocked(listMyCertificates).mockResolvedValue({ certificates } as MyCertificates);
  const element = await MyCertificatesPage({ params: Promise.resolve({ locale: "ar" }), searchParams: Promise.resolve(download ? { download } : {}) });
  return render(<NextIntlClientProvider locale="ar" messages={ar}>{element}</NextIntlClientProvider>);
}

describe("SCR-023 — one list (wave 20)", () => {
  it("★ a row is ONE link to the audited route — no second link, no download attribute, no signed URL", async () => {
    await renderPage([cert()]);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveAttribute("href", "/api/designer/downloads/a1");
    expect(links[0]).not.toHaveAttribute("download");
    expect(links[0]).toHaveAccessibleName(/الأرقام التي تكذب/);
  });

  it("draws «kind · date» with the date in Western digits and no year in the current one", async () => {
    await renderPage([cert()]);
    expect(screen.getByText("شهادة حضور", { exact: false })).toHaveTextContent(/شهادة حضور · 1 أكتوبر$/);
  });

  it("★ a revoked row: struck, «ملغاة», the reason, the serial — and still its download (REQ-CRT-013, REQ-CRT-011)", async () => {
    await renderPage([cert({ state: "revoked", revocationReason: "إصدار مكرر بالخطأ" })]);
    const link = screen.getByRole("link");
    expect(within(link).getByText("الأرقام التي تكذب").closest("span")).toHaveClass("line-through");
    expect(within(link).getByText("ملغاة")).toBeInTheDocument();
    expect(within(link).getByText("إصدار مكرر بالخطأ").closest("bdi")).not.toBeNull();
    expect(within(link).getByText("KM-2026-000123").closest("bdi")).toHaveAttribute("dir", "ltr");
  });

  it("an achievement certificate falls back to its badge's name", async () => {
    await renderPage([cert({ kind: "achievement", sessionTitle: null, achievementName: "المتصدّر" })]);
    expect(screen.getByRole("link")).toHaveAccessibleName(/المتصدّر/);
  });

  it("★ a refused download comes back here and the page says so (DEC-177)", async () => {
    await renderPage([cert()], "failed");
    expect(screen.getByRole("alert")).toHaveTextContent(ar.certificates.download.failed);
  });

  it("carries no code and no /verify link in the list (REQ-UIX-073)", async () => {
    await renderPage([cert()]);
    expect(screen.queryByText("abcdefghijklmnopqrstuvwx")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /التحقّق/ })).not.toBeInTheDocument();
  });
});

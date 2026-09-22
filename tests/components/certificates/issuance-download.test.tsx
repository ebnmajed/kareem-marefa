// SCR-045's per-certificate download — DEC-176 §2 (D5), DEC-177, SC 2.5.8.
//
// The link is the ONE audited route, never a signed URL, and — the lead's M4
// finding at 390 px — a real target: the bare word measured 18.4 × 24 px beside
// «ألغِ». jsdom has no layout, so the size is asserted by what sets it: the
// small button's class, whose `h-9` is 36 px. Its name and href are what two
// specs locate it by, and they do not change.
import type React from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import arCertificates from "@/messages/ar/certificates.json";
import arUi from "@/messages/ar/ui.json";
import arAdmin from "@/messages/ar/admin.json";
import type { SessionCertificateRow } from "@/lib/dal/certificates";

vi.mock("@/app/[locale]/app/admin/sessions/[id]/certificates/actions", () => ({
  releaseHeld: vi.fn(),
  retryCertificateRender: vi.fn(),
  revokeIssued: vi.fn(),
}));
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show: vi.fn() }) }));

const { CertificateIssuance } = await import("@/components/certificates/issuance");

const row = (overrides: Partial<SessionCertificateRow> = {}): SessionCertificateRow => ({
  id: "c1",
  kind: "presenter",
  state: "issued",
  serial: "DL-2026-000001",
  verificationCode: "abcdefghijklmnopqrstuvwx",
  recipientName: "ريم الحاصلة على الشهادة",
  issuedAt: "2026-09-20T10:00:00Z",
  revokedAt: null,
  revocationReason: null,
  sessionId: "s1",
  sessionTitle: "جلسة",
  achievementName: null,
  documentId: "d1",
  pdfPath: "o/exports/d1/cert_landscape.pdf",
  downloadHref: "/api/designer/downloads/a1",
  memberId: "m1",
  scheme: "light",
  templateVersionId: "v1",
  renderStatus: "ready",
  failedArtifactId: null,
  renderError: null,
  ...overrides,
});

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={{ ...arCertificates, ...arUi, ...arAdmin }} timeZone="Asia/Riyadh">
    <div dir="rtl">{children}</div>
  </NextIntlClientProvider>
);

function mount(issued: SessionCertificateRow[]) {
  return render(
    <CertificateIssuance locale="ar" sessionId="s1" sessionTitle="جلسة" timeZone="Asia/Riyadh" mode="automatic" held={[]} issued={issued} revoked={[]} />,
    { wrapper: Wrap },
  );
}

describe("SCR-045's certificate download", () => {
  it("★ the link is the audited route, named for its person, and a button-sized target (SC 2.5.8)", () => {
    const { container } = mount([row()]);
    // The table and the phone's cards both carry it (one is hidden by a media
    // query jsdom does not apply), so every copy is checked, by its href. The
    // accessible name is asserted as text here and by role in the two specs
    // that locate it (`wave13-designer-certificates-download`, the M4 demo).
    const links = [...container.querySelectorAll<HTMLAnchorElement>('a[href="/api/designer/downloads/a1"]')];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.textContent?.replace(/\s+/g, " ").trim()).toBe("نزّل شهادة ريم الحاصلة على الشهادة");
      expect(link).not.toHaveAttribute("download");
      expect(link.className).toContain("h-9");
    }
  });

  it("no ready PDF, no link — never a link that would fail", () => {
    mount([row({ downloadHref: null, renderStatus: "rendering" })]);
    expect(document.querySelector('a[href^="/api/designer/downloads/"]')).toBeNull();
  });
});

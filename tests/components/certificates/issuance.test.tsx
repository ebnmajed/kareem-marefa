// SCR-045 after completion, rebuilt for wave 23 from `AdminCertificates.dc.html` — REQ-UIX-109, REQ-CRT-004, REQ-CRT-011,
// DEC-177, SC 2.5.3, SC 2.5.8. With the actions mocked:
//   · «PDF» is the ONE audited route, a 36 px target whose accessible name begins with its visible word, never `download`;
//   · no rendered file, no link — the row says pending;
//   · «أصدر» on one row, «أصدر المحدّد» and «أصدر الكل» each confirm with the count, then release exactly those ids;
//   · «ألغِ» is a link to `?revoke=<id>` — the reason is written in the sheet, without JS too;
//   · the serial is `<bdi dir="ltr">`; the issued list stops at its limit with «N أخرى · المزيد».
import type React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import arAdmin from "@/messages/ar/admin.json";
import arCertificates from "@/messages/ar/certificates.json";
import arUi from "@/messages/ar/ui.json";
import type { SessionCertificateRow } from "@/lib/dal/certificates";

const releaseHeld = vi.fn();
vi.mock("@/app/[locale]/app/admin/sessions/[id]/certificates/actions", () => ({
  releaseHeld: (...a: unknown[]) => releaseHeld(...a),
  retryCertificateRender: vi.fn(),
}));
const show = vi.fn();
vi.mock("@/components/ui/toast", () => ({ useToast: () => ({ show }) }));

const { Issuance } = await import("@/app/[locale]/app/admin/sessions/[id]/certificates/issuance");

const row = (over: Partial<SessionCertificateRow> = {}): SessionCertificateRow => ({
  id: "c1",
  kind: "attendance",
  state: "issued",
  serial: "KM-2026-000214",
  verificationCode: "abcdefghijklmnopqrstuvwx",
  recipientName: "سارة القحطاني",
  issuedAt: "2026-10-01T10:00:00Z",
  revokedAt: null,
  revocationReason: null,
  sessionId: "s1",
  sessionTitle: "جلسة",
  achievementName: null,
  documentId: "d1",
  pdfPath: "o/exports/d1/cert_landscape.pdf",
  downloadHref: "/api/designer/downloads/a1",
  memberId: "11111111-1111-4111-8111-111111111111",
  scheme: "light",
  templateVersionId: "v1",
  renderStatus: "ready",
  failedArtifactId: null,
  renderError: null,
  ...over,
});

const Wrap = ({ children }: { children: React.ReactNode }) => (
  <NextIntlClientProvider locale="ar" messages={{ ...arCertificates, ...arUi, ...arAdmin }} timeZone="Asia/Riyadh">
    <div dir="rtl">{children}</div>
  </NextIntlClientProvider>
);

function mount(props: Partial<React.ComponentProps<typeof Issuance>> = {}) {
  return render(
    <Issuance
      locale="ar"
      sessionId="s1"
      sessionTitle="الأرقام التي تكذب"
      timeZone="Asia/Riyadh"
      showHeld
      held={[]}
      issued={[row()]}
      revoked={[]}
      faces={{}}
      issuedLimit={20}
      path="/app/admin/sessions/s1/certificates"
      {...props}
    />,
    { wrapper: Wrap },
  );
}

beforeEach(() => {
  releaseHeld.mockReset().mockResolvedValue({ status: "ok", count: 1 });
  show.mockReset();
});

describe("SCR-045 — issued", () => {
  it("★ «PDF» is the audited route, a button-sized target named «PDF — نزّل شهادة …», never a download attribute", () => {
    const { container } = mount();
    const links = [...container.querySelectorAll<HTMLAnchorElement>('a[href="/api/designer/downloads/a1"]')];
    expect(links.length).toBeGreaterThan(0);
    for (const link of links) {
      expect(link.textContent?.replace(/\s+/g, " ").trim()).toBe("PDF — نزّل شهادة سارة القحطاني");
      expect(link).not.toHaveAttribute("download");
      expect(link.className).toContain("h-9");
    }
  });

  it("no rendered file, no link — the row says pending", () => {
    mount({ issued: [row({ downloadHref: null, renderStatus: "rendering" })] });
    expect(document.querySelector('a[href^="/api/designer/downloads/"]')).toBeNull();
    expect(screen.getAllByText("قيد التجهيز").length).toBeGreaterThan(0);
  });

  it("«ألغِ» is a link to the revoke sheet, named for its person; the serial is <bdi dir=ltr>", () => {
    const { container } = mount();
    const revoke = container.querySelector<HTMLAnchorElement>('a[href*="?revoke=c1"]');
    expect(revoke).not.toBeNull();
    expect(revoke).toHaveAttribute("aria-label", "ألغِ — سارة القحطاني");
    expect(container.querySelector('bdi[dir="ltr"]')?.textContent).toBe("KM-2026-000214");
  });

  it("the list stops at its limit and says how many more, with a link to all", () => {
    const many = Array.from({ length: 23 }, (_, i) => row({ id: `c${i}`, serial: `KM-2026-${String(i).padStart(6, "0")}` }));
    mount({ issued: many, issuedLimit: 20 });
    const more = screen.getByRole("link", { name: "3 أخرى · المزيد" });
    expect(more.getAttribute("href")).toContain("?issued=all");
  });
});

describe("SCR-045 — held", () => {
  const held = [row({ id: "h1", state: "held", recipientName: "يمان", downloadHref: null }), row({ id: "h2", state: "held", recipientName: "ريم الشهري", downloadHref: null })];

  it("★ «أصدر» on one row confirms with the count and the session, then releases exactly that id", async () => {
    const user = userEvent.setup();
    mount({ held, issued: [] });
    await user.click(screen.getAllByRole("button", { name: "أصدر — ريم الشهري" })[0]);
    const dialog = screen.getByRole("dialog");
    expect(dialog).toHaveTextContent("إصدار شهادة واحدة؟");
    expect(dialog).toHaveTextContent("الأرقام التي تكذب");
    await user.click(within(dialog).getByRole("button", { name: "أصدر" }));
    expect(releaseHeld).toHaveBeenCalledWith("ar", "s1", ["h2"]);
    expect(show).toHaveBeenCalledWith({ tone: "success", title: "صدرت شهادة واحدة" });
  });

  it("«أصدر الكل» releases every held id; «أصدر المحدّد» waits for a selection", async () => {
    const user = userEvent.setup();
    releaseHeld.mockResolvedValue({ status: "ok", count: 2 });
    mount({ held, issued: [] });
    expect(screen.getByRole("button", { name: "أصدر المحدّد" })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "أصدر الكل" }));
    expect(screen.getByRole("dialog")).toHaveTextContent("إصدار شهادتين؟");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "أصدر" }));
    expect(releaseHeld).toHaveBeenCalledWith("ar", "s1", ["h1", "h2"]);
    expect(show).toHaveBeenCalledWith({ tone: "success", title: "صدرت شهادتان" });
  });

  it("a refused release says so and closes nothing", async () => {
    const user = userEvent.setup();
    releaseHeld.mockResolvedValue({ status: "not_authorized" });
    mount({ held, issued: [] });
    await user.click(screen.getByRole("button", { name: "أصدر الكل" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "أصدر" }));
    expect(show).toHaveBeenCalledWith(expect.objectContaining({ tone: "error" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});

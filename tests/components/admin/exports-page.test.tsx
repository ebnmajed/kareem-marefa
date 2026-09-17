// SCR-061 · /app/admin/exports on the M9 system (wave 8, K2) — REQ-ADM-017.
// The seven exports as a list with who took each last, the audit note linking
// to those rows, and a download that shows it is working and says when it
// fails — the async page awaited with a mocked DAL and the real catalogue.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { filenameFrom } from "@/components/admin/export-download-button";
import { ToastProvider } from "@/components/ui/toast";
import adminAr from "@/messages/ar/admin.json";
import uiAr from "@/messages/ar/ui.json";

const messages = { ...adminAr, ...uiAr };
const refresh = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/admin-exports", async () => ({
  EXPORT_TYPES: ["sessions", "rsvps", "attendance", "ratings", "points", "certificates", "members"],
  listRecentExports: vi.fn(),
}));
vi.mock("@/lib/dal/proposals", () => ({ getOrgPrefs: async () => ({ timeZone: "Asia/Riyadh", maxCoPresenters: 4 }) }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "admin.exports" }),
  setRequestLocale: () => {},
}));
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh, prefetch: vi.fn() }),
}));

const { listRecentExports } = await import("@/lib/dal/admin-exports");
const { default: ExportsPage } = await import("@/app/[locale]/app/admin/exports/page");

async function renderPage() {
  vi.mocked(listRecentExports).mockResolvedValue({ members: { actorName: "مشرفة التصدير", occurredAt: "2026-09-17T12:05:00Z" } });
  const element = await ExportsPage({ params: Promise.resolve({ locale: "ar" }) });
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <ToastProvider closeLabel="إغلاق">
        <main>{element}</main>
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

const cards = (container: HTMLElement) => within(container.querySelector("ul.space-y-3") as HTMLElement).getAllByRole("listitem");

describe("ExportsPage", () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => "blob:csv");
    URL.revokeObjectURL = vi.fn();
  });
  afterEach(() => vi.unstubAllGlobals());

  it("lists the seven exports, who took each last, and links the note to those rows in the audit log", async () => {
    const { container } = await renderPage();
    expect(cards(container)).toHaveLength(7);
    const members = cards(container).find((c) => c.textContent?.includes("الأعضاء"))!;
    expect(members).toHaveTextContent("مشرفة التصدير");
    const sessions = cards(container).find((c) => c.textContent?.includes("العنوان والحالة"))!;
    expect(sessions).toHaveTextContent("لم يُصدَّر بعد");
    expect(screen.getByRole("link", { name: "عمليات التصدير في سجل التدقيق" })).toHaveAttribute("href", "/ar/app/admin/audit?action=export.created");
  });

  it("each download names its file, downloads under the handler's name, says so, and refreshes «آخر تصدير»", async () => {
    const fetchMock = vi.fn(async () => new Response("﻿الاسم\r\n", { status: 200, headers: { "content-disposition": "attachment; filename=\"members.csv\"; filename*=UTF-8''%D8%A7%D9%84%D8%A3%D8%B9%D8%B6%D8%A7%D8%A1.csv" } }));
    vi.stubGlobal("fetch", fetchMock);
    const clicked: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this.download);
    });
    const { container } = await renderPage();
    const members = cards(container).find((c) => c.textContent?.includes("الأعضاء"))!;
    fireEvent.click(within(members).getByRole("button", { name: "نزِّل ملف الأعضاء بصيغة CSV" }));
    expect(await screen.findByText("نُزِّل ملف الأعضاء")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith("/api/admin/exports/members", expect.anything());
    expect(clicked).toEqual(["الأعضاء.csv"]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    click.mockRestore();
  });

  it("a failed download is an error that stays, never the server's bare page", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 500 })));
    const { container } = await renderPage();
    const points = cards(container).find((c) => c.textContent?.includes("سجل النقاط"))!;
    fireEvent.click(within(points).getByRole("button", { name: "نزِّل ملف النقاط بصيغة CSV" }));
    // An error toast: Radix announces it assertively, and it stays until dismissed.
    expect((await screen.findAllByText("تعذّر تنزيل ملف النقاط. حاول مرة أخرى.")).length).toBeGreaterThan(0);
    expect(within(points).getByRole("button", { name: "نزِّل ملف النقاط بصيغة CSV" })).not.toHaveAttribute("aria-busy", "true");
  });

  it("filenameFrom prefers the UTF-8 name and falls back to the plain one", () => {
    expect(filenameFrom("attachment; filename=\"points.csv\"; filename*=UTF-8''%D8%A7%D9%84%D9%86%D9%82%D8%A7%D8%B7.csv")).toBe("النقاط.csv");
    expect(filenameFrom('attachment; filename="points.csv"')).toBe("points.csv");
    expect(filenameFrom(null)).toBeNull();
  });

  it("has no axe violations", async () => {
    const { container } = await renderPage();
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  }, 20000);
});

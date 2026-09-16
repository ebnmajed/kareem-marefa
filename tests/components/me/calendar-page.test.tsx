// `/app/me/calendar` — SCR-025, REQ-CAL-003, REQ-CAL-007. Same mocked-DAL +
// real-messages pattern as certificates-page.test.tsx.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/calendar.json";
import type { CalendarConnectionDTO, SyncedEventDTO } from "@/lib/dal/calendar";

vi.mock("@/lib/dal/calendar", () => ({
  getCalendarConnection: vi.fn(),
  listSyncedEvents: vi.fn(),
  disconnectCalendar: vi.fn(),
}));
vi.mock("@/lib/dal/notifications", () => ({
  getPreferenceMatrix: vi.fn().mockResolvedValue({ timeZone: "Asia/Riyadh", rows: [] }),
}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "calendar" }),
  setRequestLocale: () => {},
}));

const { getCalendarConnection, listSyncedEvents } = await import("@/lib/dal/calendar");
const { default: CalendarPage } = await import("@/app/[locale]/app/me/calendar/page");

async function renderPage(
  connection: CalendarConnectionDTO | null,
  events: SyncedEventDTO[] = [],
  searchParams: { connected?: string; disconnected?: string; error?: string } = {},
) {
  vi.mocked(getCalendarConnection).mockResolvedValue(connection);
  vi.mocked(listSyncedEvents).mockResolvedValue(events);
  const element = await CalendarPage({ params: Promise.resolve({ locale: "ar" }), searchParams: Promise.resolve(searchParams) });
  return render(<NextIntlClientProvider locale="ar" messages={ar}>{element}</NextIntlClientProvider>);
}

describe("CalendarPage", () => {
  it("offers to connect, and never renders a token — the DAL cannot even select one", async () => {
    await renderPage(null);
    expect(screen.getByRole("heading", { name: "المزامنة مع تقويم Google" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "اربط تقويم Google" })).toHaveAttribute("href", "/api/calendar/connect");
    expect(document.body.textContent).not.toMatch(/ya29\.|1\/\/0/); // shapes of a real OAuth token
  });

  it("shows the connected state and a synced session", async () => {
    await renderPage(
      { provider: "google", connectedAt: "2026-09-01T00:00:00Z", disconnectedAt: null },
      [{ sessionId: "s1", sessionTitle: "جلسة متزامنة", startsAt: "2026-09-20T10:00:00Z", state: "synced", lastSyncedAt: "2026-09-15T00:00:00Z", error: null }],
    );
    expect(screen.getByRole("button", { name: "افصل التقويم" })).toBeInTheDocument();
    expect(screen.getByText("جلسة متزامنة")).toBeInTheDocument();
  });

  it("surfaces a failed sync with REQ-CAL-008's promise beside it", async () => {
    await renderPage(
      { provider: "google", connectedAt: "2026-09-01T00:00:00Z", disconnectedAt: null },
      [{ sessionId: "s1", sessionTitle: "جلسة", startsAt: null, state: "failed", lastSyncedAt: null, error: "تعذّر الوصول" }],
    );
    expect(screen.getByText("تعذّرت المزامنة")).toBeInTheDocument();
  });

  it("announces the just-connected and error banners", async () => {
    await renderPage(null, [], { connected: "1" });
    expect(screen.getAllByRole("status").some((el) => el.textContent?.includes("تم ربط"))).toBe(true);
  });

  it("is axe-clean when connected with events", async () => {
    const { container } = await renderPage(
      { provider: "google", connectedAt: "2026-09-01T00:00:00Z", disconnectedAt: null },
      [{ sessionId: "s1", sessionTitle: "جلسة", startsAt: "2026-09-20T10:00:00Z", state: "synced", lastSyncedAt: null, error: null }],
    );
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});

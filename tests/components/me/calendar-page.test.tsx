// `/app/me/calendar` — SCR-025, REQ-UIX-075, REQ-CAL-003, REQ-CAL-005, REQ-CAL-007. Same mocked-DAL + real-messages
// pattern as certificates-page.test.tsx.
//
// ★ Wave 20 (DEC-208, DEC-218 §5 — this file is `notify`'s for the wave): the page was deleted and written from
// `Calendar.dc.html`. Each changed case is a ledger line in STATUS.md: the connect link is «اربط» and carries the
// locale (selector + expectation, C3/C18); the connected state is one row with «افصل» and NO synced list
// (expectation, DEC-216 §5.20); a failed sync is a «لم تُضف» row with «أعد المحاولة» (expectation, C12). The token
// case and the banner case keep their facts; the axe case is unchanged.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import ar from "@/messages/ar/calendar.json";
import arSessions from "@/messages/ar/sessions.json";
import type { CalendarConnectionDTO, CalendarFailureDTO } from "@/lib/dal/calendar";

const messages = { ...ar, ...arSessions };

vi.mock("@/lib/dal/calendar", () => ({
  getCalendarConnection: vi.fn(),
  listCalendarFailures: vi.fn(),
  disconnectCalendar: vi.fn(),
  retryCalendarSync: vi.fn(),
}));
vi.mock("@/lib/dal/proposals", () => ({ getOrgPrefs: vi.fn().mockResolvedValue({ timeZone: "Asia/Riyadh", maxCoPresenters: 4 }) }));
vi.mock("@/app/[locale]/app/me/calendar/actions", () => ({ disconnect: vi.fn(), retry: vi.fn() }));
// The frame is the lead's and tested there; here it is the page's heading and nothing else.
vi.mock("@/components/shell/hub-top-row", () => ({ HubTopRow: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/shell/hub-strip", () => ({ HubStrip: () => null }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "calendar" }),
  setRequestLocale: () => {},
}));

const { getCalendarConnection, listCalendarFailures } = await import("@/lib/dal/calendar");
const { default: CalendarPage } = await import("@/app/[locale]/app/me/calendar/page");

const CONNECTED: CalendarConnectionDTO = { provider: "google", connectedAt: "2026-09-01T00:00:00Z", disconnectedAt: null };
const FAILED: CalendarFailureDTO = { id: "ce1", sessionId: "s1", sessionTitle: "العرض في 5 شرائح", startsAt: "2099-09-20T15:30:00Z", dayPosition: 1, dayCount: 1 };

async function renderPage(
  connection: CalendarConnectionDTO | null,
  failures: CalendarFailureDTO[] = [],
  searchParams: { connected?: string; disconnected?: string; error?: string; retried?: string } = {},
) {
  vi.mocked(getCalendarConnection).mockResolvedValue(connection);
  vi.mocked(listCalendarFailures).mockResolvedValue(failures);
  const element = await CalendarPage({ params: Promise.resolve({ locale: "ar" }), searchParams: Promise.resolve(searchParams) });
  return render(<NextIntlClientProvider locale="ar" messages={messages}>{element}</NextIntlClientProvider>);
}

describe("CalendarPage", () => {
  it("offers to connect, and never renders a token — the DAL cannot even select one", async () => {
    await renderPage(null);
    expect(screen.getByRole("heading", { level: 1, name: "التقويم" })).toBeInTheDocument();
    expect(screen.getByText("غير متصل")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "اربط" })).toHaveAttribute("href", "/api/calendar/connect?locale=ar");
    expect(document.body.textContent).not.toMatch(/ya29\.|1\/\/0/); // shapes of a real OAuth token
  });

  it("shows the connected state as one row, and no synced list", async () => {
    await renderPage(CONNECTED);
    const row = screen.getByRole("listitem");
    expect(within(row).getByText("تقويم Google")).toBeInTheDocument();
    expect(within(row).getByText("متصل")).toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "افصل" })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.queryByText("لم تُضف")).not.toBeInTheDocument();
  });

  it("surfaces a failed sync with «أعد المحاولة» and REQ-CAL-008's promise beside it", async () => {
    await renderPage(CONNECTED, [FAILED]);
    const failed = screen.getByRole("region", { name: "لم تُضف" });
    expect(within(failed).getByText("العرض في 5 شرائح").tagName).toBe("BDI");
    expect(within(failed).getByRole("button", { name: "أعد المحاولة" })).toBeInTheDocument();
    expect(failed.querySelector('input[type="hidden"][name="event"]')).toHaveAttribute("value", "ce1");
    expect(screen.getByText("حجزك قائم في كل الأحوال.")).toBeInTheDocument();
  });

  it("announces the just-connected, disconnected and error lines", async () => {
    await renderPage(CONNECTED, [], { connected: "1" });
    expect(screen.getByRole("status")).toHaveTextContent("تم ربط");
  });

  it("tells a disconnected member their events stay and stop updating (REQ-CAL-007), and an error is an alert", async () => {
    const { unmount } = await renderPage(null, [], { disconnected: "1" });
    expect(screen.getByRole("status")).toHaveTextContent("لن تتحدّث بعد الآن");
    unmount();
    await renderPage(CONNECTED, [FAILED], { error: "retry" });
    expect(screen.getByRole("alert")).toHaveTextContent("تعذّرت إعادة المحاولة");
  });

  it("is axe-clean when connected with a failure", async () => {
    const { container } = await renderPage(CONNECTED, [FAILED]);
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});

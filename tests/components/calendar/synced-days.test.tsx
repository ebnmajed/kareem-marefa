// notify — `/app/me/calendar` at n days (REQ-SES-015, REQ-SES-018).
//
// ★ Wave 20 (DEC-216 §5.20, DEC-208): the synced list is gone, so the per-day rule this file proved moves to the one
// list SCR-025 still has — «لم تُضف». Ledger: four cases → three, each an EXPECTATION change of subject (a failed day,
// not a synced entry); the rule itself is unchanged — a three-day workshop that failed on two days is two rows, each
// named in `sessions`' own words (contract 7 of wave 9), and a one-day session shows no day concept at all.
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import arCalendar from "@/messages/ar/calendar.json";
import arSessions from "@/messages/ar/sessions.json";
import type { CalendarFailureDTO } from "@/lib/dal/calendar";

const messages = { ...arCalendar, ...arSessions };

vi.mock("@/lib/dal/calendar", () => ({
  getCalendarConnection: vi.fn(),
  listCalendarFailures: vi.fn(),
  disconnectCalendar: vi.fn(),
  retryCalendarSync: vi.fn(),
}));
vi.mock("@/lib/dal/proposals", () => ({ getOrgPrefs: vi.fn().mockResolvedValue({ timeZone: "Asia/Riyadh", maxCoPresenters: 4 }) }));
vi.mock("@/app/[locale]/app/me/calendar/actions", () => ({ disconnect: vi.fn(), retry: vi.fn() }));
vi.mock("@/components/shell/hub-top-row", () => ({ HubTopRow: ({ title }: { title: string }) => <h1>{title}</h1> }));
vi.mock("@/components/shell/hub-strip", () => ({ HubStrip: () => null }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "calendar" }),
  setRequestLocale: () => {},
}));

const { getCalendarConnection, listCalendarFailures } = await import("@/lib/dal/calendar");
const { default: CalendarPage } = await import("@/app/[locale]/app/me/calendar/page");

const failure = (over: Partial<CalendarFailureDTO>): CalendarFailureDTO => ({
  id: "ce-1",
  sessionId: "s1",
  sessionTitle: "ورشة الذكاء الاصطناعي",
  startsAt: "2099-10-01T15:00:00Z",
  dayPosition: 1,
  dayCount: 1,
  ...over,
});

async function renderPage(failures: CalendarFailureDTO[]) {
  vi.mocked(getCalendarConnection).mockResolvedValue({ provider: "google", connectedAt: "2026-09-01T00:00:00Z", disconnectedAt: null });
  vi.mocked(listCalendarFailures).mockResolvedValue(failures);
  const element = await CalendarPage({ params: Promise.resolve({ locale: "ar" }), searchParams: Promise.resolve({}) });
  return render(<NextIntlClientProvider locale="ar" messages={messages}>{element}</NextIntlClientProvider>);
}

describe("/app/me/calendar's failed days at n days", () => {
  it("a three-day workshop that failed on two days is TWO rows, each naming its own day", async () => {
    await renderPage([
      failure({ id: "ce-1", dayPosition: 1, dayCount: 3, startsAt: "2099-10-01T15:00:00Z" }),
      failure({ id: "ce-3", dayPosition: 3, dayCount: 3, startsAt: "2099-10-03T15:00:00Z" }),
    ]);
    const rows = screen.getAllByRole("button", { name: "أعد المحاولة" });
    expect(rows).toHaveLength(2);
    const details = screen.getAllByText(/·/).map((el) => el.textContent ?? "");
    expect(details).toHaveLength(2);
    expect(details[0]).toMatch(/^اليوم الأول · /);
    expect(details[1]).toMatch(/^اليوم الثالث · /);
  });

  it("★ a ONE-day session shows no day label at all — there is nothing to tell apart", async () => {
    await renderPage([failure({ dayCount: 1 })]);
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });

  it("a failed row whose day was deleted from the session still lists, with no label", async () => {
    await renderPage([failure({ dayPosition: null, dayCount: 2 })]);
    expect(screen.getByText("ورشة الذكاء الاصطناعي")).toBeInTheDocument();
    expect(screen.queryByText(/·/)).not.toBeInTheDocument();
  });
});

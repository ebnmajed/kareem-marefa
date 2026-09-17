// notify (wave 9) — `/app/me/calendar` with one entry per DAY (REQ-SES-015).
//
// A NEW file: `tests/components/me/calendar-page.test.tsx` is the evidence
// that the one-day screen did not move, and its assertions are untouched.
// What is proven here is the other half — that a three-day workshop is three
// entries, each named in `sessions`' own words (contract 7), and that a
// one-day session shows no day concept at all (`REQ-SES-018`, first rule).
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import arCalendar from "@/messages/ar/calendar.json";
import arSessions from "@/messages/ar/sessions.json";
import type { SyncedEventDTO } from "@/lib/dal/calendar";

// Each namespace file already wraps its own key, so the merge IS the message
// tree next-intl expects: { calendar: …, sessions: … }.
const messages = { ...arCalendar, ...arSessions };

vi.mock("@/lib/dal/calendar", () => ({
  getCalendarConnection: vi.fn(),
  listSyncedEvents: vi.fn(),
  disconnectCalendar: vi.fn(),
}));
vi.mock("@/lib/dal/notifications", () => ({
  getPreferenceMatrix: vi.fn().mockResolvedValue({ timeZone: "Asia/Riyadh", rows: [] }),
}));
vi.mock("next-intl/server", () => ({
  // Both namespaces, because the screen reads `calendar` for its own strings
  // and `sessions.days` for the label every surface shares.
  getTranslations: async (namespace: string) =>
    createTranslator({ locale: "ar", messages, namespace: namespace as "calendar" }),
  setRequestLocale: () => {},
}));

const { getCalendarConnection, listSyncedEvents } = await import("@/lib/dal/calendar");
const { default: CalendarPage } = await import("@/app/[locale]/app/me/calendar/page");

const entry = (over: Partial<SyncedEventDTO>): SyncedEventDTO => ({
  id: "ce-1",
  sessionId: "s1",
  sessionTitle: "ورشة الذكاء الاصطناعي",
  startsAt: "2026-10-01T15:00:00Z",
  dayPosition: 1,
  dayCount: 1,
  state: "synced",
  error: null,
  lastSyncedAt: null,
  ...over,
});

async function renderPage(events: SyncedEventDTO[]) {
  vi.mocked(getCalendarConnection).mockResolvedValue({ provider: "google", connectedAt: "2026-09-01T00:00:00Z", disconnectedAt: null });
  vi.mocked(listSyncedEvents).mockResolvedValue(events);
  const element = await CalendarPage({ params: Promise.resolve({ locale: "ar" }), searchParams: Promise.resolve({}) });
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );
}

describe("/app/me/calendar at n days", () => {
  it("a three-day workshop is THREE entries, each named in sessions' own words", async () => {
    await renderPage([
      entry({ id: "ce-1", dayPosition: 1, dayCount: 3, startsAt: "2026-10-01T15:00:00Z" }),
      entry({ id: "ce-2", dayPosition: 2, dayCount: 3, startsAt: "2026-10-02T15:00:00Z" }),
      entry({ id: "ce-3", dayPosition: 3, dayCount: 3, startsAt: "2026-10-03T15:00:00Z" }),
    ]);

    // One entry per DAY — a member's calendar holds three, and so does this.
    expect(screen.getAllByRole("link", { name: "ورشة الذكاء الاصطناعي" })).toHaveLength(3);
    // «اليوم الأول» … «اليوم الثالث», the words `dayLabel()` produces.
    expect(screen.getByText(/اليوم الأول/)).toBeInTheDocument();
    expect(screen.getByText(/اليوم الثاني/)).toBeInTheDocument();
    expect(screen.getByText(/اليوم الثالث/)).toBeInTheDocument();
  });

  it("★ a ONE-day session shows no day label at all — there is nothing to tell apart", async () => {
    await renderPage([entry({ dayPosition: 1, dayCount: 1 })]);

    expect(screen.getByRole("link", { name: "ورشة الذكاء الاصطناعي" })).toBeInTheDocument();
    expect(screen.queryByText(/اليوم الأول/)).not.toBeInTheDocument();
  });

  it("an entry whose day was deleted from the session still lists, with no label", async () => {
    // `0101`'s foreign key keeps the row when its day goes, so the provider
    // event can still be removed — and until the job runs the member can see
    // that the entry is on its way out.
    await renderPage([entry({ dayPosition: null, dayCount: 2, state: "removed" })]);

    expect(screen.getByRole("link", { name: "ورشة الذكاء الاصطناعي" })).toBeInTheDocument();
    expect(screen.queryByText(/اليوم/)).not.toBeInTheDocument();
  });

  it("the count in the section heading is the number of ENTRIES, which is days not sessions", async () => {
    await renderPage([
      entry({ id: "ce-1", dayPosition: 1, dayCount: 2, startsAt: "2026-10-01T15:00:00Z" }),
      entry({ id: "ce-2", dayPosition: 2, dayCount: 2, startsAt: "2026-10-02T15:00:00Z" }),
    ]);
    expect(screen.getByRole("heading", { name: new RegExp(arCalendar.calendar.synced.heading) })).toBeInTheDocument();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
  });
});

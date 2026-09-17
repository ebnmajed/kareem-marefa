// The event hero's duration chip over a session's days — `REQ-SES-015`,
// `REQ-SES-011`, `DEC-151` ruling 4.
//
// ★ THE CHIP AND THE COLUMN MEAN DIFFERENT THINGS, which is the whole of this
// file. `sessions.duration_minutes` is DAY ONE's length — the clock jobs and
// the check-in window need exactly that — while the chip is what a member reads
// as «how much of my week is this». On a three-evening workshop «120 دقيقة»
// answers the second question with the first one's number, and says the
// workshop takes two hours. Caught by the lead in a 390 px capture of a
// three-day workshop, not by any assertion that existed.
//
// A NEW file (wave-9 rule 4).
import { render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/sessions.json";
import ui from "@/messages/ar/ui.json";
import type { EventSession } from "@/lib/dal/sessions";

const messages = { ...ar, ...ui };
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as never }),
}));

const { EventHero } = await import("@/components/sessions/event-hero");

const SESSION = {
  id: "00000000-0000-4000-8000-000000000001",
  title: "ورشة تحليل البيانات على ثلاث أمسيات",
  abstract: "ثلاث جلسات عملية متتابعة.",
  state: "published",
  level: "introductory",
  language: "ar",
  categoryId: null,
  categoryName: null,
  durationMinutes: 120,
  tags: [],
  startsAt: "2026-10-17T07:42:00.000Z",
  endsAt: "2026-10-19T09:42:00.000Z",
  timeZone: "Asia/Riyadh",
  venue: null,
  capacity: 40,
  rsvpDeadlineAt: null,
  cancellationCutoffAt: null,
  cancellationReason: null,
  presenters: [],
  viewerIsPresenter: false,
  viewerIsStaff: false,
  viewerRelation: "none",
  allowWalkIns: false,
  checkInOpen: true,
  rsvpStatus: null,
  checkedIn: false,
} as unknown as EventSession;

async function mount(dayCount: number) {
  const element = await EventHero({ session: SESSION, dayCount, phase: "open", seat: "available", closingSoon: false, poster: null, locale: "ar" });
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      {element}
    </NextIntlClientProvider>,
  );
}

describe("★ the duration chip", () => {
  it("is the minutes at ONE day — exactly what it has always been", async () => {
    await mount(1);
    expect(screen.getByText("120 دقيقة")).toBeInTheDocument();
    expect(screen.queryByText(/أيام/)).toBeNull();
  });

  it("★ is «3 أيام» at three, and never the workshop's first evening dressed as its whole", async () => {
    await mount(3);
    expect(screen.getByText("3 أيام")).toBeInTheDocument();
    expect(screen.queryByText("120 دقيقة")).toBeNull();
  });

  it("says «يومان» at two — the dual, which Arabic needs and a bare count would miss", async () => {
    await mount(2);
    expect(screen.getByText("يومان")).toBeInTheDocument();
  });

  it("never prints an Arabic-Indic digit (DEC-124)", async () => {
    const { container } = await mount(3);
    expect(container.textContent ?? "").not.toMatch(/[٠-٩]/u);
  });
});

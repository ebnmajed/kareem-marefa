// SCR-014's session mini-row — REQ-UIX-062 (`CheckIn.dc.html`), DEC-209 D2: the title and the venue
// isolated, the start as a time and never a relative one, the live pill only while live, the poster
// thumb only when one has rendered.
import type { ReactElement, ReactNode } from "react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import checkin from "@/messages/ar/checkin.json";
import browse from "@/messages/ar/browse.json";
import type { SessionPhase } from "@/lib/session-status";

const messages = { ...checkin, ...browse };

vi.mock("@/lib/dal/posters", () => ({ getSessionPoster: vi.fn(async () => null) }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "checkin" }),
}));

const { CheckInSessionRow } = await import("@/components/checkin/check-in-session-row");

async function show(phase: SessionPhase, over: { venueName?: string | null; startsAt?: string | null } = {}) {
  const tree = (await CheckInSessionRow({
    locale: "ar",
    sessionId: "11111111-1111-4111-8111-111111111111",
    title: "العرض في 5 شرائح",
    phase,
    venueName: over.venueName === undefined ? "قاعة الرياض" : over.venueName,
    startsAt: over.startsAt === undefined ? "2026-10-01T15:30:00.000Z" : over.startsAt,
    timeZone: "Asia/Riyadh",
  })) as ReactElement;
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      {tree as ReactNode}
    </NextIntlClientProvider>,
  );
}

describe("CheckInSessionRow", () => {
  it("live: the title and venue isolated, «بدأت» and the time, the live pill", async () => {
    const { container } = await show("live");
    expect(screen.getByText("العرض في 5 شرائح").tagName).toBe("BDI");
    expect(screen.getByText("قاعة الرياض").tagName).toBe("BDI");
    expect(container).toHaveTextContent("بدأت 6:30 م");
    expect(container).not.toHaveTextContent(/قبل \d+ دقيقة/);
    expect(screen.getByText((browse as { browse: { status: { live: string } } }).browse.status.live)).toBeInTheDocument();
  });

  it("before the start: «تبدأ» and no pill", async () => {
    const { container } = await show("open");
    expect(container).toHaveTextContent("تبدأ 6:30 م");
    expect(screen.queryByText((browse as { browse: { status: { live: string } } }).browse.status.live)).toBeNull();
  });

  it("no venue: the time alone, with no dangling separator", async () => {
    const { container } = await show("live", { venueName: null });
    expect(container).not.toHaveTextContent("·");
  });
});

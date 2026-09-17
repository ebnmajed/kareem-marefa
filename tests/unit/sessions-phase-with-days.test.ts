// ★ THE DEFECT: three surfaces, one instant, two answers — `REQ-UIX-003`,
// `REQ-SES-015`, contract 9 (`DEC-150`).
//
// Between two days of a workshop `sessionPhase()` reads `open` only when it is
// GIVEN the days. Three of this track's call sites passed the session's stored
// window alone — a start that has passed, an end that has not — so the public
// card said «جارية الآن» through both nights of a three-day workshop while the
// event page and the browse card said «التسجيل مفتوح» for the same session at
// the same instant. Found in a 390 px capture, by the lead, with all three
// green.
//
// This pins the RULE those call sites now feed, and the mapping the public card
// needs to feed it at all. A NEW file (wave-9 rule 4).
import { describe, expect, it, vi } from "vitest";
import { sessionPhase, type DayWindow } from "@/lib/session-status";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const NOW = new Date("2026-10-01T12:00:00.000Z");

/** A three-evening workshop with one day behind us and two ahead. */
function workshop(): DayWindow[] {
  const at = NOW.getTime();
  return [
    { id: "d1", position: 1, startsAt: new Date(at - DAY - 2 * HOUR).toISOString(), endsAt: new Date(at - DAY).toISOString() },
    { id: "d2", position: 2, startsAt: new Date(at + DAY).toISOString(), endsAt: new Date(at + DAY + 2 * HOUR).toISOString() },
    { id: "d3", position: 3, startsAt: new Date(at + 2 * DAY).toISOString(), endsAt: new Date(at + 2 * DAY + 2 * HOUR).toISOString() },
  ];
}

/** The session's own STORED window — the first day's start, the last day's end (contract 1). */
function storedWindow(days: DayWindow[]) {
  return { state: "published" as const, startsAt: days[0].startsAt, endsAt: days[days.length - 1].endsAt };
}

describe("★ between two days a session is open, and only the days can say so", () => {
  it("reads `live` from the stored window alone — the defect, stated so it cannot come back quietly", () => {
    const days = workshop();
    expect(sessionPhase(storedWindow(days), NOW)).toBe("live");
  });

  it("reads `open` once the days are passed", () => {
    const days = workshop();
    expect(sessionPhase({ ...storedWindow(days), days }, NOW)).toBe("open");
  });

  it("still reads `live` while a day is actually running", () => {
    const days = workshop();
    const during = new Date(new Date(days[1].startsAt).getTime() + HOUR);
    expect(sessionPhase({ ...storedWindow(days), days }, during)).toBe("live");
  });

  it("★ one day: passing days changes nothing, because 1 is a value of n", () => {
    const one: DayWindow[] = [{ id: "d1", position: 1, startsAt: new Date(NOW.getTime() - HOUR).toISOString(), endsAt: new Date(NOW.getTime() + HOUR).toISOString() }];
    const stored = storedWindow(one);
    expect(sessionPhase(stored, NOW)).toBe("live");
    expect(sessionPhase({ ...stored, days: one }, NOW)).toBe("live");
  });
});

// ── The public card's mapping ───────────────────────────────────────────────
//
// `session_public_card()` returns two instants per day and NO identifier by
// design (`0004`), while `DayWindow` wants an `id` and a `position`. The DTO
// assigns both. This pins that the result is something `sessionPhase()` can
// actually use — the step between the SQL and the rule.
const rpc = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@/lib/dal/session", () => ({ sessionClient: async () => ({}) }));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({ rpc }) }));

const { getPublicSessionCard } = await import("@/lib/dal/sessions");

describe("★ the public card carries windows it can feed to the rule", () => {
  it("maps the RPC's two-instant days into DayWindows, and the phase is `open` between two", async () => {
    const days = workshop();
    rpc.mockResolvedValue({
      data: [
        {
          title: "ورشة تحليل البيانات على ثلاث أمسيات",
          starts_at: days[0].startsAt,
          ends_at: days[2].endsAt,
          time_zone: "Asia/Riyadh",
          venue_name: "القاعة الكبرى",
          org_name: "مؤسسة الورش",
          day_count: 3,
          days: days.map((d) => ({ starts_at: d.startsAt, ends_at: d.endsAt })),
          og_path: null,
          og_width: null,
          og_height: null,
        },
      ],
      error: null,
    });

    const card = await getPublicSessionCard("00000000-0000-4000-8000-0000000000cc");
    expect(card).not.toBeNull();
    expect(card!.dayCount).toBe(3);
    expect(card!.days).toHaveLength(3);
    expect(card!.days.map((d) => d.position)).toEqual([1, 2, 3]);
    // ★ The ids are this module's, not the database's, and could not be
    // mistaken for a row's — `0004` returns none.
    expect(card!.days.every((d) => d.id.startsWith("public-card-day-"))).toBe(true);

    expect(sessionPhase({ state: "published", startsAt: card!.startsAt, endsAt: card!.endsAt, days: card!.days }, NOW)).toBe("open");
  });

  it("a session whose days have not landed yet says one day and reads as it always did", async () => {
    rpc.mockResolvedValue({
      data: [{ title: "جلسة", starts_at: null, ends_at: null, time_zone: "Asia/Riyadh", venue_name: null, org_name: "م", day_count: null, days: null, og_path: null, og_width: null, og_height: null }],
      error: null,
    });
    const card = await getPublicSessionCard("00000000-0000-4000-8000-0000000000cc");
    expect(card!.dayCount).toBe(1);
    expect(card!.days).toEqual([]);
  });
});

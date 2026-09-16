// Contract 2 — the event page's check-in link (checkin `5248e6b`; DEC-113,
// DEC-116, DEC-141; REQ-CHK-015, REQ-CHK-016). Two facts a derived relation
// could not carry, and each case below fails on the page's old call
// (`canOfferCheckInLink(session, relation, allowWalkIns)`), proven by running
// it against that call first:
//
//   · ★ THE GRACE WINDOW. Check-in runs to `ends_at + 2 h`. A session the job
//     has completed, 30 minutes after its end, reads `ended` — and a confirmed
//     member reads `absent` — so the old call hid the link while the room was
//     still admitting;
//   · THE SWITCH. A live session whose room closed check-in by hand
//     (`check_in_open = false`) must not offer the link; the old call could not
//     see the switch at all.
import { describe, expect, it, vi } from "vitest";
import type { EventSession } from "@/lib/dal/sessions";
import { sessionPhase, viewerRelation } from "@/lib/session-status";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));
vi.mock("@/lib/dal/session", () => ({ sessionClient: async () => ({}) }));

const { eventCheckInLink } = await import("@/components/sessions/event-check-in");

const NOW = new Date("2026-09-16T17:30:00Z");

/** An event DTO as `getSessionForEvent()` returns it, relation derived the way it derives it. */
function event(over: Partial<EventSession> & Pick<EventSession, "state" | "startsAt" | "endsAt">): EventSession {
  const base = {
    id: "00000000-0000-4000-8000-0000000000cc",
    title: "جلسة",
    abstract: "",
    level: "introductory",
    language: "ar",
    categoryId: null,
    categoryName: null,
    durationMinutes: 60,
    tags: [],
    timeZone: "Asia/Riyadh",
    venue: null,
    capacity: 30,
    rsvpDeadlineAt: null,
    cancellationCutoffAt: null,
    cancellationReason: null,
    presenters: [],
    viewerIsPresenter: false,
    viewerIsStaff: false,
    allowWalkIns: false,
    checkInOpen: true,
    rsvpStatus: "confirmed",
    checkedIn: false,
    ...over,
  } as Omit<EventSession, "viewerRelation">;
  const phase = sessionPhase(base, NOW);
  const relation = viewerRelation({ isStaff: base.viewerIsStaff, isPresenter: base.viewerIsPresenter, rsvpStatus: base.rsvpStatus, checkedIn: base.checkedIn }, phase);
  return { ...base, viewerRelation: relation } as EventSession;
}

describe("the event page's check-in link", () => {
  it("★ shows in the grace window: completed, 30 minutes past the end, the room still open", () => {
    const session = event({ state: "completed", startsAt: "2026-09-16T16:00:00Z", endsAt: "2026-09-16T17:00:00Z" });
    expect(session.viewerRelation).toBe("absent"); // what the old call was handed
    expect(eventCheckInLink(session, NOW)).toBe(true);
  });

  it("hides past the ceiling — ends_at + 2 h", () => {
    const late = new Date("2026-09-16T19:00:00Z");
    expect(eventCheckInLink(event({ state: "completed", startsAt: "2026-09-16T16:00:00Z", endsAt: "2026-09-16T17:00:00Z" }), late)).toBe(false);
  });

  it("★ hides when the room has closed check-in, on a live session with a confirmed seat", () => {
    const session = event({ state: "in_progress", startsAt: "2026-09-16T17:00:00Z", endsAt: "2026-09-16T18:00:00Z", checkInOpen: false });
    expect(eventCheckInLink(session, NOW)).toBe(false);
  });

  it("shows on the same live session once the room opens it", () => {
    expect(eventCheckInLink(event({ state: "in_progress", startsAt: "2026-09-16T17:00:00Z", endsAt: "2026-09-16T18:00:00Z" }), NOW)).toBe(true);
  });

  it("never offers it to a presenter of the session (REQ-CHK-011)", () => {
    expect(eventCheckInLink(event({ state: "in_progress", startsAt: "2026-09-16T17:00:00Z", endsAt: "2026-09-16T18:00:00Z", viewerIsPresenter: true }), NOW)).toBe(false);
  });
});

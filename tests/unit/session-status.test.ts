import { describe, expect, it } from "vitest";
import {
  GRANTING_AFFORDANCES,
  SESSION_PHASES,
  VIEWER_RELATIONS,
  canGrantOn,
  closingSoon,
  neverGrantsMoreThanStored,
  seatState,
  sessionPhase,
  sessionPhaseSource,
  storedPhase,
  viewerRelation,
  type GrantingAffordance,
  type PhaseInput,
  type SessionState,
} from "@/lib/session-status";

// `16` §5, REQ-UIX-003, REQ-UIX-004, DEC-071, DEC-090.
//
// Two of these are gates, not tests: the totality sweep (§17 — "a totality test
// that feeds sessionPhase() every state x null-schedule combination and asserts
// it never returns undefined") and the direction sweep (DEC-090 corollary 2 —
// "one unit test asserts the direction for every phase pair"). The 49-cell
// affordance matrix itself is `checkin`'s, beside its components.

const NOW = new Date("2026-09-15T12:00:00Z");
const HOUR = 3_600_000;
const at = (offsetHours: number) => new Date(NOW.getTime() + offsetHours * HOUR).toISOString();

const STATES: SessionState[] = [
  "draft",
  "submitted",
  "in_review",
  "changes_requested",
  "approved",
  "published",
  "in_progress",
  "completed",
  "archived",
  "cancelled",
];

// Every shape a schedule can take, including the two the first draft missed.
const SCHEDULES: { name: string; startsAt: string | null; endsAt: string | null; durationMinutes?: number | null }[] = [
  { name: "no schedule at all", startsAt: null, endsAt: null },
  { name: "start only, in the future", startsAt: at(5), endsAt: null },
  { name: "start only, in the past", startsAt: at(-5), endsAt: null },
  { name: "start only, past, with a duration", startsAt: at(-5), endsAt: null, durationMinutes: 60 },
  { name: "start only, past, duration not yet elapsed", startsAt: at(-0.5), endsAt: null, durationMinutes: 120 },
  { name: "future window", startsAt: at(3), endsAt: at(5) },
  { name: "window in progress", startsAt: at(-1), endsAt: at(1) },
  { name: "window in the past", startsAt: at(-5), endsAt: at(-3) },
  { name: "end without a start", startsAt: null, endsAt: at(-1) },
];

describe("sessionPhase — totality (§17, the gate)", () => {
  it("returns one of the six phases for every state x schedule combination", () => {
    for (const state of STATES) {
      for (const schedule of SCHEDULES) {
        const phase = sessionPhase({ state, ...schedule }, NOW);
        expect(SESSION_PHASES, `${state} / ${schedule.name}`).toContain(phase);
      }
    }
  });

  it("covers the combination the first draft matched no branch for", () => {
    // A published session with a null startsAt. `16` §5.0 defect 2.
    expect(sessionPhase({ state: "published", startsAt: null, endsAt: null }, NOW)).toBe("open");
  });

  it("uses the database's own spellings and never renames a state", () => {
    // `16` §5.0 defect 3: `pending_schedule`, not `awaiting_schedule`.
    expect(sessionPhase({ state: "approved", startsAt: at(5), endsAt: at(6) }, NOW)).toBe("pending_schedule");
    expect(SESSION_PHASES).toContain("pending_schedule");
    expect(SESSION_PHASES as readonly string[]).not.toContain("awaiting_schedule");
  });
});

describe("sessionPhase — §5.1's awkward cases, one test each", () => {
  it("published with no start is open — reservable, nothing to compare to the clock", () => {
    expect(sessionPhase({ state: "published", startsAt: null, endsAt: null }, NOW)).toBe("open");
  });

  it("published, start set, end null falls back to start + duration", () => {
    expect(sessionPhase({ state: "published", startsAt: at(-5), endsAt: null, durationMinutes: 60 }, NOW)).toBe("ended");
    expect(sessionPhase({ state: "published", startsAt: at(-0.5), endsAt: null, durationMinutes: 120 }, NOW)).toBe("live");
  });

  it("★ published with a passed start and no end reads live, not «open forever» (DEC-105)", () => {
    // `16` §5.1's table says `open` forever here. That is the right answer for a
    // session the clock cannot place and the wrong one for a session whose START
    // has passed — «احجز مقعدًا» on a talk that began an hour ago is ask 4. The
    // row is unreachable anyway: 0010's check constraint pins both ends from
    // `published` onward.
    expect(sessionPhase({ state: "published", startsAt: at(-5), endsAt: null }, NOW)).toBe("live");
  });

  it("★ the two unreachable rows are still total (DEC-105)", () => {
    // A published session cannot have a null startsAt, a null endsAt or a null
    // capacity — 0010_m2_schema.sql:102-104. Totality is written and tested
    // anyway: a constraint is not a type, and a draft legitimately has nulls.
    expect(SESSION_PHASES).toContain(sessionPhase({ state: "published", startsAt: null, endsAt: null }, NOW));
    expect(SESSION_PHASES).toContain(sessionPhase({ state: "published", startsAt: at(-5), endsAt: null }, NOW));
  });

  it("in_progress with a passed end is ended — the clock wins over a stale row", () => {
    // This is ask 4: `JOB-complete_session` lagging must not keep a finished
    // session offering affordances.
    expect(sessionPhase({ state: "in_progress", startsAt: at(-5), endsAt: at(-3) }, NOW)).toBe("ended");
  });

  it("archived is ended — an ended session that has been filed", () => {
    expect(sessionPhase({ state: "archived", startsAt: at(-50), endsAt: at(-48) }, NOW)).toBe("ended");
  });

  it("cancelled beats the clock in both directions", () => {
    expect(sessionPhase({ state: "cancelled", startsAt: at(5), endsAt: at(6) }, NOW)).toBe("cancelled");
    expect(sessionPhase({ state: "cancelled", startsAt: at(-5), endsAt: at(-3) }, NOW)).toBe("cancelled");
  });
});

describe("★ ask 4 — a session past its start offers no registration", () => {
  it("a published session past its start reads live, not open, while the job lags", () => {
    // `rsvp-panel.tsx` computes deadlinePassed from rsvp_deadline_at only and
    // never from starts_at, and reserve_seat() checks state = 'published' plus
    // the deadline — so today the button is live AND the database allows it.
    // The derived phase is the fix.
    const session: PhaseInput = { state: "published", startsAt: at(-1), endsAt: at(1) };
    expect(sessionPhase(session, NOW)).toBe("live");
    expect(sessionPhase(session, NOW)).not.toBe("open");
  });

  it("a published session past its end reads ended even with no clock job run", () => {
    expect(sessionPhase({ state: "published", startsAt: at(-5), endsAt: at(-3) }, NOW)).toBe("ended");
  });
});

describe("★ DEC-090 corollary 2 — the derived phase may only REMOVE an affordance", () => {
  it("never grants more than the stored state does, for every state x schedule", () => {
    for (const state of STATES) {
      for (const schedule of SCHEDULES) {
        const session: PhaseInput = { state, ...schedule };
        expect(neverGrantsMoreThanStored(session, NOW), `${state} / ${schedule.name}`).toBe(true);
      }
    }
  });

  it("refuses a rate CTA on a clock-derived ended — §5.4.1 row 5, the one this plan introduced", () => {
    // in_progress whose end has passed: the screen says `ended`, but
    // complete_session has not run, so the rating RPC would refuse.
    const stale: PhaseInput = { state: "in_progress", startsAt: at(-5), endsAt: at(-3) };
    expect(sessionPhase(stale, NOW)).toBe("ended");
    expect(sessionPhaseSource(stale, NOW)).toBe("clock");
    expect(canGrantOn(stale, "rate", NOW)).toBe(false);
    expect(canGrantOn(stale, "certificate", NOW)).toBe(false);
  });

  it("allows a rate CTA once the row itself says completed", () => {
    const done: PhaseInput = { state: "completed", startsAt: at(-5), endsAt: at(-3) };
    expect(sessionPhaseSource(done, NOW)).toBe("stored");
    expect(canGrantOn(done, "rate", NOW)).toBe(true);
  });

  it("refuses check-in on a clock-derived live — the RPC would refuse too", () => {
    // published and past its start: the screen says `live`, start_session has
    // not run, and check_in() refuses. §5.4.1 row 4's other half.
    const early: PhaseInput = { state: "published", startsAt: at(-1), endsAt: at(1) };
    expect(sessionPhase(early, NOW)).toBe("live");
    expect(canGrantOn(early, "checkIn", NOW)).toBe(false);
  });

  it("allows check-in once the row says in_progress", () => {
    const running: PhaseInput = { state: "in_progress", startsAt: at(-1), endsAt: at(1) };
    expect(canGrantOn(running, "checkIn", NOW)).toBe(true);
  });

  it("every granting affordance is refused whenever the source is the clock", () => {
    const every = Object.values(GRANTING_AFFORDANCES).flat() as GrantingAffordance[];
    for (const state of STATES) {
      for (const schedule of SCHEDULES) {
        const session: PhaseInput = { state, ...schedule };
        if (sessionPhaseSource(session, NOW) === "stored") continue;
        for (const affordance of every) {
          expect(canGrantOn(session, affordance, NOW), `${state} / ${schedule.name} / ${affordance}`).toBe(false);
        }
      }
    }
  });

  it("storedPhase ignores the clock entirely", () => {
    expect(storedPhase("published")).toBe("open");
    expect(storedPhase("in_progress")).toBe("live");
    expect(storedPhase("completed")).toBe("ended");
    expect(storedPhase("approved")).toBe("pending_schedule");
    expect(storedPhase("submitted")).toBe("draft");
  });
});

describe("seatState — capacity, and never a write gate", () => {
  const seats = (capacity: number | null, confirmed: number, deadline: string | null = null) =>
    seatState({ capacity, confirmedCount: confirmed, rsvpDeadlineAt: deadline }, NOW);

  it("null capacity is unlimited, so never full and never a waitlist", () => {
    expect(seats(null, 0)).toBe("unlimited");
    expect(seats(null, 9_999)).toBe("unlimited");
  });

  it("available below capacity, full at or above it", () => {
    expect(seats(60, 42)).toBe("available");
    expect(seats(60, 60)).toBe("full");
    expect(seats(60, 61)).toBe("full");
  });

  it("a passed deadline is closed, whatever the capacity", () => {
    expect(seats(60, 0, at(-1))).toBe("closed");
    expect(seats(null, 0, at(-1))).toBe("closed");
  });

  it("no deadline is not the same as a passed one", () => {
    expect(seats(60, 0, null)).toBe("available");
  });

  it("a future deadline does not close the seat", () => {
    expect(seats(60, 0, at(1))).toBe("available");
  });
});

describe("closingSoon — «يُغلق التسجيل قريبًا» is a derivation, not a state", () => {
  it("is true inside the window and false outside it", () => {
    expect(closingSoon(at(24), NOW)).toBe(true);
    expect(closingSoon(at(47), NOW)).toBe(true);
    expect(closingSoon(at(49), NOW)).toBe(false);
  });

  it("is false once the deadline has passed — that is `closed`, a different thing", () => {
    expect(closingSoon(at(-1), NOW)).toBe(false);
  });

  it("is false with no deadline", () => {
    expect(closingSoon(null, NOW)).toBe(false);
  });
});

describe("viewerRelation — read from the viewer's own rows, never inferred", () => {
  const v = (over: Partial<Parameters<typeof viewerRelation>[0]> = {}) =>
    ({ isStaff: false, isPresenter: false, rsvpStatus: null, checkedIn: false, ...over });

  it("returns one of the seven relations for every input shape", () => {
    for (const phase of SESSION_PHASES) {
      for (const status of [null, "confirmed", "waitlisted", "cancelled", "late_cancelled"] as const) {
        for (const checkedIn of [false, true]) {
          for (const isStaff of [false, true]) {
            for (const isPresenter of [false, true]) {
              const relation = viewerRelation(v({ rsvpStatus: status, checkedIn, isStaff, isPresenter }), phase);
              expect(VIEWER_RELATIONS).toContain(relation);
            }
          }
        }
      }
    }
  });

  it("a presenter is a presenter first — they cannot check in (REQ-CHK-011)", () => {
    expect(viewerRelation(v({ isPresenter: true, rsvpStatus: "confirmed" }), "open")).toBe("presenter");
    expect(viewerRelation(v({ isPresenter: true, isStaff: true }), "live")).toBe("presenter");
    expect(viewerRelation(v({ isPresenter: true, checkedIn: true }), "ended")).toBe("presenter");
  });

  it("an admin holding a seat is an attendee first — the console is where they act as staff", () => {
    expect(viewerRelation(v({ isStaff: true, rsvpStatus: "confirmed" }), "open")).toBe("confirmed");
    expect(viewerRelation(v({ isStaff: true }), "open")).toBe("staff");
  });

  it("a cancelled RSVP reads as no seat", () => {
    expect(viewerRelation(v({ rsvpStatus: "cancelled" }), "open")).toBe("none");
    expect(viewerRelation(v({ rsvpStatus: "late_cancelled" }), "open")).toBe("none");
  });

  it("attended and absent appear only once the phase is ended", () => {
    expect(viewerRelation(v({ rsvpStatus: "confirmed", checkedIn: true }), "live")).toBe("confirmed");
    expect(viewerRelation(v({ rsvpStatus: "confirmed", checkedIn: true }), "ended")).toBe("attended");
    expect(viewerRelation(v({ rsvpStatus: "confirmed", checkedIn: false }), "ended")).toBe("absent");
    expect(viewerRelation(v({ rsvpStatus: "waitlisted", checkedIn: false }), "ended")).toBe("absent");
  });

  it("a member who never reserved has no outcome on an ended session", () => {
    expect(viewerRelation(v(), "ended")).toBe("none");
    expect(viewerRelation(v({ isStaff: true }), "ended")).toBe("staff");
  });

  it("★ a walk-in who checked in without a seat is attended, not none (DEC-065)", () => {
    expect(viewerRelation(v({ rsvpStatus: null, checkedIn: true }), "ended")).toBe("attended");
  });
});

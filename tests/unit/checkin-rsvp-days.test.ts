// `getRsvpPanelData()` derives its phase from the DAY SET — DEC-119, DEC-150
// contract 9. The defect this pins is not a wrong string on a screen: it is
// TWO READERS OF ONE SCREEN DISAGREEING.
//
// The event page computes its phase with `days`; the RSVP panel used to
// compute its own from the session's stored window alone. `sessionPhase()`
// only reads the hours BETWEEN two days as `open` when it is handed the days —
// without them a three-day workshop is `live` from day 1's start to day 3's
// end. So on the night between day 1 and day 2 the page would say `open` and
// the panel `live`, on the same render, and `rsvp`/`cancel` are exactly the
// affordances the matrix takes away at `live`: the member would be shown a
// session they could neither join nor leave, for a reason nothing on the page
// explains.
//
// At one day the two are identical by arithmetic — there is no «between» — so
// the pre-existing suites are the evidence that nothing moved for the common
// case, and they pass unmodified.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memorySupabase } from "./sessions-memory-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));

const ORG = "00000000-0000-4000-8000-0000000000aa";
const ME = "00000000-0000-4000-8000-0000000000bb";
const SESSION = "00000000-0000-4000-8000-0000000000cc";
const DAY1 = "00000000-0000-4000-8000-0000000000d1";
const DAY2 = "00000000-0000-4000-8000-0000000000d2";

const state: { client: ReturnType<typeof memorySupabase> } = { client: memorySupabase({}) };
vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: ME, orgId: ORG, role: "member" }, supabase: state.client }),
}));

const { getRsvpPanelData } = await import("@/lib/dal/rsvp");
const { sessionPhase } = await import("@/lib/session-status");

const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

/** Day 1 ended 4 h ago; day 2 starts in 20 h. Now is the night between them. */
// `session_id` is not decoration: `listSessionDays()` filters on it, and a row
// without it is silently dropped — which reads exactly like «this session has
// no days» and would let this file pass while proving nothing.
const DAYS = [
  { id: DAY1, session_id: SESSION, position: 1, starts_at: at(-6), ends_at: at(-4), check_in_open: true },
  { id: DAY2, session_id: SESSION, position: 2, starts_at: at(20), ends_at: at(22), check_in_open: true },
];

/** The session's STORED window is the shadow of the day set (contract 1). */
const SESSION_ROW = {
  id: SESSION,
  state: "in_progress",
  starts_at: DAYS[0].starts_at,
  ends_at: DAYS[1].ends_at,
  duration_minutes: 120,
  capacity: 40,
  rsvp_deadline_at: null,
  cancellation_cutoff_at: null,
};

function world(days: Record<string, unknown>[]) {
  state.client = memorySupabase(
    {
      sessions: [SESSION_ROW],
      session_days: days,
      rsvps: [{ session_id: SESSION, member_id: ME, status: "confirmed", waitlist_position: null }],
      session_presenters: [],
      check_ins: [],
    },
    { session_seat_counts: { confirmed_count: 1, waitlist_count: 0 } },
  );
}

describe("the RSVP panel and the event page agree about the phase", () => {
  beforeEach(() => world(DAYS));

  it("★ between day 1 and day 2 the panel reads `open`, which is what sessionPhase() says WITH the days", async () => {
    const panel = await getRsvpPanelData("ar", SESSION);
    const pageAnswer = sessionPhase({
      state: "in_progress",
      startsAt: SESSION_ROW.starts_at,
      endsAt: SESSION_ROW.ends_at,
      durationMinutes: SESSION_ROW.duration_minutes,
      days: DAYS.map((d) => ({ id: d.id, position: d.position, startsAt: d.starts_at, endsAt: d.ends_at })),
    });

    expect(panel?.phase).toBe(pageAnswer);
    expect(panel?.phase).toBe("open");
  });

  it("and it is NOT the day-less answer — the defect this exists to catch", async () => {
    // What the panel returned before it read the days: the session's stored
    // window alone spans day 1's start to day 2's end, so the night reads
    // `live` and the matrix withdraws both `rsvp` and `cancel`.
    const dayLess = sessionPhase({
      state: "in_progress",
      startsAt: SESSION_ROW.starts_at,
      endsAt: SESSION_ROW.ends_at,
      durationMinutes: SESSION_ROW.duration_minutes,
    });
    expect(dayLess).toBe("live");

    const panel = await getRsvpPanelData("ar", SESSION);
    expect(panel?.phase).not.toBe(dayLess);
    // The affordance that was being withdrawn: a confirmed member can still
    // cancel on the night between two meetings.
    expect(panel?.canCancel).toBe(true);
  });

  it("at ONE day the answer is the day-less one — no «between» exists, so nothing moved for the common case", async () => {
    world([DAYS[0]]);
    const single = { ...SESSION_ROW, ends_at: DAYS[0].ends_at };
    state.client = memorySupabase(
      {
        sessions: [single],
        session_days: [DAYS[0]],
        rsvps: [{ session_id: SESSION, member_id: ME, status: "confirmed", waitlist_position: null }],
        session_presenters: [],
        check_ins: [],
      },
      { session_seat_counts: { confirmed_count: 1, waitlist_count: 0 } },
    );

    const panel = await getRsvpPanelData("ar", SESSION);
    const withoutDays = sessionPhase({ state: "in_progress", startsAt: single.starts_at, endsAt: single.ends_at, durationMinutes: 120 });
    expect(panel?.phase).toBe(withoutDays);
    expect(panel?.phase).toBe("ended");
  });
});

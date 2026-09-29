// `getRsvpPanelData()` and a member checked in on TWO days — DEC-197 §3.
//
// Since wave 9 a workshop has one check-in per day. The panel read the
// viewer's check-in with `.maybeSingle()`, which refuses two rows with an
// error — and the error was never read. So a member who attended day 1 and
// day 2 read as NOT checked in, and once the workshop had ended the panel
// called them `absent`. The fix reads a list; this file pins it at one day
// and at two, and that a removed row (REQ-CHK-017) still counts for nothing.
import { describe, expect, it, vi } from "vitest";
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

const at = (hours: number) => new Date(Date.now() + hours * 3_600_000).toISOString();

/** A two-day workshop that ended yesterday: the relation is now the outcome. */
const DAYS = [
  { id: DAY1, session_id: SESSION, position: 1, starts_at: at(-50), ends_at: at(-48), check_in_open: false },
  { id: DAY2, session_id: SESSION, position: 2, starts_at: at(-26), ends_at: at(-24), check_in_open: false },
];

function world(checkIns: Record<string, unknown>[]) {
  state.client = memorySupabase(
    {
      sessions: [
        {
          id: SESSION,
          state: "completed",
          starts_at: DAYS[0].starts_at,
          ends_at: DAYS[1].ends_at,
          duration_minutes: 120,
          capacity: 40,
          rsvp_deadline_at: null,
          cancellation_cutoff_at: null,
        },
      ],
      session_days: DAYS,
      rsvps: [{ session_id: SESSION, member_id: ME, status: "confirmed", waitlist_position: null }],
      session_presenters: [],
      check_ins: checkIns,
    },
    { session_seat_counts: { confirmed_count: 1, waitlist_count: 0 } },
  );
}

const checkIn = (id: string, day: string, removed = false) => ({ id, session_id: SESSION, member_id: ME, session_day_id: day, removed_at: removed ? at(-1) : null });

describe("a member checked in on more than one day reads as checked in", () => {
  it("one day attended → attended", async () => {
    world([checkIn("c1", DAY1)]);
    expect((await getRsvpPanelData("ar", SESSION))?.relation).toBe("attended");
  });

  it("★ both days attended → attended, not absent (the defect)", async () => {
    world([checkIn("c1", DAY1), checkIn("c2", DAY2)]);
    expect((await getRsvpPanelData("ar", SESSION))?.relation).toBe("attended");
  });

  it("a removed check-in counts for nothing, beside an active one or alone", async () => {
    world([checkIn("c1", DAY1, true), checkIn("c2", DAY2)]);
    expect((await getRsvpPanelData("ar", SESSION))?.relation).toBe("attended");
    world([checkIn("c1", DAY1, true)]);
    expect((await getRsvpPanelData("ar", SESSION))?.relation).toBe("absent");
  });
});

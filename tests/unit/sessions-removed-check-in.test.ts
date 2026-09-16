// A REMOVED check-in is not attendance (REQ-CHK-017, migration 0087). An
// admin's removal soft-deletes the row — `check_ins.removed_at` is set and the
// row stays, for `certificates.check_in_id` and the audit trail — and RLS does
// NOT hide it. So every reader in `sessions`' DAL that asks "did this member
// check in" must say `removed_at is null` itself, or the screen offers what
// the database now refuses:
//
//   · the event page's viewer relation   (lib/dal/sessions.ts)
//   · the rate screen's gate             (lib/dal/ratings.ts — the DB refuses
//                                          the rating, POL-ratings.write_self_excludes_removed)
//   · «حضرت» on a timeline card, in the ended view and on a saved session
//                                         (lib/dal/search.ts, both readers)
//
// Each case holds a removed check-in and NO active one; the stub filters rows
// for real, so a reader without the filter reads the removed row and fails.
// A second case holds a removed row AND a re-added active one — the partial
// unique index allows exactly that — which a `.maybeSingle()` without the
// filter would refuse as two rows.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { memorySupabase } from "./sessions-memory-supabase";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));
vi.mock("@/lib/dal/posters", () => ({ getSessionPoster: async () => null }));

const ORG = "00000000-0000-4000-8000-0000000000aa";
const ME = "00000000-0000-4000-8000-0000000000bb";
const SESSION = "00000000-0000-4000-8000-0000000000cc";
const ADMIN = "00000000-0000-4000-8000-0000000000dd";

const state: { client: ReturnType<typeof memorySupabase> } = { client: memorySupabase({}) };

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({ session: { memberId: ME, orgId: ORG, role: "member" }, supabase: state.client }),
}));

const { getSessionForEvent } = await import("@/lib/dal/sessions");
const { getRatingEligibility } = await import("@/lib/dal/ratings");
const { getTimeline, getTimelineSessionsByIds } = await import("@/lib/dal/search");
const { parseTimelineQuery } = await import("@/components/browse/timeline-query");

const ended = {
  id: SESSION,
  org_id: ORG,
  title: "مقدمة في قراءة الميزانية",
  abstract: "ملخص",
  state: "completed",
  level: "introductory",
  language: "ar",
  category_id: null,
  venue_id: null,
  duration_minutes: 60,
  starts_at: "2026-09-10T15:00:00Z",
  ends_at: "2026-09-10T16:00:00Z",
  completed_at: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  time_zone: "Asia/Riyadh",
  capacity: 30,
  rsvp_deadline_at: null,
  cancellation_cutoff_at: null,
  cancellation_reason: null,
  allow_walk_ins: false,
  custom_venue_name: "قاعة الابتكار",
  categories: null,
  venues: null,
};

const removed = { id: "ci-removed", org_id: ORG, session_id: SESSION, member_id: ME, removed_at: "2026-09-12T10:00:00Z", removed_by: ADMIN };
const active = { id: "ci-active", org_id: ORG, session_id: SESSION, member_id: ME, removed_at: null };

function world(checkIns: Record<string, unknown>[]) {
  state.client = memorySupabase({
    sessions: [ended],
    check_ins: checkIns,
    rsvps: [{ org_id: ORG, session_id: SESSION, member_id: ME, status: "confirmed" }],
    session_presenters: [],
    session_tags: [],
    bookmarks: [{ org_id: ORG, session_id: SESSION, member_id: ME }],
    org_settings: [{ org_id: ORG, time_zone: "Asia/Riyadh", rating_window_days: 14, rating_min_aggregate: 3 }],
    ratings: [],
    categories: [],
    venues: [],
    companies: [],
  });
}

beforeEach(() => world([removed]));

describe("a removed check-in is not attendance — the event page", () => {
  it("reads the viewer of an ended session whose only check-in was removed as absent, not attended", async () => {
    expect((await getSessionForEvent("ar", SESSION))?.viewerRelation).toBe("absent");
  });

  it("reads a re-added check-in as attended, beside the removed one", async () => {
    world([removed, active]);
    expect((await getSessionForEvent("ar", SESSION))?.viewerRelation).toBe("attended");
  });
});

describe("a removed check-in is not attendance — the rate gate", () => {
  it("refuses to offer the form: not checked in", async () => {
    const eligibility = await getRatingEligibility("ar", SESSION);
    expect(eligibility.reason).toBe("not_checked_in");
    expect(eligibility.eligible).toBe(false);
  });

  it("offers it on the re-added check-in, and names that one", async () => {
    world([removed, active]);
    const eligibility = await getRatingEligibility("ar", SESSION);
    expect(eligibility.eligible).toBe(true);
    expect(eligibility.checkInId).toBe("ci-active");
  });
});

describe("a removed check-in is not attendance — «حضرت» on a card", () => {
  it("the ended view does not mark the card attended", async () => {
    const data = await getTimeline("ar", parseTimelineQuery({ status: "ended" }));
    expect(data.items.find((s) => s.id === SESSION)?.attended).toBe(false);
  });

  it("a saved session does not either", async () => {
    const [card] = await getTimelineSessionsByIds("ar", [SESSION]);
    expect(card.attended).toBe(false);
  });

  it("both do once it is re-added", async () => {
    world([removed, active]);
    expect((await getTimeline("ar", parseTimelineQuery({ status: "ended" }))).items.find((s) => s.id === SESSION)?.attended).toBe(true);
    expect((await getTimelineSessionsByIds("ar", [SESSION]))[0].attended).toBe(true);
  });
});

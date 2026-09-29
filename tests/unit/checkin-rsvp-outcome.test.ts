// `toRsvpOutcome()` — the row `reserve_seat()` / `cancel_rsvp()` return, as the
// outcome moment 1 keys on (DEC-195 §2.1, contract 4, `sessions'` R2, DEC-197).
//
// ★ `fresh` is the whole point: a repeat submit on a held seat must never read
// as a new reservation, or moment 1 replays on a double tap. `reserve_seat()`
// (`0045:80-100`) sets `reserved_at = now()` beside `updated_at = now()` on a new
// or reactivated row, and keeps the old `reserved_at` on a repeat.
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));

const { toRsvpOutcome } = await import("@/lib/dal/rsvp");

const ID = "00000000-0000-4000-8000-0000000000ee";

describe("toRsvpOutcome", () => {
  it("a new or reactivated seat — one now() in both columns — is fresh, and carries the row's id", () => {
    const at = "2026-09-29T10:00:00.123456+00:00";
    expect(toRsvpOutcome({ id: ID, status: "confirmed", waitlist_position: null, reserved_at: at, updated_at: at })).toEqual({
      status: "confirmed",
      waitlistPosition: null,
      id: ID,
      reservedAt: at,
      fresh: true,
    });
  });

  it("a repeat submit — the old reserved_at, a new updated_at — is not fresh", () => {
    const out = toRsvpOutcome({ id: ID, status: "waitlisted", waitlist_position: 3, reserved_at: "2026-09-28T10:00:00+00:00", updated_at: "2026-09-29T10:00:00+00:00" });
    expect(out.fresh).toBe(false);
    expect(out.waitlistPosition).toBe(3);
  });

  it("the same instant written two ways is still the same instant — compared as time, not text", () => {
    expect(toRsvpOutcome({ id: ID, status: "confirmed", waitlist_position: null, reserved_at: "2026-09-29T10:00:00+00:00", updated_at: "2026-09-29T13:00:00+03:00" }).fresh).toBe(true);
  });

  it("an unreadable instant is never fresh", () => {
    expect(toRsvpOutcome({ id: ID, status: "confirmed", waitlist_position: null, reserved_at: "", updated_at: "" }).fresh).toBe(false);
  });
});

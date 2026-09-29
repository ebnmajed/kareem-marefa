// The reserve action returns its result and refreshes — it never redirects
// (REQ-UIX-045, DEC-195 §2.1, DEC-197 §4 / §7). A redirect would drop the
// result, and a moment keyed to the render after it would replay on every
// visit: the defect this wave exists to prevent.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/dal/rsvp", () => ({ reserveSeat: vi.fn(), cancelRsvp: vi.fn() }));
vi.mock("@/lib/dal/calendar", () => ({ getCalendarConnection: vi.fn() }));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { reserveSeat, cancelRsvp } = await import("@/lib/dal/rsvp");
const { getCalendarConnection } = await import("@/lib/dal/calendar");
const { refresh } = await import("next/cache");
const { redirect } = await import("next/navigation");
const { reserveSeatAction, cancelRsvpAction } = await import("@/components/checkin/actions");

const SESSION = "11111111-1111-1111-1111-111111111111";
const outcome = (over: Record<string, unknown> = {}) => ({
  status: "confirmed" as const,
  waitlistPosition: null,
  id: "rsvp-1",
  reservedAt: "2026-09-29T10:00:00+00:00",
  fresh: true,
  ...over,
});

beforeEach(() => {
  vi.mocked(reserveSeat).mockReset();
  vi.mocked(getCalendarConnection).mockReset().mockResolvedValue(null);
  vi.mocked(refresh).mockClear();
  vi.mocked(redirect).mockClear();
});

describe("reserveSeatAction", () => {
  it("a fresh confirmed seat: its occurrence is the reservation's id, status and reserved_at", async () => {
    vi.mocked(reserveSeat).mockResolvedValue(outcome());
    const result = await reserveSeatAction("ar", SESSION);
    expect(result).toEqual({ ok: true, status: "confirmed", occurrence: "rsvp-1:confirmed:2026-09-29T10:00:00+00:00", calendar: "manual" });
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
  });

  it("a repeat submit — the same seat read back — has no occurrence", async () => {
    vi.mocked(reserveSeat).mockResolvedValue(outcome({ fresh: false }));
    const result = await reserveSeatAction("ar", SESSION);
    expect(result).toMatchObject({ ok: true, occurrence: null });
    expect(getCalendarConnection).not.toHaveBeenCalled();
  });

  it("a fresh place on the waitlist is an occurrence of its own", async () => {
    vi.mocked(reserveSeat).mockResolvedValue(outcome({ status: "waitlisted", waitlistPosition: 3 }));
    expect(await reserveSeatAction("ar", SESSION)).toEqual({
      ok: true,
      status: "waitlisted",
      occurrence: "rsvp-1:waitlisted:2026-09-29T10:00:00+00:00",
      calendar: "manual",
    });
    expect(getCalendarConnection).not.toHaveBeenCalled();
  });

  it("the whisper's truth: `sync` only for a connected calendar", async () => {
    vi.mocked(reserveSeat).mockResolvedValue(outcome());
    vi.mocked(getCalendarConnection).mockResolvedValue({ provider: "google", connectedAt: "2026-09-01T00:00:00Z", disconnectedAt: null });
    expect(await reserveSeatAction("ar", SESSION)).toMatchObject({ calendar: "sync" });
    vi.mocked(getCalendarConnection).mockResolvedValue({ provider: "google", connectedAt: "2026-09-01T00:00:00Z", disconnectedAt: "2026-09-10T00:00:00Z" });
    expect(await reserveSeatAction("ar", SESSION)).toMatchObject({ calendar: "manual" });
  });

  it("a calendar read that fails never loses the reservation's answer", async () => {
    vi.mocked(reserveSeat).mockResolvedValue(outcome());
    vi.mocked(getCalendarConnection).mockRejectedValue(new Error("calendar_connections: boom"));
    expect(await reserveSeatAction("ar", SESSION)).toMatchObject({ ok: true, calendar: "manual" });
  });

  it("a refusal is a result — named for the two the card words, `unknown` for the rest — and still refreshes", async () => {
    vi.mocked(reserveSeat).mockResolvedValue({ error: "deadline_passed" });
    expect(await reserveSeatAction("ar", SESSION)).toEqual({ ok: false, reason: "deadline_passed" });
    vi.mocked(reserveSeat).mockResolvedValue({ error: "not_open" });
    expect(await reserveSeatAction("ar", SESSION)).toEqual({ ok: false, reason: "not_open" });
    vi.mocked(reserveSeat).mockResolvedValue({ error: "not_found" });
    expect(await reserveSeatAction("ar", SESSION)).toEqual({ ok: false, reason: "unknown" });
    expect(refresh).toHaveBeenCalledTimes(3);
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe("cancelRsvpAction", () => {
  it("refreshes rather than redirecting", async () => {
    vi.mocked(cancelRsvp).mockResolvedValue(outcome({ status: "cancelled" }));
    await cancelRsvpAction("ar", SESSION);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(redirect).not.toHaveBeenCalled();
  });
});

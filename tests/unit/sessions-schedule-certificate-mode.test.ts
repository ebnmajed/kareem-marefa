// REQ-SES-020, DEC-178 contract 2 — a schedule save never states the mode.
// `saveSchedule()` sends `certificateMode: null`, whatever a stale client
// posts, and `scheduleSession()` hands that null to `schedule_session()`,
// which keeps the stored mode (0154). An explicit value is still the
// function's contract, and still passes through.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleInput } from "@/lib/dal/sessions";

const calls: { name: string; args: Record<string, unknown> }[] = [];
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({
    session: { memberId: "m", orgId: "org", role: "admin" },
    supabase: {
      rpc: async (name: string, args: Record<string, unknown>) => {
        calls.push({ name, args });
        return { data: null, error: null };
      },
    },
  }),
}));

const { scheduleInput, scheduleSession } = await import("@/lib/dal/sessions");
const { saveSchedule } = await import("../../src/app/[locale]/app/admin/sessions/[id]/schedule/actions");
const { emptyScheduleState } = await import("../../src/app/[locale]/app/admin/sessions/[id]/schedule/state");

const SESSION = "00000000-0000-4000-8000-0000000000cc";
const VENUE = "00000000-0000-4000-8000-0000000000ff";

beforeEach(() => {
  calls.length = 0;
});

describe("the certificate mode, on a schedule save", () => {
  it("a stale client that still posts a mode sends null — «unchanged»", async () => {
    const fd = new FormData();
    for (const [k, v] of Object.entries({
      startsAt: "2026-10-01T18:00",
      durationMinutes: "60",
      endMode: "follow",
      venueChoice: VENUE,
      capacity: "",
      rsvpPreset: "atStart",
      cutoffPreset: "dayBefore",
      certificateMode: "automatic",
      language: "ar",
    }))
      fd.set(k, v);
    const state = await saveSchedule("ar", SESSION, "Asia/Riyadh", emptyScheduleState(), fd);
    expect(state.saved).toBe(true);
    const rpc = calls.find((c) => c.name === "schedule_session")!;
    expect(rpc.args).toHaveProperty("p_certificate_mode", null);
  });

  it("scheduleInput parses an absent mode to null, and still honours a named one", async () => {
    const base = {
      startsAt: "2026-10-01T15:00:00+03:00",
      durationMinutes: 60,
      endsAt: null,
      venueId: VENUE,
      customVenueName: null,
      customVenueAddress: null,
      customVenueMapUrl: null,
      capacity: null,
      rsvpDeadlineAt: null,
      cancellationCutoffAt: null,
      language: "ar",
    };
    expect(scheduleInput.parse(base).certificateMode).toBeNull();
    const named: ScheduleInput = scheduleInput.parse({ ...base, certificateMode: "review" });
    await scheduleSession("ar", SESSION, named);
    expect(calls.at(-1)!.args).toHaveProperty("p_certificate_mode", "review");
  });
});

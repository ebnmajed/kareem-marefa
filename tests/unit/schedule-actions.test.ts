// SCR-043's one action — «احفظ فقط» and «انشر الجلسة» are the same form with a
// different intent (wave 8, `DEC-147` L2; REQ-SES-001, REQ-SES-016).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleInput } from "@/lib/dal/sessions";

const scheduleSession = vi.fn<(locale: string, sessionId: string, input: ScheduleInput) => Promise<void>>(async () => undefined);
const publishSession = vi.fn<(locale: string, sessionId: string) => Promise<void>>(async () => undefined);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/dal/sessions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dal/sessions")>();
  return { ...actual, scheduleSession, publishSession };
});

const { saveSchedule } = await import("../../src/app/[locale]/app/admin/sessions/[id]/schedule/actions");
const { emptyScheduleState } = await import("../../src/app/[locale]/app/admin/sessions/[id]/schedule/state");

const ZONE = "Asia/Riyadh";
const SESSION = "00000000-0000-4000-8000-0000000000cc";
const VENUE = "00000000-0000-4000-8000-0000000000ff";

function form(fields: Record<string, string>): FormData {
  const fd = new FormData();
  const base: Record<string, string> = {
    startsAt: "2026-10-01T18:00",
    durationMinutes: "60",
    endMode: "follow",
    venueChoice: VENUE,
    capacity: "",
    rsvpPreset: "atStart",
    cutoffPreset: "dayBefore",
    certificateMode: "automatic",
    language: "ar",
  };
  for (const [k, v] of Object.entries({ ...base, ...fields })) fd.set(k, v);
  return fd;
}

beforeEach(() => {
  scheduleSession.mockClear();
  publishSession.mockClear();
  publishSession.mockImplementation(async () => undefined);
});

describe("saveSchedule", () => {
  it("sends a following end as null, so schedule_session() derives it, and resolves the presets from the start", async () => {
    const state = await saveSchedule("ar", SESSION, ZONE, emptyScheduleState(), form({}));
    expect(state.saved).toBe(true);
    const input = scheduleSession.mock.calls[0][2];
    expect(input.startsAt).toBe("2026-10-01T15:00:00.000Z");
    expect(input.endsAt).toBeNull();
    // «عند بدء الجلسة» is the start; «قبل البدء بيوم» is 24 hours earlier.
    expect(input.rsvpDeadlineAt).toBe("2026-10-01T15:00:00.000Z");
    expect(input.cancellationCutoffAt).toBe("2026-09-30T15:00:00.000Z");
    // An empty capacity is «the venue's», which schedule_session() copies.
    expect(input.capacity).toBeNull();
    expect(publishSession).not.toHaveBeenCalled();
  });

  it("★ publishes in ONE press: saves first, then publishes", async () => {
    const fd = form({ intent: "publish" });
    const state = await saveSchedule("ar", SESSION, ZONE, emptyScheduleState(), fd);
    expect(scheduleSession).toHaveBeenCalledTimes(1);
    expect(publishSession).toHaveBeenCalledTimes(1);
    expect(state).toMatchObject({ saved: true, published: true, formError: null });
  });

  it("a refused publish still reports the saved schedule, and says the publish failed", async () => {
    publishSession.mockImplementation(async () => {
      throw new Error("publish_incomplete: capacity");
    });
    const state = await saveSchedule("ar", SESSION, ZONE, emptyScheduleState(), form({ intent: "publish" }));
    expect(state).toMatchObject({ saved: true, published: false, formError: "publishFailed" });
  });

  it("refuses an explicit end before the start AT THE FIELD, and never writes", async () => {
    const state = await saveSchedule("ar", SESSION, ZONE, emptyScheduleState(), form({ endMode: "explicit", endsAt: "2026-10-01T17:00" }));
    expect(state.errors).toEqual({ endsAt: "endBeforeStart" });
    expect(state.attempt).toBe(1);
    expect(scheduleSession).not.toHaveBeenCalled();
    // What was typed comes back, so the form restores it after React's reset.
    expect(state.values.endsAt).toBe("2026-10-01T17:00");
  });

  it("names each missing piece at its own field", async () => {
    const state = await saveSchedule(
      "ar",
      SESSION,
      ZONE,
      emptyScheduleState(),
      form({ startsAt: "", durationMinutes: "5", venueChoice: "custom", customVenueName: "", customVenueAddress: "", customVenueMapUrl: "http://example.com" }),
    );
    expect(state.errors).toEqual({
      startsAt: "startsAtRequired",
      durationMinutes: "durationRange",
      customVenueName: "customNameRequired",
      customVenueAddress: "customAddressRequired",
      customVenueMapUrl: "mapUrl",
    });
    expect(scheduleSession).not.toHaveBeenCalled();
  });

  it("a custom deadline after the start is refused with the deadline's own words", async () => {
    const state = await saveSchedule("ar", SESSION, ZONE, emptyScheduleState(), form({ rsvpPreset: "custom", rsvpDeadlineAt: "2026-10-02T09:00" }));
    expect(state.errors).toEqual({ rsvpDeadlineAt: "rsvpAfterStart" });
  });

  it("a one-off place goes through with its name, address and link", async () => {
    await saveSchedule(
      "ar",
      SESSION,
      ZONE,
      emptyScheduleState(),
      form({ venueChoice: "custom", customVenueName: "بيت الخبرة", customVenueAddress: "الرياض", customVenueMapUrl: "https://maps.example.com/x", capacity: "25" }),
    );
    expect(scheduleSession.mock.calls[0][2]).toMatchObject({
      venueId: null,
      customVenueName: "بيت الخبرة",
      customVenueAddress: "الرياض",
      customVenueMapUrl: "https://maps.example.com/x",
      capacity: 25,
    });
  });
});

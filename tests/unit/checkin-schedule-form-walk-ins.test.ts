// checkin's own half of contract 1 — the schedule form's checkbox, feeding
// schedule_session()'s p_allow_walk_ins (DEC-117, DEC-118, migration 0085).
// sessions' own tests/unit/sessions-schedule-walk-ins.test.ts proves the DAL
// side (null stays null, a boolean stays that boolean); this proves the
// FORM side — saveSchedule() (actions.ts) reads the checkbox's presence in
// FormData and sends an explicit true/false whenever `allowWalkInsKnown` is
// present (the permanent design: this form always states the setting when
// it can render the real one), and falls back to null ("unchanged") when
// it's absent — the interim safety net for the window before `page.tsx`
// reads `allow_walk_ins` back (flagged to the lead, not yet landed): until
// then the checkbox always renders unchecked regardless of the session's
// real value, and reading its bare presence would silently turn walk-ins
// off on every save (found by `sessions`, closed here rather than shipped).
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ScheduleInput } from "@/lib/dal/sessions";

const scheduleSession = vi.fn(async (_locale: string, _sessionId: string, _input: ScheduleInput) => undefined);
const publishSession = vi.fn(async (_locale: string, _sessionId: string) => undefined);

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createServerClient: async () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined }));
vi.mock("@/lib/dal/sessions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/dal/sessions")>();
  return { ...actual, scheduleSession, publishSession };
});

const { saveSchedule } = await import("../../src/app/[locale]/app/admin/sessions/[id]/schedule/actions");

const ZONE = "Asia/Riyadh";
const SESSION = "00000000-0000-4000-8000-0000000000cc";

/** The fields every save needs regardless of the walk-in checkbox. */
function baseFields(): [string, string][] {
  return [
    ["startsAt", "2026-10-01T18:00"],
    ["durationMinutes", "60"],
    ["venueId", "00000000-0000-4000-8000-0000000000ff"],
    ["capacity", "30"],
    ["certificateMode", "off"],
    ["language", "ar"],
  ];
}

beforeEach(() => {
  scheduleSession.mockClear();
});

describe("saveSchedule — the walk-in checkbox reaches scheduleInput as an explicit boolean, once known", () => {
  it("checked + known (the key is present, HTML's default value 'on') sends true", async () => {
    const fd = new FormData();
    for (const [k, v] of baseFields()) fd.set(k, v);
    fd.set("allowWalkIns", "on");
    fd.set("allowWalkInsKnown", "1");

    await saveSchedule("ar", SESSION, ZONE, { error: null, saved: false, published: false }, fd);

    expect(scheduleSession).toHaveBeenCalledTimes(1);
    expect(scheduleSession.mock.calls[0][2].allowWalkIns).toBe(true);
  });

  it("unchecked + known (the key is ABSENT from FormData — the browser's own behaviour) sends false, never null", async () => {
    const fd = new FormData();
    for (const [k, v] of baseFields()) fd.set(k, v);
    fd.set("allowWalkInsKnown", "1");
    // No fd.set("allowWalkIns", ...) at all — this is what an unchecked
    // checkbox actually does, not a test artefact.

    await saveSchedule("ar", SESSION, ZONE, { error: null, saved: false, published: false }, fd);

    expect(scheduleSession).toHaveBeenCalledTimes(1);
    expect(scheduleSession.mock.calls[0][2].allowWalkIns).toBe(false);
  });
});

describe("saveSchedule — the allowWalkInsKnown safety net (interim, until page.tsx reads the value back)", () => {
  it("★ unchecked + UNKNOWN sends null, not false — the hazard sessions found, closed", async () => {
    const fd = new FormData();
    for (const [k, v] of baseFields()) fd.set(k, v);
    // No allowWalkIns AND no allowWalkInsKnown — exactly the page.tsx-hasn't-
    // wired-the-prop-yet state: the checkbox rendered unchecked because
    // `initial.allowWalkIns` was undefined, not because the session's real
    // value is off. Sending `false` here would silently disable walk-ins on
    // a session that actually has them on.

    await saveSchedule("ar", SESSION, ZONE, { error: null, saved: false, published: false }, fd);

    expect(scheduleSession).toHaveBeenCalledTimes(1);
    expect(scheduleSession.mock.calls[0][2].allowWalkIns).toBeNull();
  });

  it("checked + UNKNOWN still sends null — the marker decides, not the checkbox's own state", async () => {
    const fd = new FormData();
    for (const [k, v] of baseFields()) fd.set(k, v);
    fd.set("allowWalkIns", "on");
    // A checked box with no marker is unreachable from the real form (the
    // marker and the defaultChecked value come from the same `initial` read)
    // but the action must not trust the checkbox alone either way — the
    // marker is what distinguishes "stated" from "not yet knowable".

    await saveSchedule("ar", SESSION, ZONE, { error: null, saved: false, published: false }, fd);

    expect(scheduleSession).toHaveBeenCalledTimes(1);
    expect(scheduleSession.mock.calls[0][2].allowWalkIns).toBeNull();
  });
});

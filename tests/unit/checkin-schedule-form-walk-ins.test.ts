// checkin's own half of contract 1 — the schedule form's checkbox, feeding
// schedule_session()'s p_allow_walk_ins (DEC-117, DEC-118, migration 0085).
// sessions' own tests/unit/sessions-schedule-walk-ins.test.ts proves the DAL
// side (null stays null, a boolean stays that boolean); this proves the
// FORM side — saveSchedule() (actions.ts) reads the checkbox's presence in
// FormData and always sends an explicit true/false, never leans on the
// scheduleInput schema's null-means-unchanged default, because this form
// always states the setting when saved (unlike some other future caller
// that might skip the field on purpose).
//
// An interim `allowWalkInsKnown` marker briefly guarded a real hazard here
// (`sessions` found it: until `page.tsx` read `allow_walk_ins` back, the
// checkbox always rendered unchecked and this action would have sent an
// explicit `false` over a session's real `true`). `page.tsx`'s read-back
// landed at `343991d`, `initial.allowWalkIns` is required in
// schedule-form.tsx as of the same cleanup, and the marker is gone —
// `tests/components/checkin/schedule-form.test.tsx` now pins the half of
// this fix that a DAL-only test can't reach: that the stored value actually
// arrives at the control's `defaultChecked`.
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

describe("saveSchedule — the walk-in checkbox reaches scheduleInput as an explicit boolean", () => {
  it("checked (the key is present, HTML's default value 'on') sends true", async () => {
    const fd = new FormData();
    for (const [k, v] of baseFields()) fd.set(k, v);
    fd.set("allowWalkIns", "on");

    await saveSchedule("ar", SESSION, ZONE, { error: null, saved: false, published: false }, fd);

    expect(scheduleSession).toHaveBeenCalledTimes(1);
    expect(scheduleSession.mock.calls[0][2].allowWalkIns).toBe(true);
  });

  it("unchecked (the key is ABSENT from FormData — the browser's own behaviour) sends false, never null", async () => {
    const fd = new FormData();
    for (const [k, v] of baseFields()) fd.set(k, v);
    // No fd.set("allowWalkIns", ...) at all — this is what an unchecked
    // checkbox actually does, not a test artefact.

    await saveSchedule("ar", SESSION, ZONE, { error: null, saved: false, published: false }, fd);

    expect(scheduleSession).toHaveBeenCalledTimes(1);
    expect(scheduleSession.mock.calls[0][2].allowWalkIns).toBe(false);
  });
});

// notify (wave 9) — the calendar jobs at n days, and the shim that keeps them
// right at n = 1 against a database that has not been migrated yet.
//
// A NEW file: `tests/unit/notify-jobs.test.ts` is the evidence that a one-day
// session's branching did not move, so it is not edited (rule 4). Everything
// here is behaviour that did not exist on `main`.
import { describe, expect, it, vi } from "vitest";
import { calendar_upsert, daysOf, setCalendarApi, type SyncTarget } from "../../worker/src/tasks/calendar_upsert";
import { calendar_delete } from "../../worker/src/tasks/calendar_delete";
import { StubCalendarApi } from "../../worker/src/calendar/index";

type Reply = { rows: Record<string, unknown>[] };

function fakeHelpers(answers: Array<[RegExp, (params: unknown[]) => Reply]>) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const logs: string[] = [];
  const helpers = {
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      for (const [pattern, reply] of answers) if (pattern.test(sql)) return reply(params);
      return { rows: [] };
    },
    logger: {
      info: (m: string): void => {
        logs.push(`info: ${m}`);
      },
      error: (m: string): void => {
        logs.push(`error: ${m}`);
      },
    },
  };
  return { helpers: helpers as unknown as Parameters<typeof calendar_upsert>[1], calls, logs };
}

const day = (n: number, providerEventId: string | null = null) => ({
  day_id: `d-${n}`,
  position: n,
  starts_at: `2026-10-0${n}T15:00:00Z`,
  ends_at: `2026-10-0${n}T17:00:00Z`,
  location: `قاعة ${n}`,
  provider_event_id: providerEventId,
  state: providerEventId ? "synced" : null,
});

const target = (over: Partial<SyncTarget> = {}): SyncTarget => ({
  rsvp_id: "r-1",
  org_id: "org-1",
  member_id: "m1",
  session_id: "s-1",
  rsvp_status: "confirmed",
  connected: true,
  provider_event_id: null,
  session: {
    title: "ورشة ثلاثة أيام",
    description: "ملخص",
    starts_at: "2026-10-01T15:00:00Z",
    ends_at: "2026-10-03T17:00:00Z",
    time_zone: "Asia/Riyadh",
    state: "published",
    cancelled: false,
    location: "قاعة 1",
  },
  days: [day(1), day(2), day(3)],
  orphans: [],
  ...over,
});

const answers = (t: unknown, tokens: unknown = { connection_id: "c-1", access_token: "tok", refresh_token: "ref" }) =>
  [
    [/calendar_sync_target/, () => ({ rows: [{ target: t }] })],
    [/calendar_tokens_for_job/, () => ({ rows: [{ tokens }] })],
    [/record_calendar_sync/, () => ({ rows: [{ record_calendar_sync: "e-1" }] })],
    [/record_calendar_event_removed/, () => ({ rows: [] })],
  ] as Array<[RegExp, () => Reply]>;

const recordedDays = (calls: Array<{ sql: string; params: unknown[] }>) =>
  calls.filter((c) => c.sql.includes("record_calendar_sync")).map((c) => c.params[6]);

describe("daysOf — the compatibility shape", () => {
  it("a target with no `days` is ONE day carrying the session's own window, with a null id", () => {
    // The moment between a new worker starting and its migration being applied
    // is the only time this is reached, and it must be exactly what `main`
    // does: one event over the session's window, recorded against the day the
    // SQL resolves for a null — the session's first.
    const legacy = { ...target({ days: undefined, orphans: undefined }), provider_event_id: "g-old" };
    const [only] = daysOf(legacy);

    expect(daysOf(legacy)).toHaveLength(1);
    expect(only.day_id).toBeNull();
    expect(only.starts_at).toBe(legacy.session.starts_at);
    expect(only.ends_at).toBe(legacy.session.ends_at);
    expect(only.location).toBe(legacy.session.location);
    expect(only.provider_event_id).toBe("g-old");
  });

  it("a target WITH days is returned untouched, at one day as at three", () => {
    expect(daysOf(target({ days: [day(1, "g1")] }))).toEqual([day(1, "g1")]);
    expect(daysOf(target())).toHaveLength(3);
  });
});

describe("JOB-calendar_upsert at n days", () => {
  it("creates one event per day, each with THAT day's window and place", async () => {
    const api = new StubCalendarApi();
    setCalendarApi(api);
    const { helpers, calls } = fakeHelpers(answers(target()));

    await calendar_upsert({ rsvp_id: "r-1" }, helpers);

    expect(api.events.size).toBe(3);
    const bodies = [...api.events.values()];
    expect(bodies.map((b) => b.startsAt)).toEqual(["2026-10-01T15:00:00Z", "2026-10-02T15:00:00Z", "2026-10-03T15:00:00Z"]);
    expect(bodies.map((b) => b.location)).toEqual(["قاعة 1", "قاعة 2", "قاعة 3"]);
    // One session, N meetings (DEC-120): the title is the session's on every
    // day, and the date is what tells them apart.
    expect(new Set(bodies.map((b) => b.summary))).toEqual(new Set(["ورشة ثلاثة أيام"]));
    // Each recorded against its own day — the seventh argument.
    expect(recordedDays(calls)).toEqual(["d-1", "d-2", "d-3"]);
    setCalendarApi(null);
  });

  it("updates the days that exist and creates only the one that does not", async () => {
    const api = new StubCalendarApi();
    setCalendarApi(api);
    const { id: first } = await api.createEvent("tok", {
      summary: "قديم",
      description: "ملخص",
      location: "قاعة 1",
      startsAt: "2026-10-01T15:00:00Z",
      endsAt: "2026-10-01T17:00:00Z",
      timeZone: "Asia/Riyadh",
    });
    const { helpers } = fakeHelpers(answers(target({ days: [day(1, first), day(2)] })));

    await calendar_upsert({ rsvp_id: "r-1" }, helpers);

    // Two entries, not three: the existing one moved rather than duplicating.
    expect(api.events.size).toBe(2);
    expect(api.events.get(first)!.summary).toBe("ورشة ثلاثة أيام");
    setCalendarApi(null);
  });

  it("★ removes the entry of a day that was deleted from the session, and marks its row", async () => {
    const api = new StubCalendarApi();
    setCalendarApi(api);
    const { id } = await api.createEvent("tok", {
      summary: "اليوم المحذوف",
      description: "ملخص",
      location: "قاعة 2",
      startsAt: "2026-10-02T15:00:00Z",
      endsAt: "2026-10-02T17:00:00Z",
      timeZone: "Asia/Riyadh",
    });
    const { helpers, calls } = fakeHelpers(
      answers(target({ days: [day(1, "g1")], orphans: [{ calendar_event_id: "ce-2", provider_event_id: id }] })),
    );

    await calendar_upsert({ rsvp_id: "r-1" }, helpers);

    expect(api.deleted).toEqual([id]);
    const closed = calls.find((c) => c.sql.includes("record_calendar_event_removed"))!;
    expect(closed.params[0]).toBe("ce-2");
    setCalendarApi(null);
  });

  it("an orphan whose event the member already deleted by hand is still closed (REQ-CAL-006)", async () => {
    const api = new StubCalendarApi();
    setCalendarApi(api);
    const { helpers, calls } = fakeHelpers(
      answers(target({ days: [], orphans: [{ calendar_event_id: "ce-9", provider_event_id: "already_gone" }] })),
    );

    await expect(calendar_upsert({ rsvp_id: "r-1" }, helpers)).resolves.toBeUndefined();
    expect(calls.find((c) => c.sql.includes("record_calendar_event_removed"))!.params[0]).toBe("ce-9");
    setCalendarApi(null);
  });

  it("a failure on day 2 records THAT day and rethrows, leaving day 1 synced", async () => {
    const api = new StubCalendarApi();
    setCalendarApi(api);
    const { helpers, calls } = fakeHelpers(answers(target({ days: [day(1), day(2), day(3)] })));
    const create = vi.spyOn(api, "createEvent");
    create.mockImplementationOnce(async () => ({ id: "ok-1" }));
    create.mockImplementationOnce(async () => {
      throw new Error("calendar unavailable");
    });

    await expect(calendar_upsert({ rsvp_id: "r-1" }, helpers)).rejects.toThrow("calendar unavailable");

    const records = calls.filter((c) => c.sql.includes("record_calendar_sync"));
    expect(records.map((c) => [c.params[3], c.params[6]])).toEqual([
      ["synced", "d-1"],
      ["failed", "d-2"],
    ]);
    // Day 3 is untouched: the retry will reach it, and re-updating day 1 is
    // idempotent by construction.
    setCalendarApi(null);
  });
});

describe("JOB-calendar_delete at n days", () => {
  it("removes every day's entry and every orphan under the ONE reservation key", async () => {
    const api = new StubCalendarApi();
    setCalendarApi(api);
    const body = (n: number) => ({
      summary: "ورشة ثلاثة أيام",
      description: "ملخص",
      location: `قاعة ${n}`,
      startsAt: `2026-10-0${n}T15:00:00Z`,
      endsAt: `2026-10-0${n}T17:00:00Z`,
      timeZone: "Asia/Riyadh",
    });
    const ids = [];
    for (const n of [1, 2, 3, 4]) ids.push((await api.createEvent("tok", body(n))).id);
    const { helpers, calls } = fakeHelpers(
      answers(
        target({
          days: [day(1, ids[0]), day(2, ids[1]), day(3, ids[2])],
          orphans: [{ calendar_event_id: "ce-x", provider_event_id: ids[3] }],
        }),
      ),
    );

    await calendar_delete({ rsvp_id: "r-1" }, helpers);

    // One حجز covers every day, so cancelling it empties the whole workshop
    // out of the member's calendar — including the day that was deleted from
    // the session before the cancellation.
    expect(api.deleted).toEqual(ids);
    expect(api.events.size).toBe(0);
    expect(recordedDays(calls)).toEqual(["d-1", "d-2", "d-3"]);
    expect(calls.filter((c) => c.sql.includes("record_calendar_event_removed"))).toHaveLength(1);
    setCalendarApi(null);
  });

  it("a session with days but nothing synced does nothing, and never asks for a token", async () => {
    const api = new StubCalendarApi();
    setCalendarApi(api);
    const { helpers, calls, logs } = fakeHelpers(answers(target({ days: [day(1), day(2)] })));

    await calendar_delete({ rsvp_id: "r-1" }, helpers);

    expect(calls.map((c) => c.sql.match(/public\.(\w+)/)?.[1])).toEqual(["calendar_sync_target"]);
    expect(logs.join("\n")).toContain("was never synced");
    setCalendarApi(null);
  });

  it("a disconnected member keeps every day's entry, and every row is closed (REQ-CAL-007)", async () => {
    const api = new StubCalendarApi();
    const deleteSpy = vi.spyOn(api, "deleteEvent");
    setCalendarApi(api);
    const { helpers, calls } = fakeHelpers(answers(target({ connected: false, days: [day(1, "g1"), day(2, "g2")] })));

    await calendar_delete({ rsvp_id: "r-1" }, helpers);

    expect(deleteSpy).not.toHaveBeenCalled();
    expect(recordedDays(calls)).toEqual(["d-1", "d-2"]);
    setCalendarApi(null);
  });
});

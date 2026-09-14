// The notification and calendar JOBS, against fake helpers — the same trick
// tests/unit/worker-probe.test.ts uses for the boot probe.
//
// The RLS suite proves the SQL these jobs call; nothing proves the branching
// between the calls, and that branching is where the requirements live: a
// reminder whose seat was cancelled must send nothing, a 404 on delete is
// success, a failure must write the reason before it throws. Each of those is
// a decision made in TypeScript between two round trips, so this is where it
// can fail.
import { describe, expect, it, vi } from "vitest";
import { MemoryTransport } from "../../worker/src/mail/memory";
import { send_notification, setMailTransport } from "../../worker/src/tasks/send_notification";
import { calendar_upsert, setCalendarApi } from "../../worker/src/tasks/calendar_upsert";
import { calendar_delete } from "../../worker/src/tasks/calendar_delete";
import { StubCalendarApi, type CalendarEventBody } from "../../worker/src/calendar/index";

type Reply = { rows: Record<string, unknown>[] };

/** A fake graphile-worker `helpers`: answers each query from a matcher list
 *  and records everything asked, so a test can assert the ORDER of the calls
 *  as well as their content. */
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
      // Void, like graphile-worker's own Logger: a task that writes
      // `return helpers.logger.info(...)` must resolve to undefined, and a
      // fake that returned Array.push's index would hide that.
      info: (m: string): void => {
        logs.push(`info: ${m}`);
      },
      error: (m: string): void => {
        logs.push(`error: ${m}`);
      },
    },
  };
  // The Task type carries graphile-worker's full JobHelpers; this fake
  // implements the two members these tasks touch.
  return { helpers: helpers as unknown as Parameters<typeof send_notification>[1], calls, logs };
}

const CONTEXT = {
  key: "MSG-rsvp_promoted",
  category: "my_sessions",
  optional: false,
  member: { id: "m1", email: "sara@kareem.example", display_name: "سارة العتيبي", status: "active" },
  org: { name: "كريم معرفة", from_name: "كريم معرفة", reply_to: "admin@kareem.example", numerals: "western", time_zone: "Asia/Riyadh" },
  template: null,
  email_allowed: true,
  in_app_allowed: true,
};

const PAYLOAD = {
  message_id: "msg-1",
  notification_id: "n-1",
  org_id: "org-1",
  member_id: "m1",
  key: "MSG-rsvp_promoted",
  category: "my_sessions",
  optional: false,
  in_app: true,
  email: true,
  payload: { title: "جلسة المعرفة", startsAt: "2026-10-01T15:00:00Z", venue: "قاعة الابتكار" },
};

const sendAnswers = (context: unknown = CONTEXT) =>
  [
    [/notification_send_context/, () => ({ rows: [{ notification_send_context: context }] })],
    [/record_email_delivery/, () => ({ rows: [{ record_email_delivery: "d-1" }] })],
  ] as Array<[RegExp, () => Reply]>;

describe("JOB-send_notification", () => {
  it("renders the Arabic template and records the delivery as sent (REQ-NTF-008)", async () => {
    const transport = new MemoryTransport();
    setMailTransport(transport);
    const { helpers, calls } = fakeHelpers(sendAnswers());

    await send_notification(PAYLOAD, helpers);

    expect(transport.sent).toHaveLength(1);
    const mail = transport.sent[0];
    expect(mail.to).toBe("sara@kareem.example");
    expect(mail.subject).toBe("حصلت على مقعد في جلسة المعرفة");
    expect(mail.text).toContain("سارة العتيبي");
    // 08 §3.4: the org's name in the From display name, its admin as Reply-To.
    expect(mail.fromName).toBe("كريم معرفة");
    expect(mail.replyTo).toBe("admin@kareem.example");

    // The delivery row is written BEFORE the send and moved after, so a
    // worker that dies mid-send leaves a `queued` row an admin can see.
    const order = calls.map((c) => c.sql.match(/public\.(\w+)/)?.[1]);
    expect(order).toEqual(["notification_send_context", "record_email_delivery", "update_email_delivery"]);
    expect(calls[2].sql).toContain("'sent'");
    expect(calls[2].params).toEqual(["d-1", transport.sent[0].providerMessageId]);
    setMailTransport(null);
  });

  it("sends nothing when the member turned the category off between enqueue and send (11 §2.6)", async () => {
    const transport = new MemoryTransport();
    setMailTransport(transport);
    // The payload was frozen a week ago with `email: true`; the context is
    // read now and says otherwise. The context wins — that is the whole point
    // of checking at send time.
    const { helpers, calls } = fakeHelpers(sendAnswers({ ...CONTEXT, email_allowed: false }));

    await send_notification(PAYLOAD, helpers);

    expect(transport.sent).toEqual([]);
    // And no delivery row either: nothing was attempted, so there is no
    // outcome to log.
    expect(calls.map((c) => c.sql)).toHaveLength(1);
    setMailTransport(null);
  });

  it("does nothing at all for an in-app-only message", async () => {
    const transport = new MemoryTransport();
    setMailTransport(transport);
    const { helpers, calls } = fakeHelpers(sendAnswers());

    await send_notification({ ...PAYLOAD, email: false, key: "MSG-rsvp_confirmed" }, helpers);

    // notify() already wrote the inbox row in the caller's transaction.
    expect(calls).toEqual([]);
    expect(transport.sent).toEqual([]);
    setMailTransport(null);
  });

  it("writes the reason before it throws, so the admin sees WHY (REQ-NTF-008)", async () => {
    const transport = new MemoryTransport();
    transport.failNext = "550 mailbox unavailable";
    setMailTransport(transport);
    const { helpers, calls } = fakeHelpers(sendAnswers());

    await expect(send_notification(PAYLOAD, helpers)).rejects.toThrow("550 mailbox unavailable");

    const last = calls[calls.length - 1];
    expect(last.sql).toContain("'failed'");
    expect(last.params).toEqual(["d-1", "550 mailbox unavailable"]);
    // The throw is what makes graphile-worker retry (11 §1.3); the row is what
    // makes the failure visible while it does.
    setMailTransport(null);
  });

  it("fails loudly and once on a message with no template — a matrix bug, not a transient fault", async () => {
    setMailTransport(new MemoryTransport());
    const { helpers } = fakeHelpers(sendAnswers({ ...CONTEXT, key: "MSG-rsvp_confirmed" }));
    await expect(send_notification({ ...PAYLOAD, key: "MSG-rsvp_confirmed" }, helpers)).rejects.toThrow(/no email template/);
    setMailTransport(null);
  });
});

const TARGET = {
  rsvp_id: "r-1",
  org_id: "org-1",
  member_id: "m1",
  session_id: "s-1",
  rsvp_status: "confirmed",
  connected: true,
  provider_event_id: null as string | null,
  session: {
    title: "جلسة المعرفة",
    description: "ملخص",
    starts_at: "2026-10-01T15:00:00Z",
    ends_at: "2026-10-01T16:00:00Z",
    time_zone: "Asia/Riyadh",
    state: "published",
    cancelled: false,
    location: "قاعة الابتكار",
  },
};

/** The shape the API takes, which is NOT the shape the RPC returns — the job
 *  is what maps one to the other, so a test seeding the stub must build it. */
const eventBody = (summary: string): CalendarEventBody => ({
  summary,
  description: TARGET.session.description,
  location: TARGET.session.location,
  startsAt: TARGET.session.starts_at,
  endsAt: TARGET.session.ends_at,
  timeZone: TARGET.session.time_zone,
});

const calendarAnswers = (target: unknown, tokens: unknown = { connection_id: "c-1", access_token: "tok", refresh_token: "ref" }) =>
  [
    [/calendar_sync_target/, () => ({ rows: [{ target }] })],
    [/calendar_tokens_for_job/, () => ({ rows: [{ tokens }] })],
    [/record_calendar_sync/, () => ({ rows: [{ record_calendar_sync: "e-1" }] })],
  ] as Array<[RegExp, () => Reply]>;

describe("JOB-calendar_upsert", () => {
  it("creates an event for a seat with no event yet — promotion CREATES (08 §6.3)", async () => {
    const api = new StubCalendarApi();
    setCalendarApi(api);
    const { helpers, calls } = fakeHelpers(calendarAnswers(TARGET));

    await calendar_upsert({ rsvp_id: "r-1" }, helpers);

    expect(api.events.size).toBe(1);
    const recorded = calls.find((c) => c.sql.includes("record_calendar_sync"))!;
    expect(recorded.params[3]).toBe("synced");
    expect(recorded.params[4]).toMatch(/^stub_event_/);
    setCalendarApi(null);
  });

  it("updates the existing event rather than creating a second (REQ-CAL-004, REQ-CAL-005)", async () => {
    const api = new StubCalendarApi();
    setCalendarApi(api);
    const { id } = await api.createEvent("tok", eventBody("قديم"));
    const { helpers } = fakeHelpers(calendarAnswers({ ...TARGET, provider_event_id: id }));

    await calendar_upsert({ rsvp_id: "r-1" }, helpers);

    expect(api.events.size).toBe(1);
    expect(api.events.get(id)!.summary).toBe("جلسة المعرفة");
    setCalendarApi(null);
  });

  it("recreates an event the member deleted by hand, rather than dead-lettering (REQ-CAL-006)", async () => {
    const api = new StubCalendarApi();
    setCalendarApi(api);
    // A provider_event_id we hold for an event that is no longer there.
    const { helpers, calls } = fakeHelpers(calendarAnswers({ ...TARGET, provider_event_id: "gone_forever" }));

    await calendar_upsert({ rsvp_id: "r-1" }, helpers);

    expect(api.events.size).toBe(1);
    const recorded = calls.find((c) => c.sql.includes("record_calendar_sync"))!;
    expect(recorded.params[3]).toBe("synced");
    setCalendarApi(null);
  });

  it("does nothing for a member with no connected calendar, and never touches the API", async () => {
    const api = new StubCalendarApi();
    setCalendarApi(api);
    const { helpers, calls } = fakeHelpers(calendarAnswers({ ...TARGET, connected: false }));

    await calendar_upsert({ rsvp_id: "r-1" }, helpers);

    expect(api.events.size).toBe(0);
    // Not even a token lookup: the credential is fetched at the last possible
    // moment, and there is no moment here.
    expect(calls.map((c) => c.sql.match(/public\.(\w+)/)?.[1])).toEqual(["calendar_sync_target"]);
    setCalendarApi(null);
  });

  it("records the reason and rethrows on a real API failure (REQ-CAL-005, REQ-CAL-008)", async () => {
    const api = new StubCalendarApi();
    api.failNext = "error";
    setCalendarApi(api);
    const { helpers, calls } = fakeHelpers(calendarAnswers(TARGET));

    await expect(calendar_upsert({ rsvp_id: "r-1" }, helpers)).rejects.toThrow("calendar unavailable");

    const recorded = calls.find((c) => c.sql.includes("record_calendar_sync"))!;
    expect(recorded.params[3]).toBe("failed");
    expect(String(recorded.params[5])).toContain("calendar unavailable");
    setCalendarApi(null);
  });
});

describe("JOB-calendar_delete", () => {
  it("removes the event and records it", async () => {
    const api = new StubCalendarApi();
    setCalendarApi(api);
    const { id } = await api.createEvent("tok", eventBody("س"));
    const { helpers, calls } = fakeHelpers(calendarAnswers({ ...TARGET, provider_event_id: id }));

    await calendar_delete({ rsvp_id: "r-1" }, helpers);

    expect(api.deleted).toEqual([id]);
    expect(calls.find((c) => c.sql.includes("record_calendar_sync"))!.params[3]).toBe("removed");
    setCalendarApi(null);
  });

  it("★ treats a 404 as SUCCESS — the member already deleted it (REQ-CAL-006)", async () => {
    const api = new StubCalendarApi();
    setCalendarApi(api);
    const { helpers, calls, logs } = fakeHelpers(calendarAnswers({ ...TARGET, provider_event_id: "already_gone" }));

    // No throw: the job's goal is that the event is not in their calendar,
    // and it is not. Retrying eight times would be over an accomplished fact.
    await expect(calendar_delete({ rsvp_id: "r-1" }, helpers)).resolves.toBeUndefined();

    expect(calls.find((c) => c.sql.includes("record_calendar_sync"))!.params[3]).toBe("removed");
    expect(logs.join("\n")).toContain("already absent");
    setCalendarApi(null);
  });

  it("leaves the event in place when the member disconnected first (REQ-CAL-007)", async () => {
    const api = new StubCalendarApi();
    const deleteSpy = vi.spyOn(api, "deleteEvent");
    setCalendarApi(api);
    const { helpers, calls } = fakeHelpers(calendarAnswers({ ...TARGET, connected: false, provider_event_id: "e-9" }));

    await calendar_delete({ rsvp_id: "r-1" }, helpers);

    // The tokens are gone, and the member was told their events would simply
    // stop updating. Deleting them anyway would be the worse surprise.
    expect(deleteSpy).not.toHaveBeenCalled();
    expect(calls.find((c) => c.sql.includes("record_calendar_sync"))!.params[3]).toBe("removed");
    setCalendarApi(null);
  });

  it("does nothing for an RSVP that was never synced", async () => {
    const api = new StubCalendarApi();
    setCalendarApi(api);
    const { helpers, calls } = fakeHelpers(calendarAnswers({ ...TARGET, provider_event_id: null }));

    await calendar_delete({ rsvp_id: "r-1" }, helpers);

    expect(calls.map((c) => c.sql.match(/public\.(\w+)/)?.[1])).toEqual(["calendar_sync_target"]);
    setCalendarApi(null);
  });
});

// notify (wave 2, M3) — supabase/proposed/notify/0006_calendar_sync.sql.
//
// 03 §8.2 rows proven here:
//   RPC-store_calendar_connection.self · RPC-store_calendar_connection.write_only ·
//   RPC-calendar_tokens_for_job.worker_only · RPC-record_calendar_sync.idempotent ·
//   POL-calendar_connections.disconnect_notice
//
// The one that matters most is `write_only`: storing a token must not create a
// read path for the member who stored it. A33 and REQ-CAL-003 say tokens are
// never displayed to anyone, and "anyone" includes the account's owner.
//
// 0006 depends on 0005 for `session_venue_label()`, so both are applied here
// in that order — promote them in that order too.
import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const PROPOSED = ["notify/0005_session_notices.sql", "notify/0006_calendar_sync.sql"];

/** A file the lead has promoted is applied by `supabase db reset` and no
 *  longer exists under `supabase/proposed/`. In a shared tree that promotion
 *  lands mid-session, so the list above is the dependency ORDER and the
 *  filesystem decides which of them still need applying here. */
async function setup(tx: Tx) {
  const f = await seed(tx);
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  for (const table of ["calendar_events", "calendar_connections", "notifications"]) await tx.q(`delete from public.${table}`);
  return f;
}

const store = (tx: Tx, access = "tok_access", refresh: string | null = "tok_refresh") =>
  tx.q<{ id: string }>(`select public.store_calendar_connection($1, $2, now() + interval '1 hour', 'calendar.events') as id`, [access, refresh]);

describe("RPC-store_calendar_connection", () => {
  it("self — it stores the CALLER's connection and takes no member id at all", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[0].claims);
      await store(tx);

      await tx.asOwner();
      const rows = await tx.q<{ member_id: string; scope: string }>(`select member_id, scope from public.calendar_connections`);
      expect(rows).toHaveLength(1);
      expect(rows[0].member_id).toBe(f.a.members[0].memberId);
      expect(rows[0].scope).toBe("calendar.events");

      // There is no parameter through which a member could name someone else,
      // which is the point; the signature is the guarantee.
      expect(await errorCode(() => tx.q(`select public.store_calendar_connection('a', 'b', now(), 's', $1)`, [f.a.members[1].memberId]))).toBe("42883");
    });
  });

  it("write_only — storing a token does not make it readable, not even to its owner", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[0].claims);
      await store(tx);

      // The four status columns, and 42501 on anything else. This is the one
      // place in the product where admin access is narrower than self access.
      expect(await tx.q(`select member_id, provider, connected_at, disconnected_at from public.calendar_connections`)).toHaveLength(1);
      expect(await errorCode(() => tx.q(`select * from public.calendar_connections`))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`select access_token_encrypted from public.calendar_connections`))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`select public.calendar_tokens_for_job($1)`, [f.a.members[0].memberId]))).toBe(PERMISSION_DENIED);
    });
  });

  it("re-connecting without a refresh token keeps the one already held", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[0].claims);
      await store(tx, "first_access", "the_refresh");
      // Google returns a refresh token only on the FIRST consent. Erasing it
      // on a re-connect leaves the member silently unsynced an hour later.
      await store(tx, "second_access", null);

      await tx.asServiceRole();
      const [{ tokens }] = await tx.q<{ tokens: { access_token: string; refresh_token: string } }>(
        `select public.calendar_tokens_for_job($1) as tokens`,
        [f.a.members[0].memberId],
      );
      expect(tokens.access_token).toBe("second_access");
      expect(tokens.refresh_token).toBe("the_refresh");
    });
  });

  it("refuses an empty access token rather than storing a connection that cannot work", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[0].claims);
      expect(await errorCode(() => store(tx, "   "))).toBe("22023");
    });
  });
});

describe("RPC-calendar_tokens_for_job.worker_only", () => {
  it("is the only function that returns a token, and no client role may call it", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[0].claims);
      await store(tx);

      for (const who of [f.a.members[0].claims, f.a.mod.claims, f.a.admin.claims]) {
        await tx.as(who);
        expect(await errorCode(() => tx.q(`select public.calendar_tokens_for_job($1)`, [f.a.members[0].memberId]))).toBe(PERMISSION_DENIED);
        expect(await errorCode(() => tx.q(`select public.calendar_connections_due_refresh()`))).toBe(PERMISSION_DENIED);
        expect(await errorCode(() => tx.q(`select public.update_calendar_tokens($1, 'x', now())`, [f.a.members[0].memberId]))).toBe(PERMISSION_DENIED);
      }
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select public.calendar_tokens_for_job($1)`, [f.a.members[0].memberId]))).toBe(PERMISSION_DENIED);

      await tx.asServiceRole();
      const [{ tokens }] = await tx.q<{ tokens: { access_token: string } | null }>(`select public.calendar_tokens_for_job($1) as tokens`, [f.a.members[0].memberId]);
      expect(tokens?.access_token).toBe("tok_access");
      // A member who never connected is null, not an error: the sync job has
      // nothing to do and REQ-CAL-008 says nothing blocks.
      expect((await tx.q<{ tokens: unknown }>(`select public.calendar_tokens_for_job($1) as tokens`, [f.a.members[1].memberId]))[0].tokens).toBeNull();
    });
  });

  it("lists connections due a refresh without handing out their tokens", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.members[0].claims);
      await store(tx);
      await tx.asOwner();
      await tx.q(`update public.calendar_connections set expires_at = now() + interval '10 minutes'`);

      await tx.asServiceRole();
      const due = await tx.q<{ connection_id: string; member_id: string }>(`select * from public.calendar_connections_due_refresh()`);
      expect(due).toHaveLength(1);
      expect(due[0].member_id).toBe(f.a.members[0].memberId);
      expect(Object.keys(due[0])).toEqual(["connection_id", "member_id"]);

      await tx.asOwner();
      await tx.q(`update public.calendar_connections set expires_at = now() + interval '5 hours'`);
      await tx.asServiceRole();
      expect(await tx.q(`select * from public.calendar_connections_due_refresh()`)).toEqual([]);
    });
  });
});

describe("RPC-record_calendar_sync.idempotent — REQ-CAL-004", () => {
  it("running it twice for one member and session leaves ONE row", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asServiceRole();
      const record = (state: string, eventId: string | null, error: string | null = null) =>
        tx.q(`select public.record_calendar_sync($1, $2, $3, $4::public.calendar_sync_state, $5, $6)`, [
          f.a.id,
          f.a.members[0].memberId,
          f.m2.a.published,
          state,
          eventId,
          error,
        ]);

      await record("pending", null);
      await record("synced", "goog_1");
      await record("synced", "goog_1");

      await tx.asOwner();
      const rows = await tx.q<{ state: string; provider_event_id: string; last_synced_at: string }>(
        `select state, provider_event_id, last_synced_at from public.calendar_events`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].state).toBe("synced");
      expect(rows[0].provider_event_id).toBe("goog_1");
    });
  });

  it("keeps the event id through a failure and a removal", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asServiceRole();
      const record = (state: string, eventId: string | null, error: string | null = null) =>
        tx.q(`select public.record_calendar_sync($1, $2, $3, $4::public.calendar_sync_state, $5, $6)`, [f.a.id, f.a.members[0].memberId, f.m2.a.published, state, eventId, error]);

      // `service_role` writes through the definer function and cannot select
      // the table (0026 revokes it), so every read below is as the owner.
      const readBack = async () => {
        await tx.asOwner();
        const [row] = await tx.q<{ state: string; provider_event_id: string; error: string }>(
          `select state, provider_event_id, error from public.calendar_events`,
        );
        await tx.asServiceRole();
        return row;
      };

      await record("synced", "goog_1");
      // REQ-CAL-005: a failed sync is surfaced, not silently dropped.
      await record("failed", null, "rateLimitExceeded");
      expect(await readBack()).toMatchObject({ state: "failed", provider_event_id: "goog_1", error: "rateLimitExceeded" });

      // REQ-CAL-006: a 404 from Google on delete is success, and it carries
      // no event id — the only record of what was created must survive it.
      await record("removed", null);
      expect(await readBack()).toMatchObject({ state: "removed", provider_event_id: "goog_1", error: null });
    });
  });

  it("is definer-only, and the member reads their own row but writes none", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asServiceRole();
      await tx.q(`select public.record_calendar_sync($1, $2, $3, 'failed', null, 'quota')`, [f.a.id, f.a.members[0].memberId, f.m2.a.published]);

      await tx.as(f.a.members[0].claims);
      const rows = await tx.q<{ error: string }>(`select error from public.calendar_events`);
      expect(rows).toHaveLength(1);
      expect(rows[0].error).toBe("quota"); // REQ-CAL-005 surfaces it to the member
      expect(await errorCode(() => tx.q(`select public.record_calendar_sync($1, $2, $3, 'synced', 'x', null)`, [f.a.id, f.a.members[0].memberId, f.m2.a.completed]))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("calendar_sync_target", () => {
  it("gives the job the session as it stands, and connection as a boolean not a token", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asOwner();
      const [rsvp] = await tx.q<{ id: string }>(
        `insert into public.rsvps (org_id, session_id, member_id, status, reserved_at)
         values ($1, $2, $3, 'confirmed', now()) returning id`,
        [f.a.id, f.m2.a.draft, f.a.members[0].memberId],
      );

      await tx.asServiceRole();
      const [{ target }] = await tx.q<{ target: Record<string, unknown> }>(`select public.calendar_sync_target($1) as target`, [rsvp.id]);
      expect(target.connected).toBe(false);
      expect(target.rsvp_status).toBe("confirmed");
      expect(Object.keys(target)).not.toContain("access_token");
      expect((target.session as { location: string }).location).toBe("قاعة كريم معرفة");

      // A key that names nothing is null, not an error — REQ-CAL-008.
      expect((await tx.q<{ target: unknown }>(`select public.calendar_sync_target('00000000-0000-0000-0000-000000000000') as target`))[0].target).toBeNull();
    });
  });
});

describe("POL-calendar_connections.disconnect_notice — REQ-CAL-007", () => {
  it("deleting the row tells the member, and leaves their calendar events alone", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const me = f.a.members[0];
      await tx.as(me.claims);
      await store(tx);
      await tx.asServiceRole();
      await tx.q(`select public.record_calendar_sync($1, $2, $3, 'synced', 'goog_1', null)`, [f.a.id, me.memberId, f.m2.a.published]);
      await tx.asOwner();
      await tx.q(`delete from public.notifications`);

      await tx.as(me.claims);
      await tx.q(`delete from public.calendar_connections`);

      await tx.asOwner();
      // The tokens are gone immediately — not flagged, gone.
      expect(await tx.q(`select id from public.calendar_connections`)).toEqual([]);
      const notices = await tx.q<{ key: string; member_id: string }>(`select key, member_id from public.notifications`);
      expect(notices).toHaveLength(1);
      expect(notices[0]).toMatchObject({ key: "MSG-calendar_disconnected", member_id: me.memberId });

      // The row that RECORDS the event is marked removed; the event in the
      // member's own Google calendar is left exactly where it is.
      const [event] = await tx.q<{ state: string; provider_event_id: string }>(`select state, provider_event_id from public.calendar_events`);
      expect(event).toMatchObject({ state: "removed", provider_event_id: "goog_1" });
    });
  });

  it("the notice is non-optional — it arrives even with `account` muted", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const me = f.a.members[0];
      await tx.asOwner();
      // `account` is one of 08 §2's three not-switchable categories, so the
      // check constraint refuses to store the mute in the first place.
      expect(
        await errorCode(() =>
          tx.q(
            `insert into public.notification_preferences (org_id, member_id, category, channel, enabled)
             values ($1, $2, 'account', 'in_app', false)`,
            [f.a.id, me.memberId],
          ),
        ),
      ).toBe("23514");

      await tx.as(me.claims);
      await store(tx);
      await tx.asOwner();
      await tx.q(`delete from public.notifications`);
      await tx.as(me.claims);
      await tx.q(`delete from public.calendar_connections`);
      await tx.asOwner();
      expect(await tx.q(`select key from public.notifications`)).toHaveLength(1);
    });
  });
});

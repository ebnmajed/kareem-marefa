// Realtime authorization (03 §7, DEC-021, DEC-022) — supabase/proposed/event/01_realtime_authorization.sql.
// Applied with applyProposed() inside each test's rolled-back transaction
// (DEC-040): nothing here touches the shared local database.
//
// What this file does NOT prove: channel privacy (`config: { private: true }`)
// is a client-side property (src/lib/realtime/channel.ts is the one place
// that opens a channel, and it is unit-tested there) — Supabase refuses an
// anonymous subscribe to a private channel before any SQL runs. This suite
// proves what happens once the socket IS authenticated: realtime.messages
// RLS, and the broadcast payload the two triggers produce.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());


describe("POL-realtime.messages", () => {
  it("select — a member of org A subscribing to org B's session topic gets nothing; org A's own succeeds", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const ownTopic = `session:${f.m2.a.published}`;
      const otherTopic = `session:${f.m2.b.published}`;
      await tx.asOwner();
      await tx.q(`insert into realtime.messages (topic, extension, event, payload, private) values ($1, 'broadcast', 'probe', '{}'::jsonb, true)`, [ownTopic]);
      await tx.q(`insert into realtime.messages (topic, extension, event, payload, private) values ($1, 'broadcast', 'probe', '{}'::jsonb, true)`, [otherTopic]);
      await tx.as(f.a.members[0].claims);
      expect((await tx.q(`select id from realtime.messages where topic = $1`, [ownTopic])).length).toBeGreaterThan(0);
      expect(await tx.q(`select id from realtime.messages where topic = $1`, [otherTopic])).toEqual([]);
    });
  });

  it("insert — a member cannot broadcast into a session topic belonging to another org", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      expect(
        await errorCode(() =>
          tx.q(`insert into realtime.messages (topic, extension, event, payload) values ($1, 'broadcast', 'x', '{}'::jsonb)`, [`session:${f.m2.b.published}`]),
        ),
      ).toBe(PERMISSION_DENIED);
      const ok = await tx.q(`insert into realtime.messages (topic, extension, event, payload) values ($1, 'broadcast', 'x', '{}'::jsonb) returning id`, [
        `session:${f.m2.a.published}`,
      ]);
      expect(ok.length).toBe(1);
    });
  });

  it("host_topic — a checked-in but not staff/presenter member receives nothing; the presenter and staff do (OQ-013)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const hostTopic = `host:${f.m2.a.published}`;
      await tx.asOwner();
      await tx.q(`insert into realtime.messages (topic, extension, event, payload, private) values ($1, 'broadcast', 'probe', '{}'::jsonb, true)`, [hostTopic]);
      // members[1] is checked in to the published session but is neither staff nor its presenter.
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from realtime.messages where topic = $1`, [hostTopic])).toEqual([]);
      // members[0] is the published session's presenter (fixture-m2.ts).
      await tx.as(f.a.members[0].claims);
      expect((await tx.q(`select id from realtime.messages where topic = $1`, [hostTopic])).length).toBe(1);
      await tx.as(f.a.admin.claims);
      expect((await tx.q(`select id from realtime.messages where topic = $1`, [hostTopic])).length).toBe(1);
    });
  });

  it("a member of org B cannot read org A's host topic at all, staff or not", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const hostTopic = `host:${f.m2.a.published}`;
      await tx.asOwner();
      await tx.q(`insert into realtime.messages (topic, extension, event, payload, private) values ($1, 'broadcast', 'probe', '{}'::jsonb, true)`, [hostTopic]);
      await tx.as(f.b.admin.claims);
      expect(await tx.q(`select id from realtime.messages where topic = $1`, [hostTopic])).toEqual([]);
    });
  });
});

describe("POL-realtime.payload_shape", () => {
  it("comments broadcast the row; reactions broadcast totals, never a member id", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const topic = `session:${f.m2.a.published}`;

      await tx.as(f.a.members[1].claims);
      const [c] = await tx.q<{ id: string }>(
        `insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'تعليق حي') returning id`,
        [f.a.id, f.m2.a.published, f.a.members[1].memberId],
      );
      await tx.q(`insert into public.reactions (org_id, comment_id, member_id, kind) values ($1, $2, $3, 'like')`, [f.a.id, c.id, f.a.members[1].memberId]);

      await tx.asOwner();
      const rows = await tx.q<{ event: string; payload: { id?: string; authorDisplayName?: string; totals?: Record<string, number> } }>(
        `select event, payload from realtime.messages where topic = $1 order by inserted_at`,
        [topic],
      );

      const commentMsg = rows.find((r) => r.event === "INSERT" && r.payload.id === c.id);
      expect(commentMsg).toBeTruthy();
      // The payload carries a display name, not just author_id — a stranger's
      // comment must be renderable without a follow-up query.
      expect(typeof commentMsg!.payload.authorDisplayName).toBe("string");
      expect((commentMsg!.payload.authorDisplayName as string).length).toBeGreaterThan(0);

      const reactionMsg = rows.find((r) => r.event === "reaction_totals");
      expect(reactionMsg).toBeTruthy();
      expect(reactionMsg!.payload.totals).toEqual({ like: 1 });
      // The payload never names who reacted (03 §7.4) — only the aggregate.
      expect(JSON.stringify(reactionMsg!.payload)).not.toContain(f.a.members[1].memberId);
    });
  });

  it("editing a comment broadcasts an UPDATE; a reaction removal updates the totals to zero-absent", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const topic = `session:${f.m2.a.published}`;

      await tx.as(f.a.members[1].claims);
      const [c] = await tx.q<{ id: string }>(
        `insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'قبل التعديل') returning id`,
        [f.a.id, f.m2.a.published, f.a.members[1].memberId],
      );
      await tx.q(`update public.comments set body = 'بعد التعديل' where id = $1`, [c.id]);
      await tx.q(`insert into public.reactions (org_id, comment_id, member_id, kind) values ($1, $2, $3, 'like')`, [f.a.id, c.id, f.a.members[1].memberId]);
      await tx.q(`delete from public.reactions where comment_id = $1 and member_id = $2`, [c.id, f.a.members[1].memberId]);

      await tx.asOwner();
      const rows = await tx.q<{ event: string; payload: { body?: string; totals?: Record<string, number> } }>(
        `select event, payload from realtime.messages where topic = $1 order by inserted_at`,
        [topic],
      );
      const editMsg = rows.find((r) => r.event === "UPDATE" && r.payload.body === "بعد التعديل");
      expect(editMsg).toBeTruthy();
      const afterRemoval = rows.filter((r) => r.event === "reaction_totals").at(-1);
      expect(afterRemoval!.payload.totals).toEqual({});
    });
  });
});

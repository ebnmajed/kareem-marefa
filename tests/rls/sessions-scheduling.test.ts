// STORY-SES-001 — schedule and publish (REQ-SES-001, REQ-SES-002).
//
// 03 §8.2 rows: RPC-schedule_session.admin_only,
//               RPC-schedule_session.derives,
//               RPC-publish_session.gate,
//               RPC-publish_session.path
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

const PROPOSED = "sessions/0005_session_scheduling.sql";
const CHECK_VIOLATION = "23514";
const IN_TWO_DAYS = "now() + interval '2 days'";

/** A bare draft session of org A, the shape create_session() leaves behind. */
async function draft(tx: Tx, f: Awaited<ReturnType<typeof seed>>, title = "جلسة تنتظر الجدولة") {
  await tx.asOwner();
  const [{ id }] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, state)
     values ($1, $2, 'ملخص الجلسة', $3, 'introductory', 'draft') returning id`,
    [f.a.id, title, f.a.categoryId],
  );
  return id;
}

type Scheduled = { starts_at: string; ends_at: string; duration_minutes: number; time_zone: string; capacity: number; venue_id: string | null; rsvp_deadline_at: string };

const schedule = (tx: Tx, id: string, opts: Partial<Record<string, unknown>> = {}) =>
  tx.q<Scheduled>(
    `select starts_at, ends_at, duration_minutes, time_zone, capacity, venue_id, rsvp_deadline_at
       from public.schedule_session($1, ${IN_TWO_DAYS}, $2, $3, $4, $5, $6, null, $7, null, null, 'off', 'ar')`,
    [id, opts.duration ?? 60, opts.endsAt ?? null, opts.venue ?? null, opts.customName ?? null, opts.customAddress ?? null, opts.capacity ?? null],
  );

const publish = (tx: Tx, id: string) => tx.q<{ state: string; published_at: string | null }>(`select state, published_at from public.publish_session($1)`, [id]);

describe("RPC-schedule_session.admin_only", () => {
  it("refuses a member, a moderator and the session's own presenter", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await draft(tx, f);
      await tx.asOwner();
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`, [f.a.id, id, f.a.members[0].memberId]);

      // ★ D13/D14: a presenter cannot set a date. Not by policy, not by grant,
      // and not by reaching the RPC either.
      for (const who of [f.a.members[0].claims, f.a.mod.claims]) {
        await tx.as(who);
        expect(await errorMessage(() => schedule(tx, id, { venue: f.a.venueId }))).toMatch(/not_an_admin/);
      }
      await tx.as({ ...f.a.admin.claims, claims_version: (f.a.admin.claims.claims_version ?? 0) + 2 });
      expect(await errorCode(() => schedule(tx, id, { venue: f.a.venueId }))).toBe(PERMISSION_DENIED);

      await tx.as(f.b.admin.claims);
      expect(await errorMessage(() => schedule(tx, id, {}))).toMatch(/session_not_found/);
    });
  });

  it("a presenter still cannot reach the scheduling columns directly", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await tx.as(f.a.members[0].claims); // a presenter of the fixture's published session
      expect(await errorCode(() => tx.q(`update public.sessions set starts_at = now() where id = $1`, [f.m2.a.published]))).toBe(PERMISSION_DENIED);
      expect(await errorCode(() => tx.q(`update public.sessions set capacity = 999 where id = $1`, [f.m2.a.published]))).toBe(PERMISSION_DENIED);
      // …but the four columns 0010 does grant them still work.
      expect(await tx.q(`update public.sessions set title = 'عنوان منقّح' where id = $1 returning id`, [f.m2.a.published])).toHaveLength(1);
    });
  });

  it("will not reschedule a finished, archived or cancelled session", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => schedule(tx, f.m2.a.completed, { venue: f.a.venueId }))).toMatch(/session_not_schedulable/);
    });
  });
});

describe("RPC-schedule_session.derives", () => {
  it("stores ends_at from the duration, and lets an explicit end override it (REQ-SES-002, OQ-001)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await draft(tx, f);
      await tx.as(f.a.admin.claims);

      const [derived] = await schedule(tx, id, { duration: 90, venue: f.a.venueId });
      expect(new Date(derived.ends_at).getTime() - new Date(derived.starts_at).getTime()).toBe(90 * 60 * 1000);

      // OQ-001: the duration pre-fills and is never authoritative.
      await tx.asOwner();
      const [{ later }] = await tx.q<{ later: string }>(`select (now() + interval '2 days' + interval '3 hours')::text as later`);
      await tx.as(f.a.admin.claims);
      const [explicit] = await schedule(tx, id, { duration: 90, endsAt: later, venue: f.a.venueId });
      expect(new Date(explicit.ends_at).getTime() - new Date(explicit.starts_at).getTime()).toBe(3 * 60 * 60 * 1000);
      expect(explicit.duration_minutes).toBe(90);
    });
  });

  it("takes the time zone from the venue, else the org (OQ-018)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await draft(tx, f);

      await tx.as(f.a.admin.claims);
      const [orgZone] = await schedule(tx, id, { customName: "قاعة مستأجرة", customAddress: "طريق الملك فهد" });
      expect(orgZone.time_zone).toBe("Asia/Riyadh");

      await tx.asOwner();
      await tx.q(`update public.venues set time_zone = 'Asia/Dubai' where id = $1`, [f.a.venueId]);
      await tx.as(f.a.admin.claims);
      const [venueZone] = await schedule(tx, id, { venue: f.a.venueId });
      expect(venueZone.time_zone).toBe("Asia/Dubai");
    });
  });

  it("pre-fills the capacity from the venue and lets the admin override it (REQ-SES-006)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await draft(tx, f);
      await tx.asOwner();
      await tx.q(`update public.venues set capacity = 40 where id = $1`, [f.a.venueId]);

      await tx.as(f.a.admin.claims);
      expect((await schedule(tx, id, { venue: f.a.venueId }))[0].capacity).toBe(40);
      expect((await schedule(tx, id, { venue: f.a.venueId, capacity: 25 }))[0].capacity).toBe(25);
    });
  });

  it("a custom venue needs a name AND an address, and never both kinds at once (REQ-SES-007)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await draft(tx, f);
      await tx.as(f.a.admin.claims);

      expect(await errorMessage(() => schedule(tx, id, { customName: "قاعة بلا عنوان" }))).toMatch(/custom_venue_needs_name_and_address/);
      expect(await errorMessage(() => schedule(tx, id, { customAddress: "عنوان بلا اسم" }))).toMatch(/custom_venue_needs_name_and_address/);
      expect(await errorMessage(() => schedule(tx, id, { venue: f.a.venueId, customName: "قاعة", customAddress: "عنوان" }))).toMatch(
        /venue_or_custom_venue_not_both/,
      );

      const [ok] = await schedule(tx, id, { customName: "قاعة مستأجرة", customAddress: "طريق الملك فهد" });
      expect(ok.venue_id).toBeNull();
      // REQ-SES-007: not silently added to the org's venue list.
      await tx.asOwner();
      expect(await tx.q(`select id from public.venues where name = 'قاعة مستأجرة'`)).toEqual([]);
    });
  });

  it("refuses a deactivated venue, and one belonging to another org", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await draft(tx, f);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => schedule(tx, id, { venue: f.b.venueId }))).toMatch(/venue_not_found/);
      await tx.asOwner();
      await tx.q(`update public.venues set deactivated_at = now() where id = $1`, [f.a.venueId]);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => schedule(tx, id, { venue: f.a.venueId }))).toMatch(/venue_not_found/);
    });
  });
});

describe("RPC-publish_session.gate", () => {
  it("is refused while anything is missing, and names what (REQ-SES-001)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await draft(tx, f);

      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => publish(tx, id))).toMatch(/publish_incomplete: starts_at,ends_at,capacity,venue/);

      // A venue and a time, but no capacity — the venue has none to lend.
      await tx.asOwner();
      await tx.q(`update public.venues set capacity = null where id = $1`, [f.a.venueId]);
      await tx.as(f.a.admin.claims);
      await schedule(tx, id, { venue: f.a.venueId });
      expect(await errorMessage(() => publish(tx, id))).toMatch(/publish_incomplete: capacity/);
    });
  });

  it("the TABLE refuses it too, not only the function (15-backlog's ★)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await draft(tx, f);
      // Straight past every code path, as the owner: 0010's check constraint
      // is what actually holds the line.
      await tx.asOwner();
      expect(await errorCode(() => tx.q(`update public.sessions set state = 'published' where id = $1`, [id]))).toBe(CHECK_VIOLATION);
    });
  });
});

describe("RPC-publish_session.path", () => {
  it("walks 02 §6.2's chain, one manual transition row per edge", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await draft(tx, f);
      await tx.asOwner();
      await tx.q(`update public.venues set capacity = 30 where id = $1`, [f.a.venueId]);

      await tx.as(f.a.admin.claims);
      await schedule(tx, id, { venue: f.a.venueId });
      const [published] = await publish(tx, id);
      expect(published.state).toBe("published");
      expect(published.published_at).not.toBeNull();

      const rows = await tx.q<{ from_state: string | null; to_state: string; is_manual: boolean; actor_id: string }>(
        `select from_state, to_state, is_manual, actor_id from public.session_state_transitions where session_id = $1 order by occurred_at, ctid`,
        [id],
      );
      // No draft → published shortcut: the frozen diagram has no such edge.
      expect(rows.map((r) => `${r.from_state}→${r.to_state}`)).toEqual([
        "draft→submitted",
        "submitted→in_review",
        "in_review→approved",
        "approved→published",
      ]);
      expect(rows.every((r) => r.is_manual && r.actor_id === f.a.admin.memberId)).toBe(true);
    });
  });

  it("is idempotent, and refuses a session that is past publishing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      await tx.as(f.a.admin.claims);

      const before = (await publish(tx, f.m2.a.published))[0];
      expect(before.state).toBe("published");
      const rows = await tx.q(`select 1 from public.session_state_transitions where session_id = $1`, [f.m2.a.published]);
      expect(rows).toHaveLength(1); // only the fixture's own row: publishing twice moved nothing

      expect(await errorMessage(() => publish(tx, f.m2.a.completed))).toMatch(/session_not_publishable/);
    });
  });

  it("makes the session visible to an ordinary member, which is what publishing means", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, PROPOSED);
      const id = await draft(tx, f);
      await tx.asOwner();
      await tx.q(`update public.venues set capacity = 30 where id = $1`, [f.a.venueId]);

      // Before: `sessions_read` hides a draft from anyone but staff and its
      // presenters.
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.sessions where id = $1`, [id])).toEqual([]);

      await tx.as(f.a.admin.claims);
      await schedule(tx, id, { venue: f.a.venueId });
      await publish(tx, id);

      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select id from public.sessions where id = $1`, [id])).toHaveLength(1);
      // And still not to another org.
      await tx.as(f.b.members[0].claims);
      expect(await tx.q(`select id from public.sessions where id = $1`, [id])).toEqual([]);
    });
  });
});

// supabase/proposed/scoring/0010_priority_rsvp.sql — the priority_rsvp
// perk's head start on reserve_seat() (STORY-RSV-005, OQ-012,
// REQ-RSV-005, REQ-RSV-009).
//
// 03 §8.2 row proven here: POL-rsvps.priority_window.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorMessage, pool, withTx } from "./db";
import { seed, type Org } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

async function ready(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  await applyProposed(tx, "scoring/0010_priority_rsvp.sql");
  return f;
}

/** A freshly published session — published just now, so the default 24h
 * priority window is unambiguously still open, with a distant deadline so
 * that never interferes. */
async function freshlyPublished(tx: Tx, org: Org): Promise<string> {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, rsvp_deadline_at, state, published_at)
     values ($1, 'جلسة أولوية الحجز', 'ملخص', $2, 'introductory', now() + interval '10 days', 60,
             now() + interval '10 days' + interval '1 hour', $3, 30, now() + interval '9 days', 'published', now())
     returning id`,
    [org.id, org.categoryId, org.venueId],
  );
  return row.id;
}

async function grantPriorityRsvp(tx: Tx, org: Org, member: string) {
  const [perk] = await tx.q<{ id: string }>(`select id from public.perks where org_id = $1 and key = 'priority_rsvp'`, [org.id]);
  await tx.q(`insert into public.member_perks (org_id, member_id, perk_id) values ($1, $2, $3)`, [org.id, member, perk.id]);
}

describe("POL-rsvps.priority_window", () => {
  it("a member without the perk is refused during the window; a member with it is not", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const sessionId = await freshlyPublished(tx, f.a);
      const holder = f.a.mod.memberId;
      await grantPriorityRsvp(tx, f.a, holder);

      await tx.as(f.a.members[1].claims);
      expect(await errorMessage(() => tx.q(`select * from public.reserve_seat($1)`, [sessionId]))).toMatch(/rsvp_not_open_yet/);

      await tx.as(f.a.mod.claims);
      const [row] = await tx.q<{ status: string; member_id: string }>(`select status, member_id from public.reserve_seat($1)`, [sessionId]);
      expect(row).toEqual({ status: "confirmed", member_id: holder });

      // Still refused for the plain member — the perk holder's own
      // reservation did not open the window for anyone else.
      await tx.as(f.a.members[1].claims);
      expect(await errorMessage(() => tx.q(`select * from public.reserve_seat($1)`, [sessionId]))).toMatch(/rsvp_not_open_yet/);
    });
  });

  it("after the window closes, everyone may reserve regardless of the perk", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const [row] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                       venue_id, capacity, rsvp_deadline_at, state, published_at)
         values ($1, 'جلسة بعد فتح الحجز العام', 'ملخص', $2, 'introductory', now() + interval '10 days', 60,
                 now() + interval '10 days' + interval '1 hour', $3, 30, now() + interval '9 days', 'published', now() - interval '25 hours')
         returning id`,
        [f.a.id, f.a.categoryId, f.a.venueId],
      );
      await tx.as(f.a.members[1].claims);
      const [reserved] = await tx.q<{ status: string }>(`select status from public.reserve_seat($1)`, [row.id]);
      expect(reserved.status).toBe("confirmed");
    });
  });

  it("a full session still waitlists a priority holder — no displacement, no jump (REQ-RSV-009)", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const [row] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                       venue_id, capacity, rsvp_deadline_at, state, published_at)
         values ($1, 'جلسة أولوية ممتلئة', 'ملخص', $2, 'introductory', now() + interval '10 days', 60,
                 now() + interval '10 days' + interval '1 hour', $3, 1, now() + interval '9 days', 'published', now())
         returning id`,
        [f.a.id, f.a.categoryId, f.a.venueId],
      );
      const holder = f.a.admin.memberId;
      await grantPriorityRsvp(tx, f.a, holder);
      // Fill the single seat directly (as owner — arranging history, not
      // exercising the RPC's own priority gate for this row).
      await tx.q(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [f.a.id, row.id, f.a.members[1].memberId]);

      await tx.as(f.a.admin.claims);
      const [reserved] = await tx.q<{ status: string; waitlist_position: number }>(`select status, waitlist_position from public.reserve_seat($1)`, [row.id]);
      expect(reserved).toEqual({ status: "waitlisted", waitlist_position: 1 });
    });
  });
});

// TRG-check_ins_host_broadcast — supabase/proposed/checkin/01_host_broadcast.sql (REQ-CHK-001, A18,
// REQ-UIX-062, DEC-209 §1). The host view's live count: every check-in and every removal pokes the
// session's private `host:` topic, naming no member. `realtime.test.ts` already proves who may READ
// that topic (0016); this proves only that something now writes to it, and what.
//
// ★ Driven AS A MEMBER calling `check_in()`, and as an admin calling `remove_check_in()` — the trigger
// is `security definer` precisely because those callers cannot write `realtime.messages` themselves.

import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

async function liveSession(tx: Tx, org: Org): Promise<string> {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                   venue_id, capacity, state, published_at, allow_walk_ins)
     values ($1, 'جلسة البث', 'ملخص', $2, 'introductory', now() - interval '10 minutes', 60, now() + interval '50 minutes',
             $3, 40, 'in_progress', now() - interval '1 day', true)
     returning id`,
    [org.id, org.categoryId, org.venueId],
  );
  return row.id;
}

type Poke = { event: string; payload: Record<string, unknown> };
const pokes = (tx: Tx, sessionId: string) =>
  tx.q<Poke>(`select event, payload from realtime.messages where topic = $1 and event = 'check_in_count' order by inserted_at`, [`host:${sessionId}`]);

describe("TRG-check_ins_host_broadcast", () => {
  it(".poke — a member's check-in pokes host:{session} with the day and nothing about who", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, "checkin/01_host_broadcast.sql");
      const sessionId = await liveSession(tx, f.a);
      const [code] = await tx.q<{ code: string; session_day_id: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);

      await tx.as(f.a.members[1].claims);
      const [{ r }] = await tx.q<{ r: { status: string } }>(`select public.check_in($1, $2) as r`, [sessionId, code.code]);
      expect(r.status).toBe("ok");

      await tx.asOwner();
      const rows = await pokes(tx, sessionId);
      expect(rows).toHaveLength(1);
      // `realtime.send()` stamps the message's own `id` into the payload; the rest is ours, and it is the day alone.
      const ours = Object.fromEntries(Object.entries(rows[0].payload).filter(([key]) => key !== "id"));
      expect(ours).toEqual({ dayId: code.session_day_id });
      // ★ Never who: no member id, no name, no time anywhere in it.
      expect(JSON.stringify(rows[0].payload)).not.toContain(f.a.members[1].memberId);
    });
  });

  it(".removal — an admin's removal pokes it again; a refused attempt does not", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, "checkin/01_host_broadcast.sql");
      const sessionId = await liveSession(tx, f.a);
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);

      await tx.as(f.a.members[1].claims);
      await tx.q(`select public.check_in($1, 'ZZZZZZ')`, [sessionId]); // wrong: an attempt row, no check-in
      await tx.q(`select public.check_in($1, $2)`, [sessionId, code.code]);
      await tx.asOwner();
      expect(await pokes(tx, sessionId)).toHaveLength(1);

      await tx.as(f.a.admin.claims);
      await tx.q(`select * from public.remove_check_in($1, $2, $3)`, [sessionId, f.a.members[1].memberId, "سُجّل خطأً"]);
      await tx.asOwner();
      expect(await pokes(tx, sessionId)).toHaveLength(2);
    });
  });

  it(".own_topic — never another session's topic", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, "checkin/01_host_broadcast.sql");
      const sessionId = await liveSession(tx, f.a);
      const other = await liveSession(tx, f.a);
      const [code] = await tx.q<{ code: string }>(`select * from public.ensure_check_in_code($1)`, [sessionId]);

      await tx.as(f.a.members[1].claims);
      await tx.q(`select public.check_in($1, $2)`, [sessionId, code.code]);
      await tx.asOwner();
      expect(await pokes(tx, other)).toHaveLength(0);
    });
  });
});

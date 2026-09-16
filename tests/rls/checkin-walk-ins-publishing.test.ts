// Walk-ins as a publishing setting — DEC-117, DEC-118, DEC-141 correction B.
// supabase/proposed/checkin/02_walk_ins_publishing.sql, applied with
// applyProposed() inside this test's rolled-back transaction (DEC-040).
//
// `03` §8.2 rows: RPC-schedule_session.walk_ins,
// RPC-schedule_session.walk_ins_unchanged, RPC-set_session_walk_ins.retired.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

const PROPOSED = ["checkin/02_walk_ins_publishing.sql"];

async function setup(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  for (const file of PROPOSED) {
    if (existsSync(join(process.cwd(), "supabase", "proposed", file))) await applyProposed(tx, file);
  }
  return f;
}

/** A bare `approved` session, ready to be scheduled — schedule_session()'s
 *  own gate refuses anything past `published`/`archived`/`cancelled`. */
async function makeApprovedSession(tx: Tx, org: Org): Promise<string> {
  const [row] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, state)
     values ($1, 'جلسة جدولة', 'ملخص', $2, 'introductory', 'approved') returning id`,
    [org.id, org.categoryId],
  );
  return row.id;
}

describe("RPC-schedule_session.walk_ins / .walk_ins_unchanged", () => {
  it("sets allow_walk_ins when passed; leaves it unchanged when the parameter is omitted (null)", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await makeApprovedSession(tx, f.a);

      await tx.as(f.a.admin.claims);
      const startsAt = new Date(Date.now() + 3_600_000).toISOString();
      const [scheduled] = await tx.q<{ allow_walk_ins: boolean }>(
        `select allow_walk_ins from public.schedule_session($1, $2, 60, null, $3, null, null, null, 40, null, null, 'off', 'ar', true)`,
        [sessionId, startsAt, f.a.venueId],
      );
      expect(scheduled.allow_walk_ins).toBe(true);

      // A reschedule that names only the date — the 14th positional arg
      // (p_allow_walk_ins) is omitted, so it defaults to null: "unchanged".
      const laterStart = new Date(Date.now() + 7_200_000).toISOString();
      const [rescheduled] = await tx.q<{ allow_walk_ins: boolean }>(
        `select allow_walk_ins from public.schedule_session($1, $2, 60, null, $3, null, null, null, 40, null, null, 'off', 'ar')`,
        [sessionId, laterStart, f.a.venueId],
      );
      expect(rescheduled.allow_walk_ins).toBe(true); // still true — a bare `false` default would have flipped it

      // Explicitly turning it off works too.
      const [turnedOff] = await tx.q<{ allow_walk_ins: boolean }>(
        `select allow_walk_ins from public.schedule_session($1, $2, 60, null, $3, null, null, null, 40, null, null, 'off', 'ar', false)`,
        [sessionId, laterStart, f.a.venueId],
      );
      expect(turnedOff.allow_walk_ins).toBe(false);
    });
  });

  it("a member and a moderator cannot schedule at all — admin-only, same as every other field", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await makeApprovedSession(tx, f.a);
      const startsAt = new Date(Date.now() + 3_600_000).toISOString();

      await tx.as(f.a.mod.claims);
      expect(
        await errorCode(() => tx.q(`select * from public.schedule_session($1, $2, 60, null, $3, null, null, null, 40, null, null, 'off', 'ar', true)`, [sessionId, startsAt, f.a.venueId])),
      ).toBe(PERMISSION_DENIED);
    });
  });
});

describe("RPC-set_session_walk_ins.retired", () => {
  it("the function no longer exists — DEC-118: no door but schedule_session()", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const sessionId = await makeApprovedSession(tx, f.a);
      await tx.as(f.a.admin.claims);
      await expect(tx.q(`select * from public.set_session_walk_ins($1, true)`, [sessionId])).rejects.toThrow(/does not exist/);
    });
  });
});

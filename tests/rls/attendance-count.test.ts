// Wave 18 — how many attended a session: a count, never who (DEC-206 §4.54, DEC-207).
//
// `session_attendance_count()` is a definer function a MEMBER may call; `check_ins` stays
// readable by oneself, staff and presenters only (A33 rule 3). Proven: a member who did
// not attend reads the number and still cannot read a single check-in row; the count is
// distinct members and leaves a removed check-in out; another org's session counts zero
// for them; anon holds no execute.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FILE = "checkin/w18_session_attendance_count.sql";

describe("RPC-session_attendance_count", () => {
  it("a member reads the count of a session, and no row of anyone else's check-in", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, FILE);
      const f = await seed(tx);
      // The completed session: the attendee (members[1]) checked in; members[0] presented it.
      // A second attendee is added as owner, so the member asking reads a count that includes someone else.
      await tx.asOwner();
      await tx.q(
        `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
         values ($1, $2, $3, 'manual', 'حضر', $4, 'empty'::tstzrange)`,
        [f.a.id, f.m2.a.published, f.a.mod.memberId, f.a.admin.memberId],
      );
      const me = f.a.members[1];
      await tx.as(me.claims);
      expect(await tx.q(`select public.session_attendance_count($1) as n`, [f.m2.a.published])).toEqual([{ n: 2 }]);
      expect(await tx.q(`select 1 from public.check_ins where session_id = $1 and member_id <> $2`, [f.m2.a.published, me.memberId])).toEqual([]);
    });
  });

  it("a removed check-in does not count", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, FILE);
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`update public.check_ins set removed_at = now() where id = $1`, [f.m2.a.checkInPublished]);
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select public.session_attendance_count($1) as n`, [f.m2.a.published])).toEqual([{ n: 0 }]);
    });
  });

  it("another org's session counts zero, and anon may not call it", async () => {
    await withTx(async (tx) => {
      await applyProposed(tx, FILE);
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select public.session_attendance_count($1) as n`, [f.m2.b.published])).toEqual([{ n: 0 }]);
      await tx.asOwner();
      const grants = await tx.q<{ grantee: string }>(
        `select grantee from information_schema.routine_privileges where routine_schema = 'public' and routine_name = 'session_attendance_count' and privilege_type = 'EXECUTE' order by grantee`,
      );
      expect(grants.map((g) => g.grantee)).not.toContain("anon");
      expect(grants.map((g) => g.grantee)).toContain("authenticated");
    });
  });
});

// SCR-020's admin tier — `admin_member_profile(uuid)`, wave 7 (DEC-141 ruling
// 4b). A33: an org admin sees a member's email, the sessions they attended and
// their no-show and late-cancellation record; a moderator and a member see
// none of it about anyone. And a REMOVED check-in (REQ-CHK-017) is not
// attendance — it is not counted, not listed, and leaves a no-show behind.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

// Promoted as `0090`, after checkin's removal (`0087`) adds the `removed_at` it
// reads — so the suite proves what `supabase db reset` applied.
async function setup(tx: Tx) {
  const f = await seed(tx);
  await tx.asOwner();
  return f;
}

type Row = { email: string; attended_count: number; attended: { session_id: string; title: string }[]; no_show_count: number; late_cancel_count: number };
const profile = (tx: Tx, memberId: string) => tx.q<Row>(`select * from public.admin_member_profile($1)`, [memberId]);

describe("RPC-admin_member_profile.admin_only", () => {
  it("an admin of the member's org gets one row, with the email and the attendance record", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const attendee = f.a.members[1];
      await tx.as(f.a.admin.claims);
      const rows = await profile(tx, attendee.memberId);
      expect(rows).toHaveLength(1);
      expect(rows[0].email).toBe(attendee.email);
      expect(rows[0].attended_count).toBe(2);
      expect(rows[0].attended.map((a) => a.session_id).sort()).toEqual([f.m2.a.published, f.m2.a.completed].sort());
      expect(rows[0].no_show_count).toBe(0);
      expect(rows[0].late_cancel_count).toBe(0);
    });
  });

  it("a moderator, the member themselves, another member and another org's admin get zero rows", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const attendee = f.a.members[1];
      for (const claims of [f.a.mod.claims, attendee.claims, f.a.members[0].claims, f.b.admin.claims]) {
        await tx.as(claims);
        expect(await profile(tx, attendee.memberId)).toHaveLength(0);
      }
    });
  });

  it("anon cannot call it at all", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.asAnon();
      expect(await errorCode(() => profile(tx, f.a.members[1].memberId))).toBe(PERMISSION_DENIED);
    });
  });
});

describe("RPC-admin_member_profile.fields", () => {
  it("returns exactly the five fields — the return type is the allowlist", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      await tx.as(f.a.admin.claims);
      const [row] = await profile(tx, f.a.members[1].memberId);
      expect(Object.keys(row).sort()).toEqual(["attended", "attended_count", "email", "late_cancel_count", "no_show_count"]);
    });
  });

  it("counts a late cancellation", async () => {
    await withTx(async (tx) => {
      const f = await setup(tx);
      const attendee = f.a.members[1];
      await tx.q(
        `insert into public.rsvps (org_id, session_id, member_id, status, cancelled_at, was_late_cancellation)
         values ($1, $2, $3, 'late_cancelled', now(), true)`,
        [f.a.id, f.m2.a.draft, attendee.memberId],
      );
      await tx.as(f.a.admin.claims);
      expect((await profile(tx, attendee.memberId))[0].late_cancel_count).toBe(1);
    });
  });
});

describe("RPC-admin_member_profile.removed_excluded", () => {
  it(
    "a removed check-in is not attendance, and a confirmed reservation on that ended session becomes a no-show",
    async () => {
      await withTx(async (tx) => {
        const f = await setup(tx);
        const attendee = f.a.members[1];
        await tx.q(`insert into public.rsvps (org_id, session_id, member_id, status) values ($1, $2, $3, 'confirmed')`, [f.a.id, f.m2.a.completed, attendee.memberId]);

        await tx.as(f.a.admin.claims);
        let [row] = await profile(tx, attendee.memberId);
        expect(row.attended_count).toBe(2);
        expect(row.no_show_count).toBe(0);

        await tx.asOwner();
        await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2, removal_reason = 'اختبار' where id = $1`, [f.m2.a.checkInCompleted, f.a.admin.memberId]);

        await tx.as(f.a.admin.claims);
        [row] = await profile(tx, attendee.memberId);
        expect(row.attended_count).toBe(1);
        expect(row.attended.map((a) => a.session_id)).toEqual([f.m2.a.published]);
        expect(row.no_show_count).toBe(1);
      });
    },
  );
});

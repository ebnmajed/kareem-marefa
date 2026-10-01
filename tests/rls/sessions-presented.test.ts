// Wave 19, contract 4 (DEC-213 §5.120, DEC-214) — the sessions a member presented, COUNTED.
//
// `getSessionsPresented()` and `countSessionsPresentedBy()` read with the caller's client, so what they can count
// is what RLS lets a colleague read. Proven here, as a colleague, with the two reads the DAL makes:
//   · the presenter rows are readable org-wide (`p1_org_read`), and another org's are not;
//   · «presented» is DELIVERED (`completed`, `archived`): a published session is listed, never counted, and a draft
//     the presenter can see is invisible to a colleague (`sessions_read`) — so it is neither;
//   · the attendance figure is `session_attendance_count()`: a number, never a check-in row (A33 rule 3).
// The fixture (`fixture-m2.ts`): members[0] presents a published, a completed and a draft session; members[1]
// checked in to the completed one.
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

/** `countSessionsPresentedBy()`'s one read, as PostgREST runs the `!inner` embed. */
const DELIVERED_BY_MEMBER = `
  select sp.member_id, count(*)::int as n
    from public.session_presenters sp
    join public.sessions s on s.id = sp.session_id
   where sp.accepted and s.state in ('completed', 'archived')
   group by sp.member_id`;

describe("contract 4 — the sessions presented", () => {
  it("a colleague counts the delivered sessions only — the published one listed, the draft invisible", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const presenter = f.a.members[0];
      await tx.as(f.a.members[1].claims);

      // getSessionsPresented()'s first read: the presenter's rows, org-wide.
      const rows = await tx.q<{ session_id: string }>(
        `select session_id from public.session_presenters where member_id = $1 and accepted order by session_id`,
        [presenter.memberId],
      );
      expect(rows.map((r) => r.session_id).sort()).toEqual([f.m2.a.published, f.m2.a.completed, f.m2.a.draft].sort());

      // The listed states, through sessions_read: the draft is gone for a colleague.
      const listed = await tx.q<{ id: string; state: string }>(
        `select id, state::text as state from public.sessions where id = any($1::uuid[]) and state in ('published', 'in_progress', 'completed', 'archived')`,
        [rows.map((r) => r.session_id)],
      );
      expect(listed.sort((a, b) => a.state.localeCompare(b.state))).toEqual([
        { id: f.m2.a.completed, state: "completed" },
        { id: f.m2.a.published, state: "published" },
      ]);

      // The count is the delivered ones — one, not two and not three.
      const [{ n }] = await tx.q<{ n: number }>(
        `select count(*)::int as n from public.sessions where id = any($1::uuid[]) and state in ('completed', 'archived')`,
        [rows.map((r) => r.session_id)],
      );
      expect(n).toBe(1);

      // The batch agrees with the single count.
      const batch = await tx.q<{ member_id: string; n: number }>(DELIVERED_BY_MEMBER);
      expect(batch.find((r) => r.member_id === presenter.memberId)?.n).toBe(1);
    });
  });

  it("a session moving from published to completed starts to count", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`update public.sessions set state = 'archived' where id = $1`, [f.m2.a.completed]);
      await tx.as(f.a.members[1].claims);
      const batch = await tx.q<{ member_id: string; n: number }>(DELIVERED_BY_MEMBER);
      expect(batch.find((r) => r.member_id === f.a.members[0].memberId)?.n).toBe(1);
    });
  });

  it("the row's attendance is a number from the definer function, never a check-in row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // The attendee reads the figure, and still no one else's check-in row.
      const reader = f.a.members[1];
      await tx.as(reader.claims);
      expect(await tx.q(`select public.session_attendance_count($1) as n`, [f.m2.a.completed])).toEqual([{ n: 1 }]);
      expect(await tx.q(`select 1 from public.check_ins where session_id = $1 and member_id <> $2`, [f.m2.a.completed, reader.memberId])).toEqual([]);
    });
  });

  it("another org's presenters are not counted, and not seen", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[1].claims);
      expect(await tx.q(`select 1 from public.session_presenters where member_id = $1`, [f.b.members[0].memberId])).toEqual([]);
      const batch = await tx.q<{ member_id: string }>(DELIVERED_BY_MEMBER);
      expect(batch.map((r) => r.member_id)).not.toContain(f.b.members[0].memberId);
    });
  });
});

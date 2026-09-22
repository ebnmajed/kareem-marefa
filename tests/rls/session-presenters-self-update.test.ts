// A presenter's own acceptance stops moving once the session is over —
// DEC-174 (wave 12, scoring's question 4), REQ-SES-019, REQ-PTS-015.
//
// `session_presenters_update_self` (0010) let a presenter set their own
// `accepted` / `declined_at` at any time. Once presenter awards follow the
// presenter after completion, every toggle on a completed session would write
// an award and a reversal. 0146 keeps the self-update while the session is
// still ahead and refuses it — silently, as RLS does — once the session is
// completed, archived or cancelled. An admin's change goes through
// `sessions`' RPCs, unaffected.
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("POL-session_presenters.update_self.not_after_completion", () => {
  it("★ a presenter of a completed session cannot change their own acceptance", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      const rows = await tx.q(`update public.session_presenters set accepted = false where session_id = $1 and member_id = $2 returning 1`, [f.m2.a.completed, f.a.members[0].memberId]);
      expect(rows).toHaveLength(0);
    });
  });

  it("a presenter of a session still ahead can, as before", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.members[0].claims);
      const rows = await tx.q(`update public.session_presenters set accepted = true where session_id = $1 and member_id = $2 returning 1`, [f.m2.a.published, f.a.members[0].memberId]);
      expect(rows).toHaveLength(1);
    });
  });

  it("a cancelled session is over too", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await tx.q(`update public.sessions set state = 'cancelled', cancelled_at = now(), cancellation_reason = 'اختبار' where id = $1`, [f.m2.a.published]).catch(async () => {
        await tx.q(`update public.sessions set state = 'cancelled' where id = $1`, [f.m2.a.published]);
      });
      await tx.as(f.a.members[0].claims);
      const rows = await tx.q(`update public.session_presenters set declined_at = now(), accepted = false where session_id = $1 and member_id = $2 returning 1`, [f.m2.a.published, f.a.members[0].memberId]);
      expect(rows).toHaveLength(0);
    });
  });
});

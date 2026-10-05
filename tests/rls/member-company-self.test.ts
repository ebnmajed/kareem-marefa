// Wave 27 — the member never sets their company (REQ-PRF-012, DEC-254 §2.5, DEC-255 §6; STORY-PRF-007).
//
// The profile's save names `display_name`, `job_title` and `bio` and never `company_id` (`updateMyProfile()`, proved
// in `tests/unit/members-profile-company.test.ts`). This proves the database half on BOTH sides of the lead's revoke
// of `company_id` from the member's column grant (0004:310), which is pushed after PR B is on `main`: the revoke is
// applied here inside the transaction, as the owner, exactly as it will be written, and rolled back with it.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

/** The statement PostgREST issues for the profile's payload. */
const profileSave = (tx: Tx, id: string) =>
  tx.q<{ display_name: string }>(`update public.members set display_name = 'ريم', job_title = 'مهندسة', bio = null where id = $1 returning display_name`, [id]);

describe("the profile saves on both sides of the revoke", () => {
  it("before and after; a crafted company_id is refused after", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const me = f.a.members[0];
      await tx.as(me.claims);
      expect(await profileSave(tx, me.memberId)).toEqual([{ display_name: "ريم" }]);

      await tx.asOwner();
      await tx.q(`revoke update (company_id) on public.members from authenticated`);

      await tx.as(me.claims);
      expect(await profileSave(tx, me.memberId)).toEqual([{ display_name: "ريم" }]);
      expect(await errorCode(() => tx.q(`update public.members set company_id = null where id = $1`, [me.memberId]))).toBe("42501");
      expect(await errorCode(() => tx.q(`update public.members set display_name = 'x', company_id = $2 where id = $1`, [me.memberId, f.a.companyId]))).toBe("42501");
    });
  });
});

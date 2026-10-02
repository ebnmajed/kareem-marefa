// REQ-EVT-012, REQ-UIX-104 — «أعدها للعرض» on SCR-051 as ONE write (DEC-232 §4.5, notes/content.md F3).
// `restorePhoto()` unhid the photo and then resolved the takedown in a second, unchecked write. SCR-051 resolves the
// photo's open takedowns with `resolution = 'restored'` in one statement, and 0037's `photo_takedowns_guard()`
// unhides the photo inside it; 0051's trigger writes `photo.restored`. No new SQL — this file proves the existing
// schema does it, as a member.
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const RESTORE = `update public.photo_takedowns set resolved_at = now(), resolution = 'restored'
                  where photo_id = $1 and resolved_at is null returning id`;

async function twoTakedowns(tx: Tx, org: string, photo: string, a: string, b: string) {
  await tx.asOwner();
  for (const requester of [a, b]) {
    await tx.q(`insert into public.photo_takedowns (org_id, photo_id, requester_id) values ($1, $2, $3)`, [org, photo, requester]);
  }
  const [p] = await tx.q<{ hidden_at: string | null }>(`select hidden_at from public.photos where id = $1`, [photo]);
  expect(p.hidden_at).toBeTruthy(); // 0037's trigger hid it at the request
}

describe("SCR-051 · restoring a photo is one write", () => {
  it("a moderator's one update resolves both open takedowns, unhides the photo and writes ONE photo.restored", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const photo = f.m5.a.photoId;
      await twoTakedowns(tx, f.a.id, photo, f.a.members[0].memberId, f.a.admin.memberId);

      await tx.as(f.a.mod.claims);
      expect(await tx.q(RESTORE, [photo])).toHaveLength(2);

      await tx.asOwner();
      expect((await tx.q(`select hidden_at from public.photos where id = $1`, [photo]))[0]).toEqual({ hidden_at: null });
      const open = await tx.q(`select 1 from public.photo_takedowns where photo_id = $1 and resolved_at is null`, [photo]);
      expect(open).toHaveLength(0);
      const by = await tx.q<{ resolved_by: string }>(
        `select distinct resolved_by from public.photo_takedowns where photo_id = $1 and resolution = 'restored' and resolved_by = $2`,
        [photo, f.a.mod.memberId],
      );
      expect(by).toEqual([{ resolved_by: f.a.mod.memberId }]);
      // The fixture's own restore wrote one as the owner; this decision writes exactly one more, as the moderator.
      expect(
        await tx.q(`select 1 from public.audit_log where action = 'photo.restored' and subject_id = $1 and actor_id = $2`, [photo, f.a.mod.memberId]),
      ).toHaveLength(1);
    });
  });

  it("a member's same update matches no row, and the photo stays hidden", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const photo = f.m5.a.photoId;
      await twoTakedowns(tx, f.a.id, photo, f.a.members[0].memberId, f.a.admin.memberId);
      const restoredBefore = (await tx.q(`select 1 from public.audit_log where action = 'photo.restored' and subject_id = $1`, [photo])).length;

      await tx.as(f.a.members[0].claims);
      expect(await tx.q(RESTORE, [photo])).toHaveLength(0);

      await tx.asOwner();
      expect((await tx.q<{ hidden_at: string | null }>(`select hidden_at from public.photos where id = $1`, [photo]))[0].hidden_at).toBeTruthy();
      expect(await tx.q(`select 1 from public.audit_log where action = 'photo.restored' and subject_id = $1`, [photo])).toHaveLength(restoredBefore);
    });
  });
});

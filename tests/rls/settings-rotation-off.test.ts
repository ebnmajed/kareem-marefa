// Wave 27 — «لا يتغيّر» is saved through the settings' own function (0202, REQ-CHK-019, DEC-255 §3).
//
// `checkin` measured that `save_org_settings()` (0187) needs no change for a null rotation; this is that claim, proven:
// a JSON null is written as SQL null, the stale guard compares null with null, the history row records both
// directions, and a value outside 60–3600 is still refused by the column's check.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

type Answer = { ok: boolean; error?: string; fields?: string[]; wrote?: string[] };
const save = async (tx: Tx, changes: object, expected: object): Promise<Answer> =>
  (await tx.q<{ r: Answer }>(`select public.save_org_settings($1::jsonb, $2::jsonb, null, null, '{}'::text[], '{}'::uuid[]) as r`, [JSON.stringify(changes), JSON.stringify(expected)]))[0].r;
const rotation = async (tx: Tx, org: string) => {
  await tx.asOwner();
  return (await tx.q<{ s: number | null }>(`select check_in_rotation_seconds as s from public.org_settings where org_id = $1`, [org]))[0].s;
};

describe("REQ-CHK-019 — the rotation may be saved as off", () => {
  it("off, then on again: each written, each in the receipt, each guarded against a stale page", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const off = await save(tx, { check_in_rotation_seconds: null }, { check_in_rotation_seconds: 600 });
      expect(off).toMatchObject({ ok: true, wrote: ["check_in_rotation_seconds"] });
      expect(await rotation(tx, f.a.id)).toBeNull();

      // a page opened while it was still 600 is stale now
      await tx.as(f.a.admin.claims);
      expect(await save(tx, { check_in_rotation_seconds: 300 }, { check_in_rotation_seconds: 600 })).toMatchObject({ ok: false, error: "stale" });

      const on = await save(tx, { check_in_rotation_seconds: 300 }, { check_in_rotation_seconds: null });
      expect(on).toMatchObject({ ok: true, wrote: ["check_in_rotation_seconds"] });
      expect(await rotation(tx, f.a.id)).toBe(300);
    });
  });

  it("a period outside 60–3600 is still refused by the column", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      expect(await errorCode(() => tx.q(`update public.org_settings set check_in_rotation_seconds = 30 where org_id = $1`, [f.a.id]))).toBe("23514");
      expect(await errorCode(() => tx.q(`update public.org_settings set check_in_rotation_seconds = 0 where org_id = $1`, [f.a.id]))).toBe("23514");
    });
  });
});

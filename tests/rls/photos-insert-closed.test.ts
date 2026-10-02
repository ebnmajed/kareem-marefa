// 0174 (DEC-221, REQ-EVT-011): the direct insert door on photos is closed, and the one legitimate writer still writes.
//
// ★ The worker calls `record_photo_upload()` over its DATABASE_URL connection with graphile-worker's `helpers.query`
// (worker/src/tasks/process_photo.ts:95) — as the `postgres` role, NOT through PostgREST as service_role. So the
// proof is made as that role: `asOwner()` resets to the connection's own user, `postgres`, exactly the worker's.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("0174 — record_photo_upload() still inserts, as the worker's own role", () => {
  it("as postgres (the worker's DATABASE_URL role), after 0174, a stripped row is recorded", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      expect(await tx.q(`select current_user::text as u`)).toEqual([{ u: "postgres" }]);
      const id = randomUUID();
      const [row] = await tx.q<{ envelope: { status: string; photo: { id: string; exif_stripped: boolean } } }>(
        `select public.record_photo_upload($1, $2, $3, $4, 'w.jpg', 1000, $5, 10, 20) as envelope`,
        [id, f.a.id, f.m2.a.published, f.a.members[1].memberId, "9".repeat(64)],
      );
      expect(row.envelope.status).toBe("ok");
      expect(row.envelope.photo.id).toBe(id);
      expect(await tx.q(`select exif_stripped from public.photos where id = $1`, [id])).toEqual([{ exif_stripped: true }]);
    });
  });

  it("and as service_role through the RPC path, as before", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asServiceRole();
      const id = randomUUID();
      const [row] = await tx.q<{ envelope: { status: string } }>(
        `select public.record_photo_upload($1, $2, $3, $4, 'w.jpg', 1000, $5, 10, 20) as envelope`,
        [id, f.a.id, f.m2.a.published, f.a.members[1].memberId, "8".repeat(64)],
      );
      expect(row.envelope.status).toBe("ok");
    });
  });
});

describe("0174 — the door itself", () => {
  it("no client role holds insert on photos, and no insert policy exists", async () => {
    await withTx(async (tx) => {
      await seed(tx);
      await tx.asOwner();
      const grants = await tx.q<{ role: string; can: boolean }>(
        `select r as role, has_table_privilege(r, 'public.photos', 'INSERT') as can from unnest(array['anon','authenticated','service_role']) r order by r`,
      );
      expect(grants).toEqual([
        { role: "anon", can: false },
        { role: "authenticated", can: false },
        { role: "service_role", can: false },
      ]);
      expect(await tx.q(`select policyname from pg_policies where schemaname = 'public' and tablename = 'photos' and cmd in ('INSERT','ALL')`)).toEqual([]);
    });
  });
});

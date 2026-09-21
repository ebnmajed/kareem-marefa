// supabase/migrations/0126_public_org_logo.sql — an active org's logo, readable
// with no session, for a mail client (REQ-NTF-014, REQ-DSG-021, DEC-161
// contract 9). The lead's, as custodian of `branding`.
//
// 03 §8.2 rows proven here: POL-storage.design_assets.public_logo,
// RPC-org_public_logo.path_only.
//
// The point of every case below is what STAYS CLOSED. One object per org is
// opened — the one its brand kit names, while it is a PNG or a JPEG, while the
// org is active — and each refusal the migration's header promises is asserted
// as `anon`, the role a mail client is.
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import { seed } from "./fixture";
import type { Tx } from "./db";

afterAll(() => pool.end());

type Mime = "image/png" | "image/jpeg" | "image/webp";
const EXT: Record<Mime, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

/** A design asset and its stored object, as the upload route leaves them. */
async function asset(tx: Tx, orgId: string, mime: Mime): Promise<{ id: string; path: string }> {
  const id = randomUUID();
  const path = `${orgId}/design/assets/${id}.${EXT[mime]}`;
  await tx.q(
    `insert into public.design_assets (id, org_id, storage_path, sniffed_mime, width, height, byte_size)
     values ($1, $2, $3, $4, 512, 512, 2048)`,
    [id, orgId, path, mime],
  );
  await tx.q(`insert into storage.objects (bucket_id, name) values ('design-assets', $1) on conflict do nothing`, [path]);
  return { id, path };
}

/** The fixture seeds one kit per org (fixture-m7); name its logo. */
async function setLogo(tx: Tx, orgId: string, assetId: string | null) {
  const changed = await tx.q(`update public.brand_kits set logo_asset_id = $2 where org_id = $1 returning id`, [orgId, assetId]);
  expect(changed).toHaveLength(1);
}

const visible = (tx: Tx, path: string) =>
  tx.q<{ name: string }>(`select name from storage.objects where bucket_id = 'design-assets' and name = $1`, [path]);

const publicLogo = (tx: Tx, orgId: string) =>
  tx.q<{ storage_path: string; content_type: string }>(`select * from public.org_public_logo($1)`, [orgId]);

describe("POL-storage.design_assets.public_logo", () => {
  it("anon reads exactly the object an active org's brand kit names as its logo — and no other asset of that org", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const logo = await asset(tx, f.a.id, "image/png");
      const poster = await asset(tx, f.a.id, "image/png");
      await setLogo(tx, f.a.id, logo.id);

      await tx.asAnon();
      expect(await visible(tx, logo.path)).toEqual([{ name: logo.path }]);
      // A poster's image, a certificate's seal, an uploaded photograph: closed.
      expect(await visible(tx, poster.path)).toEqual([]);
      // Listing the bucket shows a stranger the one object and nothing else.
      const listed = await tx.q<{ name: string }>(`select name from storage.objects where bucket_id = 'design-assets'`);
      expect(listed.map((r) => r.name)).toEqual([logo.path]);
    });
  });

  it("a JPEG logo is open; a WebP logo is not — Outlook draws no WebP, and the design falls back to the org's name", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const jpeg = await asset(tx, f.a.id, "image/jpeg");
      const webp = await asset(tx, f.b.id, "image/webp");
      await setLogo(tx, f.a.id, jpeg.id);
      await setLogo(tx, f.b.id, webp.id);

      await tx.asAnon();
      expect(await visible(tx, jpeg.path)).toHaveLength(1);
      expect(await visible(tx, webp.path)).toEqual([]);
      expect(await publicLogo(tx, f.a.id)).toEqual([{ storage_path: jpeg.path, content_type: "image/jpeg" }]);
      expect(await publicLogo(tx, f.b.id)).toEqual([]);
    });
  });

  it("a replaced logo closes the old object at once, and a cleared one closes it entirely", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const first = await asset(tx, f.a.id, "image/png");
      const second = await asset(tx, f.a.id, "image/png");
      await setLogo(tx, f.a.id, first.id);

      await tx.asOwner();
      await setLogo(tx, f.a.id, second.id);
      await tx.asAnon();
      expect(await visible(tx, first.path)).toEqual([]);
      expect(await visible(tx, second.path)).toHaveLength(1);

      await tx.asOwner();
      await setLogo(tx, f.a.id, null);
      await tx.asAnon();
      expect(await visible(tx, second.path)).toEqual([]);
      expect(await publicLogo(tx, f.a.id)).toEqual([]);
    });
  });

  it("a suspended org's logo is refused", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const logo = await asset(tx, f.a.id, "image/png");
      await setLogo(tx, f.a.id, logo.id);
      await tx.q(`update public.orgs set status = 'suspended', suspended_at = now(), suspended_reason = 'اختبار' where id = $1`, [f.a.id]);

      await tx.asAnon();
      expect(await visible(tx, logo.path)).toEqual([]);
      expect(await publicLogo(tx, f.a.id)).toEqual([]);
    });
  });

  it("a signed-in member of ANOTHER org sees what a stranger sees — and still nothing else of that org", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const logo = await asset(tx, f.a.id, "image/png");
      const poster = await asset(tx, f.a.id, "image/png");
      await setLogo(tx, f.a.id, logo.id);

      await tx.as(f.b.members[0].claims);
      expect(await visible(tx, logo.path)).toHaveLength(1);
      expect(await visible(tx, poster.path)).toEqual([]);
    });
  });

  it("anon can write and delete nothing in the bucket", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const logo = await asset(tx, f.a.id, "image/png");
      await setLogo(tx, f.a.id, logo.id);

      await tx.asAnon();
      await expect(
        tx.q(`insert into storage.objects (bucket_id, name) values ('design-assets', $1)`, [`${f.a.id}/design/assets/${randomUUID()}.png`]),
      ).rejects.toThrow();
      // A delete the policy does not admit removes no row; the object survives.
      await tx.q(`delete from storage.objects where bucket_id = 'design-assets' and name = $1`, [logo.path]).catch(() => undefined);
      await tx.asOwner();
      expect(await visible(tx, logo.path)).toHaveLength(1);
    });
  });
});

describe("RPC-org_public_logo.path_only", () => {
  it("answers anon, a member and the worker with the one path and its SNIFFED type — and nothing for an unknown org", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const logo = await asset(tx, f.a.id, "image/png");
      await setLogo(tx, f.a.id, logo.id);
      const expected = [{ storage_path: logo.path, content_type: "image/png" }];

      await tx.asAnon();
      expect(await publicLogo(tx, f.a.id)).toEqual(expected);
      expect(await publicLogo(tx, randomUUID())).toEqual([]);

      await tx.as(f.a.members[0].claims);
      expect(await publicLogo(tx, f.a.id)).toEqual(expected);

      await tx.asOwner();
      await tx.q(`set local role service_role`);
      expect(await publicLogo(tx, f.a.id)).toEqual(expected);
    });
  });
});

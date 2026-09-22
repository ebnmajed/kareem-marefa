// ★ Row L3 of wave 13 (DEC-178) — a member stops reading another member's
// certificate PDF through Storage. Found by `designer`'s probe at sync 1.
//
// `exports_storage_read` (0037) admits any member of the org to ANY object
// under the org prefix, and Storage's list runs as the caller — so a plain
// member could list every `cert_landscape.pdf` in the org and mint a signed URL
// for it. The tables never leaked (`documents_read`, 0055); Storage did. 0153
// adds one RESTRICTIVE select policy: a render of a certificate's document is
// readable only by staff or by that certificate's own member, and not while it
// is `held`. Nothing else in the bucket moves — a session poster stays readable
// by the org (DEC-173), and 0080's public card is `anon`'s door, untouched.
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

type F = Awaited<ReturnType<typeof seed>>;

/** Put an object in the bucket the way the worker does (service role). */
async function object(tx: Tx, name: string) {
  await tx.asOwner();
  await tx.q(`insert into storage.objects (bucket_id, name) values ('exports', $1)`, [name]);
}

const listed = (tx: Tx, name: string) =>
  tx
    .q<{ n: number }>(`select count(*)::int as n from storage.objects where bucket_id = 'exports' and name = $1`, [name])
    .then((r) => r[0].n);

async function certificateObject(tx: Tx, f: F, state: "issued" | "held" = "issued") {
  await tx.asOwner();
  const cert = f.m6.a.certificateId;
  if (state === "held") await tx.q(`update public.certificates set state = 'held', issued_at = null where id = $1`, [cert]);
  const [doc] = await tx.q<{ id: string }>(
    `insert into public.design_documents (org_id, purpose, document, bound_certificate_id, updated_by)
     values ($1, 'certificate', '{"schemaVersion":1,"layers":[]}'::jsonb, $2, null) returning id`,
    [f.a.id, cert],
  );
  const name = `${f.a.id}/exports/${doc.id}/cert_landscape.pdf`;
  await object(tx, name);
  return { name, owner: f.a.members[0] };
}

describe("POL-storage.objects.exports_certificate_restricted", () => {
  it("★ another member no longer lists (so cannot sign) a certificate PDF; its member, the admin and the moderator do", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await certificateObject(tx, f);
      await tx.as(f.a.members[1].claims);
      expect(await listed(tx, c.name)).toBe(0);
      for (const who of [c.owner.claims, f.a.admin.claims, f.a.mod.claims]) {
        await tx.as(who);
        expect(await listed(tx, c.name)).toBe(1);
      }
    });
  });

  it("its member while the certificate is HELD reads nothing (REQ-CRT-013); the admin still does", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await certificateObject(tx, f, "held");
      await tx.as(c.owner.claims);
      expect(await listed(tx, c.name)).toBe(0);
      await tx.as(f.a.admin.claims);
      expect(await listed(tx, c.name)).toBe(1);
    });
  });

  it("an orphaned certificate object — a document with no artifact row — is covered by its path, not by the table", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await certificateObject(tx, f);
      await tx.as(f.a.members[1].claims);
      expect(await listed(tx, c.name)).toBe(0);
    });
  });

  it("nothing else moves: a session poster's render stays readable by a plain member (DEC-173)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const name = `${f.a.id}/exports/${f.m6.a.documentId}/master.png`;
      await object(tx, name);
      await tx.as(f.a.members[1].claims);
      expect(await listed(tx, name)).toBe(1);
    });
  });

  it("another org's admin reads neither", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await certificateObject(tx, f);
      await tx.as(f.b.admin.claims);
      expect(await listed(tx, c.name)).toBe(0);
    });
  });
});

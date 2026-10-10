// platform (wave 29, PR B) — an admin takes a member's photo down from SCR-049 (DEC-280 §4, §8; REQ-PRF-019,
// REQ-ADM-010). The behaviour is `supabase/proposed/platform/0011_avatar_uploads.sql`.
//
// ★ Admin only, the actor's org only, audited; a library avatar cannot be taken down; the member reverts to the key
//   they hold — never initials — and no refresh restores a Google copy.

import { join } from "node:path";
import { existsSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, PERMISSION_DENIED, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FILE = "platform/0011_avatar_uploads.sql";
const SOURCE = "https://lh3.googleusercontent.com/a/ACg8ocTEST=s96-c";

async function ready(tx: Tx, opts: { answer?: "accepted" | null; version?: number | null; source?: "google" | "upload" | null } = {}) {
  const f = await seed(tx);
  // ★ Promoted as 0223 (DEC-281): applied only while the proposed copy still exists.
  if (existsSync(join(process.cwd(), "supabase", "proposed", FILE))) await applyProposed(tx, FILE);
  await tx.asOwner();
  const who = f.a.members[1];
  await tx.q(
    `update public.members set avatar_url = $2, avatar_import = $3, avatar_version = $4, avatar_source = $5, avatar_key = 'characters/director' where id = $1`,
    [who.memberId, SOURCE, opts.answer ?? null, opts.version ?? null, opts.source ?? null],
  );
  await tx.q(`delete from graphile_worker._private_jobs where key = $1`, [`avatar:${who.memberId}`]);
  return { f, who };
}

const takeDown = async (tx: Tx, member: string) =>
  (await tx.q<{ out: { status: string } }>(`select public.take_down_avatar($1) as out`, [member]))[0].out;

const row = (tx: Tx, id: string) =>
  tx
    .q<{ avatar_version: string | null; avatar_source: string | null; avatar_import: string | null; avatar_key: string | null }>(
      `select avatar_version, avatar_source, avatar_import, avatar_key from public.members where id = $1`,
      [id],
    )
    .then((r) => r[0]);

describe("RPC-take_down_avatar", () => {
  it("★ reverts_to_key and audited — the photo goes, the library avatar shows, the log says who, when and what", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { answer: "accepted", version: 1790000000000, source: "google" });
      await tx.asOwner();
      const name = `${f.a.id}/members/${who.memberId}/1790000000000/96.webp`;
      await tx.q(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [name]);

      await tx.as(f.a.admin.claims);
      expect(await takeDown(tx, who.memberId)).toEqual({ status: "ok" });

      await tx.asOwner();
      expect(await row(tx, who.memberId)).toEqual({ avatar_version: null, avatar_source: null, avatar_import: "declined", avatar_key: "characters/director" });
      expect((await tx.q(`select 1 from graphile_worker._private_jobs where key = $1`, [`avatar:${who.memberId}`])).length).toBe(1);
      const audit = await tx.q<{ actor_id: string; actor_role: string; before: Record<string, unknown>; after: Record<string, unknown> }>(
        `select actor_id, actor_role, before, after from public.audit_log where org_id = $1 and action = 'member.avatar_taken_down' and subject_id = $2`,
        [f.a.id, who.memberId],
      );
      expect(audit).toHaveLength(1);
      expect(audit[0]).toMatchObject({
        actor_id: f.a.admin.memberId,
        actor_role: "admin",
        before: { source: "google", version: 1790000000000, answer: "accepted" },
        after: { source: null, answer: "declined" },
      });

      await tx.as(f.a.members[0].claims);
      expect(await tx.q(`select 1 from storage.objects where bucket_id = 'avatars' and name = $1`, [name])).toHaveLength(0);

      // No refresh restores it.
      await tx.asOwner();
      await tx.q(`delete from graphile_worker._private_jobs where key = $1`, [`avatar:${who.memberId}`]);
      await tx.q(`update public.members set avatar_url = 'https://lh3.googleusercontent.com/a/NEW' where id = $1`, [who.memberId]);
      expect((await tx.q(`select 1 from graphile_worker._private_jobs where key = $1`, [`avatar:${who.memberId}`])).length).toBe(0);
    });
  });

  it("an uploaded photo is taken down the same way", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { version: 1790000000500, source: "upload" });
      await tx.as(f.a.admin.claims);
      expect(await takeDown(tx, who.memberId)).toEqual({ status: "ok" });
      await tx.asOwner();
      expect(await row(tx, who.memberId)).toMatchObject({ avatar_version: null, avatar_source: null, avatar_key: "characters/director" });
    });
  });

  it("★ library_refused — a library avatar cannot be taken down; nothing is written or audited", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx);
      await tx.as(f.a.admin.claims);
      expect(await takeDown(tx, who.memberId)).toEqual({ status: "no_photo" });
      await tx.asOwner();
      expect(await tx.q(`select 1 from public.audit_log where action = 'member.avatar_taken_down' and subject_id = $1`, [who.memberId])).toHaveLength(0);
      expect((await row(tx, who.memberId)).avatar_key).toBe("characters/director");
    });
  });

  it("★ admin_only — a member and a moderator are refused; another org's admin finds nobody", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { version: 1790000000500, source: "upload" });
      for (const claims of [f.a.members[0].claims, f.a.mod.claims, who.claims]) {
        await tx.as(claims);
        expect(await errorCode(() => tx.q(`select public.take_down_avatar($1)`, [who.memberId]))).toBe(PERMISSION_DENIED);
      }
      await tx.asAnon();
      expect(await errorCode(() => tx.q(`select public.take_down_avatar($1)`, [who.memberId]))).toBe(PERMISSION_DENIED);

      await tx.as(f.b.admin.claims);
      expect(await takeDown(tx, who.memberId)).toEqual({ status: "not_found" });
      await tx.asOwner();
      expect((await row(tx, who.memberId)).avatar_version).toBe("1790000000500");
    });
  });

  it("no report row and no report_target value — a picture joins no queue", async () => {
    await withTx(async (tx) => {
      const { f, who } = await ready(tx, { version: 1790000000500, source: "upload" });
      await tx.asOwner();
      const [{ before }] = await tx.q<{ before: number }>(`select count(*)::int as before from public.reports where org_id = $1`, [f.a.id]);
      await tx.as(f.a.admin.claims);
      await takeDown(tx, who.memberId);
      await tx.asOwner();
      const [{ after }] = await tx.q<{ after: number }>(`select count(*)::int as after from public.reports where org_id = $1`, [f.a.id]);
      expect(after).toBe(before);
    });
  });
});

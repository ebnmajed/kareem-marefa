// Wave 14 — the schema under our stored copy of a member's Google photo
// (REQ-PRF-008's import half, DEC-099, DEC-180, DEC-182). 0157.
//
// Only the CURRENT version of a member's copy is readable, and only inside the
// org; clearing the version cuts access in the same statement. The member's
// answer to the prompt is in no client grant. The realtime payload carries a
// version, never a URL.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

type F = Awaited<ReturnType<typeof seed>>;

const listed = (tx: Tx, name: string) =>
  tx.q<{ n: number }>(`select count(*)::int as n from storage.objects where bucket_id = 'avatars' and name = $1`, [name]).then((r) => r[0].n);

async function copy(tx: Tx, f: F, version: number) {
  await tx.asOwner();
  const m = f.a.members[0];
  await tx.q(`update public.members set avatar_import = 'accepted', avatar_version = $1 where id = $2`, [version, m.memberId]);
  const name = (v: number) => `${f.a.id}/members/${m.memberId}/${v}/192.webp`;
  await tx.q(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [name(version)]);
  return { member: m, name };
}

describe("POL-avatars_storage_read", () => {
  it("a member of the org reads the current version; another org's member does not", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await copy(tx, f, 1_790_000_000_000);
      for (const who of [f.a.members[1], f.a.admin, c.member]) {
        await tx.as(who.claims);
        expect(await listed(tx, c.name(1_790_000_000_000))).toBe(1);
      }
      await tx.as(f.b.members[0].claims);
      expect(await listed(tx, c.name(1_790_000_000_000))).toBe(0);
    });
  });

  it("★ an older version is unreadable, and clearing the version (a decline, anonymisation) cuts access at once", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await copy(tx, f, 1_790_000_000_000);
      await tx.asOwner();
      await tx.q(`insert into storage.objects (bucket_id, name) values ('avatars', $1)`, [c.name(1_790_000_000_001)]);
      await tx.q(`update public.members set avatar_version = 1790000000001 where id = $1`, [c.member.memberId]);
      await tx.as(f.a.members[1].claims);
      expect(await listed(tx, c.name(1_790_000_000_000))).toBe(0);
      expect(await listed(tx, c.name(1_790_000_000_001))).toBe(1);

      await tx.asOwner();
      await tx.q(`update public.members set avatar_import = 'declined', avatar_version = null where id = $1`, [c.member.memberId]);
      await tx.as(f.a.members[1].claims);
      expect(await listed(tx, c.name(1_790_000_000_001))).toBe(0);
    });
  });
});

describe("COL-members.avatar_*", () => {
  it("avatar_version is readable through the grant, the view and me(); avatar_import is in no client grant", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await copy(tx, f, 1_790_000_000_000);
      await tx.as(f.a.members[1].claims);
      const [row] = await tx.q<{ avatar_version: string }>(`select avatar_version from public.members where id = $1`, [c.member.memberId]);
      expect(Number(row.avatar_version)).toBe(1_790_000_000_000);
      const [v] = await tx.q<{ avatar_version: string }>(`select avatar_version from public.members_member_view where id = $1`, [c.member.memberId]);
      expect(Number(v.avatar_version)).toBe(1_790_000_000_000);
      expect(await errorCode(() => tx.q(`select avatar_import from public.members where id = $1`, [c.member.memberId]))).toBe("42501");

      await tx.as(c.member.claims);
      const [{ me }] = await tx.q<{ me: Record<string, unknown> }>(`select public.me() as me`);
      expect(Number(me.avatar_version)).toBe(1_790_000_000_000);
    });
  });
});

describe("TRG-comments_broadcast.avatar_version", () => {
  it("the realtime payload carries the author's version and still no URL", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const c = await copy(tx, f, 1_790_000_000_000);
      await tx.q(`update public.members set avatar_url = 'https://lh3.googleusercontent.com/a/x' where id = $1`, [c.member.memberId]);
      await tx.as(c.member.claims);
      const [cm] = await tx.q<{ id: string }>(
        `insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'نسخة') returning id`,
        [f.a.id, f.m2.a.published, c.member.memberId],
      );
      await tx.asOwner();
      const rows = (
        await tx.q<{ payload: Record<string, unknown> }>(`select payload from realtime.messages where topic = $1`, [`session:${f.m2.a.published}`])
      ).filter((r) => r.payload.id === cm.id);
      expect(rows).toHaveLength(1);
      expect(Number(rows[0].payload.authorAvatarVersion)).toBe(1_790_000_000_000);
      expect(rows[0].payload.authorAvatarUrl ?? null).toBeNull();
      expect(JSON.stringify(rows[0].payload)).not.toContain("googleusercontent");
    });
  });
});

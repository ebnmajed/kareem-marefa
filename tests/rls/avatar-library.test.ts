// Wave 29, PR A — every member holds a library avatar (DEC-280 §1, §9; REQ-PRF-014, REQ-PRF-015). 0221.
//
// The key is assigned by one `before insert` trigger, so every writer of `members` is covered; the database refuses a
// key outside the library; anonymisation clears it; `avatar_source` follows `avatar_version`; the live comment carries
// the key and still no URL. The 03 §8.2 rows are in 0221's header.
import { afterAll, describe, expect, it } from "vitest";
import { AVATAR_KEYS } from "@/lib/avatar-library";
import { errorCode, pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const LIBRARY: ReadonlySet<string> = new Set(AVATAR_KEYS);

const avatarOf = (tx: Tx, id: string) =>
  tx
    .q<{ avatar_key: string | null; avatar_source: string | null }>(`select avatar_key, avatar_source from public.members where id = $1`, [id])
    .then((r) => r[0]);

describe("TRG-members_avatar.assigned_on_insert", () => {
  it("★ every seeded member — inserted directly, as the fixture does — holds a library key", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const rows = await tx.q<{ avatar_key: string | null }>(`select avatar_key from public.members where org_id = any ($1)`, [[f.a.id, f.b.id]]);
      expect(rows.length).toBeGreaterThan(3);
      for (const r of rows) expect(LIBRARY.has(r.avatar_key ?? "")).toBe(true);
    });
  });

  it("a member an admin adds holds a key at once (add_member)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await tx.q<{ id: string }>(
        `select (public.add_member('newcomer@gmail.com', null, null, null, 'member'::public.org_role)).id as id`,
      );
      await tx.asOwner();
      expect(LIBRARY.has((await avatarOf(tx, id)).avatar_key ?? "")).toBe(true);
    });
  });

  it("the draw is spread across both sets, not one key", async () => {
    await withTx(async (tx) => {
      await tx.asOwner();
      const [{ keys }] = await tx.q<{ keys: string[] }>(
        `select array_agg(public.random_avatar_key()) as keys from generate_series(1, 400)`,
      );
      expect(keys.every((k) => LIBRARY.has(k))).toBe(true);
      expect(new Set(keys).size).toBeGreaterThan(30);
      expect(keys.some((k) => k.startsWith("characters/"))).toBe(true);
      expect(keys.some((k) => k.startsWith("objects/"))).toBe(true);
    });
  });

  it("the key is stable across a rename and a company change", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const m = f.a.members[0];
      const before = (await avatarOf(tx, m.memberId)).avatar_key;
      await tx.q(`update public.members set display_name = 'اسم جديد', company_id = null where id = $1`, [m.memberId]);
      expect((await avatarOf(tx, m.memberId)).avatar_key).toBe(before);
    });
  });
});

describe("CHK-members.avatar_key.library", () => {
  it("a key outside the library is refused by the database", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      for (const key of ["characters/nobody", "../x", "objects/reel.svg"]) {
        expect(
          await errorCode(() => tx.q(`update public.members set avatar_key = $1 where id = $2`, [key, f.a.members[0].memberId])),
        ).toBe("23514");
      }
    });
  });
});

describe("COL-members.avatar_key", () => {
  it("readable by the org through the grant, the view and me()", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const m = f.a.members[0];
      const key = (await avatarOf(tx, m.memberId)).avatar_key;
      await tx.as(f.a.members[1].claims);
      const [row] = await tx.q<{ avatar_key: string }>(`select avatar_key from public.members where id = $1`, [m.memberId]);
      expect(row.avatar_key).toBe(key);
      const [v] = await tx.q<{ avatar_key: string }>(`select avatar_key from public.members_member_view where id = $1`, [m.memberId]);
      expect(v.avatar_key).toBe(key);
      await tx.as(m.claims);
      const [{ me }] = await tx.q<{ me: Record<string, unknown> }>(`select public.me() as me`);
      expect(me.avatar_key).toBe(key);
    });
  });

  it("★ no_update — a member cannot write their own key; only PR B's functions will", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const m = f.a.members[0];
      await tx.as(m.claims);
      expect(await errorCode(() => tx.q(`update public.members set avatar_key = 'objects/reel' where id = $1`, [m.memberId]))).toBe("42501");
      expect(await errorCode(() => tx.q(`update public.members set avatar_source = 'upload' where id = $1`, [m.memberId]))).toBe("42501");
    });
  });
});

describe("TRG-members_avatar.source_follows_version", () => {
  it("a recorded copy is `google`; a cleared copy has no source; the key stays", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const m = f.a.members[0];
      const key = (await avatarOf(tx, m.memberId)).avatar_key;
      expect((await avatarOf(tx, m.memberId)).avatar_source).toBeNull();
      await tx.q(`update public.members set avatar_import = 'accepted', avatar_version = 1790000000000 where id = $1`, [m.memberId]);
      expect(await avatarOf(tx, m.memberId)).toEqual({ avatar_key: key, avatar_source: "google" });
      await tx.q(`update public.members set avatar_import = 'declined', avatar_version = null where id = $1`, [m.memberId]);
      expect(await avatarOf(tx, m.memberId)).toEqual({ avatar_key: key, avatar_source: null });
    });
  });
});

describe("TRG-members_avatar.anonymised_clears (REQ-PRF-011)", () => {
  it("★ anonymisation nulls the key and the source — a former member is initials", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const m = f.a.members[0];
      await tx.q(`update public.members set avatar_import = 'accepted', avatar_version = 1790000000000 where id = $1`, [m.memberId]);
      await tx.q(
        `update public.members set status = 'deactivated', deactivated_at = now() - interval '400 days', deactivated_reason = 'test' where id = $1`,
        [m.memberId],
      );
      await tx.asServiceRole();
      await tx.q(`select public.anonymise_members()`);
      await tx.asOwner();
      expect(await avatarOf(tx, m.memberId)).toEqual({ avatar_key: null, avatar_source: null });
    });
  });
});

describe("TRG-comments_broadcast.avatar_key", () => {
  it("the live payload carries the author's key and still no URL", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const m = f.a.members[0];
      const key = (await avatarOf(tx, m.memberId)).avatar_key;
      await tx.as(m.claims);
      const [cm] = await tx.q<{ id: string }>(
        `insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'مفتاح') returning id`,
        [f.a.id, f.m2.a.published, m.memberId],
      );
      await tx.asOwner();
      const rows = (
        await tx.q<{ payload: Record<string, unknown> }>(`select payload from realtime.messages where topic = $1`, [`session:${f.m2.a.published}`])
      ).filter((r) => r.payload.id === cm.id);
      expect(rows).toHaveLength(1);
      expect(rows[0].payload.authorAvatarKey).toBe(key);
      expect(rows[0].payload.authorAvatarUrl ?? null).toBeNull();
    });
  });
});

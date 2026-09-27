// DEC-099, DEC-180 — no browser is handed a Google image URL through the discussion.
//
// `DEC-099` (2026-09-15) retired the Google hotlink: a viewer's browser fetching
// `lh3.googleusercontent.com` discloses its IP and `Referer` to Google on every
// render. It said `0089` would remove the CSP entry; `0089` was a different
// migration and the removal never happened, and `comment-item.tsx` later drew
// `members.avatar_url` — the Google source — for every comment, from two carriers:
// the DAL's first paint (`comments.ts`) and this realtime payload (`0016:122`).
// `0155` re-creates `comments_broadcast()` so the payload carries no URL.
//
// The author is given the Google `avatar_url` a real sign-in writes, so this is
// red on `0154` and green on `0155`.
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("TRG-comments_broadcast.no_hotlink", () => {
  it("a comment's realtime payload carries no image URL, though its author has a Google avatar_url", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const author = f.a.members[1];
      const topic = `session:${f.m2.a.published}`;

      // What `provision_member()` (0005:124) writes on every Google sign-in.
      await tx.q(`update public.members set avatar_url = 'https://lh3.googleusercontent.com/a/hotlink' where id = $1`, [author.memberId]);

      await tx.as(author.claims);
      const [c] = await tx.q<{ id: string }>(
        `insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'بلا رابط') returning id`,
        [f.a.id, f.m2.a.published, author.memberId],
      );
      await tx.q(`update public.comments set body = 'بلا رابط، معدّل' where id = $1`, [c.id]);

      await tx.asOwner();
      const rows = await tx.q<{ event: string; payload: Record<string, unknown> }>(
        `select event, payload from realtime.messages where topic = $1 order by inserted_at`,
        [topic],
      ).then((all) => all.filter((r) => r.payload.id === c.id));
      expect(rows.map((r) => r.event).sort()).toEqual(["INSERT", "UPDATE"]);
      for (const r of rows) {
        expect(JSON.stringify(r.payload)).not.toContain("googleusercontent");
        expect(r.payload.authorAvatarUrl ?? null).toBeNull();
        // Still renderable without a follow-up query.
        expect(typeof r.payload.authorDisplayName).toBe("string");
      }
    });
  });
});

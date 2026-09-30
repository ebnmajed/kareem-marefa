// DEC-209 — a live comment carries its author's company and whether they present, so the rebuilt discussion
// draws «name · company» and «· المُقدِّمة» on a comment that arrives by realtime, not only after a reload
// (REQ-EVT-015). Proven with the proposed function applied inside the transaction, as a MEMBER writing — the
// trigger is `security definer`, and a member is who fires it.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FILE = "content/comments_broadcast_author_context.sql";

async function payloads(tx: Parameters<Parameters<typeof withTx>[0]>[0], topic: string, id: string) {
  await tx.asOwner();
  return tx
    .q<{ event: string; payload: Record<string, unknown> }>(`select event, payload from realtime.messages where topic = $1 order by inserted_at`, [topic])
    .then((all) => all.filter((r) => r.payload.id === id));
}

describe("TRG-comments_broadcast.author_context", () => {
  it("a presenter's comment carries their company, its colour and authorIsPresenter = true", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      const author = f.a.members[1];
      const session = f.m2.a.published;
      await tx.q(`update public.companies set team_color = '#35d0ff' where id = $1`, [f.a.companyId]);
      await tx.q(
        `insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)
         on conflict (session_id, member_id) do update set accepted = true`,
        [f.a.id, session, author.memberId],
      );

      await tx.as(author.claims);
      const [c] = await tx.q<{ id: string }>(`insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'من المقدّمة') returning id`, [f.a.id, session, author.memberId]);

      const [row] = await payloads(tx, `session:${session}`, c.id);
      expect(row.payload.authorCompanyName).toBe(`شركة ${f.a.name}`);
      expect(row.payload.authorTeamColor).toBe("#35d0ff");
      expect(row.payload.authorIsPresenter).toBe(true);
      expect(row.payload.authorAvatarUrl ?? null).toBeNull();
    });
  });

  it("a member who does not present, and whose company has no colour: false and null — and every old key is still there", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      const author = f.a.members[0];
      const session = f.m2.a.published;
      await tx.q(`delete from public.session_presenters where session_id = $1 and member_id = $2`, [session, author.memberId]);

      await tx.as(author.claims);
      const [c] = await tx.q<{ id: string }>(`insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'سؤال') returning id`, [f.a.id, session, author.memberId]);

      const [row] = await payloads(tx, `session:${session}`, c.id);
      expect(row.payload.authorIsPresenter).toBe(false);
      expect(row.payload.authorTeamColor ?? null).toBeNull();
      for (const key of ["id", "sessionId", "parentId", "authorId", "authorDisplayName", "authorAvatarUrl", "authorAvatarVersion", "body", "mentions", "createdAt", "editedAt", "deletedAt"]) {
        expect(row.payload, key).toHaveProperty(key);
      }
    });
  });

  it("an invited presenter who has not accepted is not marked as presenting", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      const author = f.a.members[1];
      const session = f.m2.a.published;
      await tx.q(
        `insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, false)
         on conflict (session_id, member_id) do update set accepted = false`,
        [f.a.id, session, author.memberId],
      );
      await tx.as(author.claims);
      const [c] = await tx.q<{ id: string }>(`insert into public.comments (org_id, session_id, author_id, body) values ($1, $2, $3, 'مدعوّة') returning id`, [f.a.id, session, author.memberId]);
      const [row] = await payloads(tx, `session:${session}`, c.id);
      expect(row.payload.authorIsPresenter).toBe(false);
    });
  });
});

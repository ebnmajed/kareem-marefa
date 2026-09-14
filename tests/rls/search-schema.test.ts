// tags / session_tags / ar_normalize / sessions.search_vector — 02 §4.2,
// §4.15, REQ-DSC-001…005. Applied with applyProposed() inside each test's
// rolled-back transaction (DEC-040). tags/session_tags did not exist before
// this file — docs/plan/notes/content.md §0.1.
import { afterAll, describe, expect, it } from "vitest";
import { errorCode, PERMISSION_DENIED, pool, withTx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

describe("POL-tags.insert.admin", () => {
  it("a member's insert is rejected; an admin's succeeds", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.

      await tx.as(f.a.members[0].claims);
      expect(
        await errorCode(() => tx.q(`insert into public.tags (org_id, label, normalised) values ($1, 'الذكاء الاصطناعي', 'الذكاء الاصطناعي')`, [f.a.id])),
      ).toBe(PERMISSION_DENIED);

      await tx.as(f.a.admin.claims);
      const [tag] = await tx.q<{ id: string }>(
        `insert into public.tags (org_id, label, normalised) values ($1, 'الذكاء الاصطناعي', 'الذكاء الاصطناعي') returning id`,
        [f.a.id],
      );
      expect(tag.id).toBeTruthy();
    });
  });

  it("two tags normalising the same within one org are rejected; the same normalised label is fine across orgs (REQ-DSC-002)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.as(f.a.admin.claims);
      await tx.q(`insert into public.tags (org_id, label, normalised) values ($1, 'ادارة', 'ادارة')`, [f.a.id]);
      expect(await errorCode(() => tx.q(`insert into public.tags (org_id, label, normalised) values ($1, 'إدارة', 'ادارة')`, [f.a.id]))).toBe("23505");

      await tx.as(f.b.admin.claims);
      const [ok] = await tx.q<{ id: string }>(`insert into public.tags (org_id, label, normalised) values ($1, 'إدارة', 'ادارة') returning id`, [f.b.id]);
      expect(ok.id).toBeTruthy();
    });
  });
});

describe("POL-tags.delete.admin", () => {
  it("a moderator's delete leaves the tag untouched; an admin's removes it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.asOwner();
      const [tag] = await tx.q<{ id: string }>(`insert into public.tags (org_id, label, normalised) values ($1, 'قيادة', 'قيادة') returning id`, [f.a.id]);

      await tx.as(f.a.mod.claims);
      await tx.q(`delete from public.tags where id = $1`, [tag.id]);
      await tx.asOwner();
      expect((await tx.q(`select id from public.tags where id = $1`, [tag.id])).length).toBe(1);

      await tx.as(f.a.admin.claims);
      await tx.q(`delete from public.tags where id = $1`, [tag.id]);
      await tx.asOwner();
      expect(await tx.q(`select id from public.tags where id = $1`, [tag.id])).toEqual([]);
    });
  });
});

describe("POL-session_tags.write.presenter", () => {
  it("a non-presenter member cannot tag a session they do not present; the presenter and an admin can", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.asOwner();
      const [tag] = await tx.q<{ id: string }>(`insert into public.tags (org_id, label, normalised) values ($1, 'تجربة', 'تجربة') returning id`, [f.a.id]);

      await tx.as(f.a.members[1].claims);
      expect(
        await errorCode(() => tx.q(`insert into public.session_tags (org_id, session_id, tag_id) values ($1, $2, $3)`, [f.a.id, f.m2.a.published, tag.id])),
      ).toBe(PERMISSION_DENIED);

      await tx.as(f.a.members[0].claims);
      await tx.q(`insert into public.session_tags (org_id, session_id, tag_id) values ($1, $2, $3)`, [f.a.id, f.m2.a.published, tag.id]);

      await tx.as(f.a.members[1].claims); // P1 org-wide read
      expect((await tx.q(`select tag_id from public.session_tags where session_id = $1`, [f.m2.a.published])).length).toBe(1);

      await tx.as(f.a.members[0].claims);
      await tx.q(`delete from public.session_tags where session_id = $1 and tag_id = $2`, [f.m2.a.published, tag.id]);
      await tx.asOwner();
      expect(await tx.q(`select 1 from public.session_tags where session_id = $1 and tag_id = $2`, [f.m2.a.published, tag.id])).toEqual([]);
    });
  });
});

describe("POL-search.ar_normalize", () => {
  it("«معرفات» and «مُعرِّفات» normalise to the same string; «إدارة» and «ادارة» too (REQ-DSC-004)", async () => {
    await withTx(async (tx) => {
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.asOwner();
      const [{ v: a }] = await tx.q<{ v: string }>(`select public.ar_normalize('مُعرِّفات') as v`);
      const [{ v: b }] = await tx.q<{ v: string }>(`select public.ar_normalize('معرفات') as v`);
      expect(a).toBe(b);

      const [{ v: c }] = await tx.q<{ v: string }>(`select public.ar_normalize('إدارة') as v`);
      const [{ v: d }] = await tx.q<{ v: string }>(`select public.ar_normalize('ادارة') as v`);
      expect(c).toBe(d);
    });
  });

  it("a session's search_vector matches its normalised title (REQ-DSC-003)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // Promoted as migration 0037 at wave-2 sync 5: applied by `supabase db reset`.
      await tx.asOwner();
      const rows = await tx.q<{ n: number }>(
        `select count(*)::int as n from public.sessions
          where id = $1 and search_vector @@ plainto_tsquery('simple', public.ar_normalize('جلسة'))`,
        [f.m2.a.published],
      );
      expect(rows[0].n).toBe(1);
    });
  });
});

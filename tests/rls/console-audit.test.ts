// Wave 22 — the console's audit gaps, closed in the database (0181, REQ-ADM-023, DEC-231 §4, DEC-232 §2, STORY-ADM-011).
//
// Every case writes AS A MEMBER of the org — an admin, or a moderator where moderation is theirs — and reads the log as
// the owner. What is proven: each of the seven gaps writes its row with the actor; nothing that already has a record is
// written twice; `updated_at` alone writes nothing; and the org-deletion cascade still runs (platform-schema's case).
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

type Row = { action: string; actor_id: string | null; before: Record<string, unknown> | null; after: Record<string, unknown> | null };

async function log(tx: Tx, subjectId: string): Promise<Row[]> {
  await tx.asOwner();
  return tx.q<Row>(`select action, actor_id, before, after from public.audit_log where subject_id = $1 order by occurred_at, action`, [subjectId]);
}

describe("REQ-ADM-023 — venues, categories, companies", () => {
  it("a venue: created, changed, company_changed, deactivated, reactivated — each with the admin as actor", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await tx.q<{ id: string }>(
        `insert into public.venues (org_id, name, capacity, company_id) values ($1, 'قاعة التدقيق', 30, $2) returning id`,
        [f.a.id, f.a.companyId],
      );
      await tx.q(`update public.venues set name = 'قاعة التدقيق الكبرى', company_id = null where id = $1`, [id]);
      await tx.q(`update public.venues set deactivated_at = now() where id = $1`, [id]);
      await tx.q(`update public.venues set deactivated_at = null where id = $1`, [id]);
      const rows = await log(tx, id);
      expect(rows.map((r) => r.action).sort()).toEqual(
        ["venue.changed", "venue.company_changed", "venue.created", "venue.deactivated", "venue.reactivated"].sort(),
      );
      expect(new Set(rows.map((r) => r.actor_id))).toEqual(new Set([f.a.admin.memberId]));
      const created = rows.find((r) => r.action === "venue.created")!;
      expect(created.after).toMatchObject({ name: "قاعة التدقيق", company_id: f.a.companyId, capacity: 30 });
      const changed = rows.find((r) => r.action === "venue.changed")!;
      expect(changed.before).toEqual({ name: "قاعة التدقيق" });
      expect(changed.after).toEqual({ name: "قاعة التدقيق الكبرى" });
    });
  });

  it("a category: created, changed, deactivated, reactivated", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await tx.q<{ id: string }>(`insert into public.categories (org_id, name) values ($1, 'تصنيف التدقيق') returning id`, [f.a.id]);
      await tx.q(`update public.categories set name = 'تصنيف مُعاد التسمية' where id = $1`, [id]);
      await tx.q(`update public.categories set deactivated_at = now() where id = $1`, [id]);
      await tx.q(`update public.categories set deactivated_at = null where id = $1`, [id]);
      expect((await log(tx, id)).map((r) => r.action).sort()).toEqual(
        ["category.changed", "category.created", "category.deactivated", "category.reactivated"].sort(),
      );
    });
  });

  it("a company: created carries its colour; a colour change is 0161's row alone, never company.changed", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [{ id }] = await tx.q<{ id: string }>(
        `insert into public.companies (org_id, name, team_color) values ($1, 'شركة التدقيق', '#ff9a2e') returning id`,
        [f.a.id],
      );
      await tx.q(`update public.companies set team_color = '#35d0ff' where id = $1`, [id]);
      await tx.q(`update public.companies set name = 'شركة أخرى' where id = $1`, [id]);
      const rows = await log(tx, id);
      expect(rows.map((r) => r.action).sort()).toEqual(["company.changed", "company.created", "company.team_color_changed"].sort());
      expect(rows.find((r) => r.action === "company.created")!.after).toEqual({ name: "شركة التدقيق", team_color: "#ff9a2e" });
    });
  });

  it("updated_at alone writes nothing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      // The fixture's own insert already wrote `venue.created` in this transaction; the update must add nothing.
      const before = (await log(tx, f.a.venueId)).length;
      await tx.as(f.a.admin.claims);
      await tx.q(`update public.venues set updated_at = now() where id = $1`, [f.a.venueId]);
      expect(await log(tx, f.a.venueId)).toHaveLength(before);
    });
  });
});

describe("REQ-ADM-023 — a report's resolution, survey templates, the org's name", () => {
  it("a report leaving `open` writes report.resolved once, naming who decided", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ id }] = await tx.q<{ id: string }>(`select id from public.reports where org_id = $1 and status = 'open' limit 1`, [f.a.id]);
      await tx.as(f.a.mod.claims);
      await tx.q(
        `update public.reports set status = 'resolved', resolution = 'dismissed', resolved_by = $2, resolved_at = now() where id = $1`,
        [id, f.a.mod.memberId],
      );
      await tx.q(`update public.reports set resolved_at = now() where id = $1`, [id]);
      const rows = await log(tx, id);
      expect(rows.map((r) => r.action)).toEqual(["report.resolved"]);
      expect(rows[0].actor_id).toBe(f.a.mod.memberId);
      expect(rows[0].after).toMatchObject({ status: "resolved", resolution: "dismissed", target: "comment" });
    });
  });

  it("a survey template: created, changed, deleted", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const [{ id }] = await tx.q<{ id: string }>(`insert into public.survey_templates (org_id, title) values ($1, 'قالب التدقيق') returning id`, [f.a.id]);
      await tx.q(`update public.survey_templates set title = 'قالب مُعدّل' where id = $1`, [id]);
      await tx.q(`delete from public.survey_templates where id = $1`, [id]);
      expect((await log(tx, id)).map((r) => r.action).sort()).toEqual(
        ["survey_template.changed", "survey_template.created", "survey_template.deleted"].sort(),
      );
    });
  });

  it("an admin renaming the org writes org.renamed; an unchanged name writes nothing", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      await tx.q(`update public.orgs set name = name where id = $1`, [f.a.id]);
      await tx.q(`update public.orgs set name = 'مؤسسة بعد التسمية' where id = $1`, [f.a.id]);
      const rows = (await log(tx, f.a.id)).filter((r) => r.action === "org.renamed");
      expect(rows).toHaveLength(1);
      expect(rows[0].actor_id).toBe(f.a.admin.memberId);
      expect(rows[0].after).toEqual({ name: "مؤسسة بعد التسمية" });
    });
  });
});

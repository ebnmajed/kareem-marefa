// ★ Wave 22 — a survey template's three writes leave their records (REQ-UIX-106, REQ-ADM-023, DEC-231 §4, DEC-232 §2.5).
//
// Until `0181` a template's create, save and delete wrote nothing at all. The record is the lead's trigger on
// `survey_templates` alone — a save updates the template row and deletes and re-inserts its questions, so a trigger on
// the questions would write one row per question per save. Proven here AS A MEMBER — an admin and a moderator through
// the RPCs the screens call — never as the owner; read back as the owner, because no client role reads `audit_log` but
// through its own policy.
//
// Pinned: one `created`, one `changed` per save (the moderator its actor), one `deleted`, `after`/`before` the title;
// a REFUSED save writes nothing (`title_taken`, `invalid` — the function decides before it writes); a question-only save
// still writes `changed`; and ★ an org's deletion cascading through its templates still succeeds (0008's escape).
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const QUESTIONS = [{ kind: "free_text", prompt: "ما الذي نفعك؟", required: false }];

const save = (tx: Tx, template: string | null, title: string, questions: unknown = QUESTIONS) =>
  tx.q<{ out: { status: string; template_id?: string } }>(`select public.survey_template_save($1, $2, $3::jsonb) as out`, [
    template,
    title,
    JSON.stringify(questions),
  ]);

const remove = (tx: Tx, template: string) => tx.q(`select public.survey_template_delete($1)`, [template]);

async function records(tx: Tx, org: string, subject?: string) {
  return tx.q<{ action: string; actor_id: string | null; actor_role: string; before: { title?: string } | null; after: { title?: string } | null }>(
    `select action, actor_id, actor_role, before, after from public.audit_log
      where org_id = $1 and action like 'survey_template.%' ${subject ? "and subject_id = $2" : ""}
      order by action`,
    subject ? [org, subject] : [org],
  );
}

describe("survey_template.* — the database records every write", () => {
  it("★ a moderator's create, save and delete each write ONE row, the moderator its actor, the title its value", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.mod.claims);

      const [created] = await save(tx, null, "ورشة عملية");
      const id = created.out.template_id!;
      const [saved] = await save(tx, id, "ورشة عملية — مراجعة");
      expect(saved.out.status).toBe("ok");
      await remove(tx, id);

      await tx.asOwner();
      const rows = await records(tx, f.a.id, id);
      expect(rows.map((r) => r.action).sort()).toEqual(["survey_template.changed", "survey_template.created", "survey_template.deleted"]);
      expect(rows.every((r) => r.actor_id === f.a.mod.memberId && r.actor_role === "moderator")).toBe(true);

      const by = (action: string) => rows.find((r) => r.action === action)!;
      expect(by("survey_template.created").after).toEqual({ title: "ورشة عملية" });
      expect(by("survey_template.changed").after).toMatchObject({ title: "ورشة عملية — مراجعة" });
      expect(by("survey_template.deleted").before).toEqual({ title: "ورشة عملية — مراجعة" });
    });
  });

  it("an admin's write is recorded as the admin's", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.admin.claims);
      const [created] = await save(tx, null, "قالب المشرف");

      await tx.asOwner();
      const rows = await records(tx, f.a.id, created.out.template_id!);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ action: "survey_template.created", actor_id: f.a.admin.memberId, actor_role: "admin" });
    });
  });

  it("★ a save that changes only the questions is still `changed` — the save always touches the template row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.mod.claims);
      const [created] = await save(tx, null, "قالب الأسئلة");
      const id = created.out.template_id!;
      await save(tx, id, "قالب الأسئلة", [...QUESTIONS, { kind: "scale_1_5", prompt: "ما مدى وضوح المحتوى؟", required: true }]);

      await tx.asOwner();
      const rows = await records(tx, f.a.id, id);
      // ★ One row per save, never one per question (the trigger is on `survey_templates` alone). By action, never by
      // `occurred_at`: both rows carry the transaction's start.
      expect(rows.map((r) => r.action)).toEqual(["survey_template.changed", "survey_template.created"]);
    });
  });

  it("★ a REFUSED save writes nothing — the function decides before it writes", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.a.mod.claims);
      await save(tx, null, "قالب مكرر");
      await tx.asOwner();
      const before = (await records(tx, f.a.id)).length;

      await tx.as(f.a.mod.claims);
      expect((await save(tx, null, "قالب مكرر"))[0].out.status).toBe("title_taken");
      expect((await save(tx, null, "قالب آخر", []))[0].out.status).toBe("empty");
      expect((await save(tx, null, "قالب ثالث", [{ kind: "single_choice", prompt: "س", required: false, options: ["واحد"] }]))[0].out.status).toBe("invalid");

      await tx.asOwner();
      expect(await records(tx, f.a.id)).toHaveLength(before);
    });
  });

  it("★ an org's deletion cascades through its templates and still succeeds — the DELETE arm steps aside", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.as(f.b.mod.claims);
      await save(tx, null, "قالب مؤسسة ستُحذف");

      await tx.asOwner();
      await tx.q(`select public.perform_org_deletion($1)`, [f.b.id]);
      expect(await tx.q(`select 1 from public.orgs where id = $1`, [f.b.id])).toHaveLength(0);
      expect(await tx.q(`select 1 from public.survey_templates where org_id = $1`, [f.b.id])).toHaveLength(0);
    });
  });
});

// supabase/proposed/event/03_survey_authoring.sql — the reusable template and
// the copy attached to a session (E1's authoring half, REQ-SUR-001, REQ-SUR-002).
//
// 03 §8.2 rows proven here: RPC-survey_template_save.staff_only, .whole_set,
// .shapes, .title_taken, .other_org, RPC-survey_attach.copies,
// .one_per_session, .audited, RPC-survey_detach.has_responses, and the six
// authoring tables' POL-*.read_staff (0124, the lead's).
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, pool, PERMISSION_DENIED, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const FILE = "event/03_survey_authoring.sql";

const QUESTIONS = [
  { kind: "scale_1_5", prompt: "ما مدى وضوح المحتوى؟", required: true },
  { kind: "single_choice", prompt: "هل كانت المدة مناسبة؟", required: true, options: ["قصيرة", "مناسبة", "طويلة"] },
  { kind: "free_text", prompt: "ماذا تقترح للجلسة القادمة؟", required: false },
];

const save = (tx: Tx, template: string | null, title: string, questions: unknown = QUESTIONS) =>
  tx.q<{ out: { status: string; template_id?: string; question_count?: number; at?: number; field?: string } }>(
    `select public.survey_template_save($1, $2, $3::jsonb) as out`,
    [template, title, JSON.stringify(questions)],
  );

const attach = (tx: Tx, session: string, template: string) =>
  tx.q<{ out: { status: string; survey_id?: string } }>(`select public.survey_attach($1, $2) as out`, [session, template]);

const detach = (tx: Tx, session: string) =>
  tx.q<{ out: { status: string } }>(`select public.survey_detach($1) as out`, [session]);

/** The questions of a template or of an attached survey, in stored order. */
async function questionsOf(tx: Tx, table: "survey_template_questions" | "survey_questions", parent: "template_id" | "survey_id", id: string) {
  return tx.q<{ position: number; kind: string; prompt: string; required: boolean }>(
    `select position, kind::text as kind, prompt, required from public.${table} where ${parent} = $1 order by position`,
    [id],
  );
}

describe("RPC-survey_template_save", () => {
  it("staff only: a member is refused, an admin and a moderator succeed, a stale admin is refused, anon cannot execute it", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);

      await tx.as(f.a.members[0].claims);
      expect(await errorMessage(() => save(tx, null, "قالب"))).toMatch(/not_authorized/);

      await tx.as({ ...f.a.admin.claims, claims_version: 999 });
      expect(await errorMessage(() => save(tx, null, "قالب"))).toMatch(/stale_claims/);

      await tx.asAnon();
      expect(await errorCode(() => save(tx, null, "قالب"))).toBe(PERMISSION_DENIED);

      await tx.as(f.a.admin.claims);
      expect((await save(tx, null, "قالب المشرف"))[0].out.status).toBe("ok");
      await tx.as(f.a.mod.claims);
      expect((await save(tx, null, "قالب المنظم"))[0].out.status).toBe("ok");
    });
  });

  it("saves the whole set in the array's order, and a second save REPLACES it — positions are 1…n and never come from the client", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      await tx.as(f.a.mod.claims);

      const [first] = await save(tx, null, "قالب الجلسات");
      expect(first.out.status).toBe("ok");
      expect(first.out.question_count).toBe(3);
      const id = first.out.template_id!;

      const written = await questionsOf(tx, "survey_template_questions", "template_id", id);
      expect(written.map((q) => q.position)).toEqual([1, 2, 3]);
      expect(written.map((q) => q.prompt)).toEqual(QUESTIONS.map((q) => q.prompt));
      expect(written.map((q) => q.kind)).toEqual(["scale_1_5", "single_choice", "free_text"]);
      expect(written.map((q) => q.required)).toEqual([true, true, false]);

      const options = await tx.q<{ position: number; label: string }>(
        `select o.position, o.label from public.survey_template_options o
           join public.survey_template_questions q on q.id = o.question_id
          where q.template_id = $1 order by o.position`,
        [id],
      );
      expect(options.map((o) => o.label)).toEqual(["قصيرة", "مناسبة", "طويلة"]);

      // The reorder the editor hands back: the same questions, fewer, in a new
      // order. Nothing of the old set survives.
      const [again] = await save(tx, id, "قالب الجلسات", [QUESTIONS[2], QUESTIONS[0]]);
      expect(again.out).toMatchObject({ status: "ok", template_id: id, question_count: 2 });
      const second = await questionsOf(tx, "survey_template_questions", "template_id", id);
      expect(second.map((q) => [q.position, q.prompt])).toEqual([
        [1, QUESTIONS[2].prompt],
        [2, QUESTIONS[0].prompt],
      ]);
    });
  });

  it("refuses a bad question by name and by index, and writes nothing when it does", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      await tx.as(f.a.mod.claims);

      const [ok] = await save(tx, null, "قالب سليم");
      const id = ok.out.template_id!;

      const refusals: [unknown, number, string][] = [
        [[{ kind: "scale_1_7", prompt: "س" }], 1, "kind"],
        [[QUESTIONS[0], { kind: "free_text", prompt: "   " }], 2, "prompt"],
        [[{ kind: "single_choice", prompt: "س", options: ["واحد"] }], 1, "options"],
        [[{ kind: "free_text", prompt: "س", options: ["أ", "ب"] }], 1, "options"],
      ];
      for (const [questions, at, field] of refusals) {
        const [out] = await save(tx, id, "قالب سليم", questions);
        expect(out.out).toMatchObject({ status: "invalid", at, field });
      }
      expect((await save(tx, id, "قالب سليم", []))[0].out.status).toBe("empty");
      expect((await save(tx, id, "   ", QUESTIONS))[0].out.status).toBe("invalid_title");

      // Every refusal above left the saved set exactly as it was.
      expect((await questionsOf(tx, "survey_template_questions", "template_id", id)).map((q) => q.prompt)).toEqual(QUESTIONS.map((q) => q.prompt));
    });
  });

  it("two templates of one org cannot share a title, and another org's template is `not_found`", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);

      await tx.as(f.a.mod.claims);
      const [mine] = await save(tx, null, "استبانة ما بعد الجلسة");
      expect((await save(tx, null, "استبانة ما بعد الجلسة"))[0].out.status).toBe("title_taken");

      // Org B may use the same title — the constraint is per org.
      await tx.as(f.b.mod.claims);
      expect((await save(tx, null, "استبانة ما بعد الجلسة"))[0].out.status).toBe("ok");
      // …and may not touch org A's row, nor learn whether it exists.
      expect(await errorMessage(() => save(tx, mine.out.template_id!, "محاولة"))).toMatch(/not_found/);
      expect(await errorMessage(() => tx.q(`select public.survey_template_delete($1)`, [mine.out.template_id]))).toMatch(/not_found/);
    });
  });

  it("the six authoring tables are read by the org's staff and by nobody else (0124)", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      await tx.as(f.a.mod.claims);
      await save(tx, null, "قالب القراءة");

      const count = async () => (await tx.q<{ n: string }>(`select count(*)::text as n from public.survey_templates`))[0].n;
      expect(await count()).toBe("1");
      await tx.as(f.a.admin.claims);
      expect(await count()).toBe("1");
      await tx.as(f.a.members[0].claims);
      expect(await count()).toBe("0");      // a member sees no template at all
      await tx.as(f.b.admin.claims);
      expect(await count()).toBe("0");      // another org's staff sees none either
      await tx.asAnon();
      expect(await errorCode(count)).toBe(PERMISSION_DENIED);
    });
  });
});

describe("RPC-survey_attach / RPC-survey_detach", () => {
  it("attaching COPIES the template: editing the template afterwards changes nothing that was attached", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      await tx.as(f.a.mod.claims);

      const [t] = await save(tx, null, "قالب النسخ");
      const [out] = await attach(tx, f.m2.a.completed, t.out.template_id!);
      expect(out.out.status).toBe("ok");
      const survey = out.out.survey_id!;

      // The template is rewritten from scratch — new prompts, new ids.
      await save(tx, t.out.template_id!, "قالب النسخ", [{ kind: "free_text", prompt: "سؤال جديد تمامًا", required: true }]);

      const copied = await questionsOf(tx, "survey_questions", "survey_id", survey);
      expect(copied.map((q) => q.prompt)).toEqual(QUESTIONS.map((q) => q.prompt));
      const options = await tx.q<{ label: string }>(
        `select o.label from public.survey_question_options o
           join public.survey_questions q on q.id = o.question_id
          where q.survey_id = $1 order by o.position`,
        [survey],
      );
      expect(options.map((o) => o.label)).toEqual(["قصيرة", "مناسبة", "طويلة"]);
      // The title travelled with the copy and stays what it was at attach time.
      const [row] = await tx.q<{ title: string; source_template_id: string }>(
        `select title, source_template_id from public.surveys where id = $1`,
        [survey],
      );
      expect(row.title).toBe("قالب النسخ");
      expect(row.source_template_id).toBe(t.out.template_id);
    });
  });

  it("one survey per session, and an empty template is refused before anything is written", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);

      await tx.asOwner();
      const [bare] = await tx.q<{ id: string }>(
        `insert into public.survey_templates (org_id, title) values ($1, 'قالب فارغ') returning id`,
        [f.a.id],
      );

      await tx.as(f.a.mod.claims);
      expect((await attach(tx, f.m2.a.completed, bare.id))[0].out.status).toBe("template_empty");
      expect((await tx.q<{ n: string }>(`select count(*)::text as n from public.surveys`))[0].n).toBe("0");

      const [t] = await save(tx, null, "قالب مكتمل");
      expect((await attach(tx, f.m2.a.completed, t.out.template_id!))[0].out.status).toBe("ok");
      expect((await attach(tx, f.m2.a.completed, t.out.template_id!))[0].out.status).toBe("already_attached");

      // Another org's session is not found, not refused for a different reason.
      expect(await errorMessage(() => attach(tx, f.m2.b.completed, t.out.template_id!))).toMatch(/not_found/);
    });
  });

  it("attach and detach each write one audit row; detaching an unanswered survey removes it whole", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      await tx.as(f.a.mod.claims);

      const [t] = await save(tx, null, "قالب التدقيق");
      const [out] = await attach(tx, f.m2.a.completed, t.out.template_id!);
      const survey = out.out.survey_id!;
      expect((await detach(tx, f.m2.a.completed))[0].out.status).toBe("ok");
      expect((await detach(tx, f.m2.a.completed))[0].out.status).toBe("no_survey");

      await tx.asOwner();
      const audit = await tx.q<{ action: string; subject_id: string; actor_role: string }>(
        `select action, subject_id, actor_role from public.audit_log
          where org_id = $1 and action in ('survey.attached', 'survey.detached') order by action`,
        [f.a.id],
      );
      expect(audit.map((r) => r.action)).toEqual(["survey.attached", "survey.detached"]);
      expect(audit.every((r) => r.subject_id === f.m2.a.completed && r.actor_role === "moderator")).toBe(true);
      // The questions went with it.
      expect((await tx.q<{ n: string }>(`select count(*)::text as n from public.survey_questions where survey_id = $1`, [survey]))[0].n).toBe("0");
    });
  });

  it("★ once one member has answered, detaching is refused and the survey stands", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await applyProposed(tx, FILE);
      await tx.as(f.a.mod.claims);

      const [t] = await save(tx, null, "قالب المجيبين");
      const [out] = await attach(tx, f.m2.a.completed, t.out.template_id!);
      const survey = out.out.survey_id!;

      // The register is what decides — written here as the owner because the
      // submit RPC is the next file's.
      await tx.asOwner();
      await tx.q(`insert into public.survey_participations (org_id, survey_id, member_id) values ($1, $2, $3)`,
        [f.a.id, survey, f.a.members[1].memberId]);

      await tx.as(f.a.mod.claims);
      expect((await detach(tx, f.m2.a.completed))[0].out.status).toBe("has_responses");
      expect((await tx.q<{ n: string }>(`select count(*)::text as n from public.surveys where id = $1`, [survey]))[0].n).toBe("1");
      expect((await questionsOf(tx, "survey_questions", "survey_id", survey)).length).toBe(3);
    });
  });
});

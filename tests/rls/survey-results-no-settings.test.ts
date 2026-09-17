// supabase/migrations/0138_survey_results.sql — the withhold FAILS CLOSED when
// an org has no `org_settings` row (REQ-SUR-006; DEC-160 §3.3). Found by
// `designer`'s adversarial read of the promoted file; written by the lead with
// the one-line fix. From here it is `event`'s file, like its siblings.
//
// 03 §8.2 row proven here: RPC-survey_results.no_settings_row.
//
// `survey_min_responses` is `not null default 3` — as a COLUMN. A missing ROW
// assigns nothing, left `v_min` NULL, and every guard in the function is a
// comparison with it: `if v_n < NULL` is not taken, so ONE response's free text
// was released in full with `withheld` reading null rather than true. Nothing
// in the schema makes an org have a settings row — `create_org()` writes one by
// convention; a fixture, a seed or a restore need not.
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

const SECRET = "إجابة واحدة لا ينبغي أن يراها أحد بعد";

async function oneResponse(tx: Tx, orgId: string, sessionId: string) {
  const [s] = await tx.q<{ id: string }>(`insert into public.surveys (org_id, session_id, title) values ($1, $2, 'استبانة') returning id`, [orgId, sessionId]);
  const [q] = await tx.q<{ id: string }>(
    `insert into public.survey_questions (org_id, survey_id, position, kind, prompt, required)
     values ($1, $2, 1, 'free_text', 'ماذا تقترح؟', false) returning id`,
    [orgId, s.id],
  );
  const [r] = await tx.q<{ id: string }>(`insert into public.survey_responses (org_id, survey_id) values ($1, $2) returning id`, [orgId, s.id]);
  await tx.q(
    `insert into public.survey_answers (org_id, survey_id, response_id, question_id, text_value) values ($1, $2, $3, $4, $5)`,
    [orgId, s.id, r.id, q.id, SECRET],
  );
}

describe("RPC-survey_results.no_settings_row", () => {
  it("★ an org with NO org_settings row still withholds one response — the floor holds without the row", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await oneResponse(tx, f.a.id, f.m2.a.completed);
      const gone = await tx.q(`delete from public.org_settings where org_id = $1 returning org_id`, [f.a.id]);
      expect(gone, "the fixture had a settings row, and it is gone").toHaveLength(1);

      await tx.as(f.a.mod.claims);
      const [{ out }] = await tx.q<{ out: Record<string, unknown> }>(`select public.survey_results($1) as out`, [f.m2.a.completed]);
      expect(out.status).toBe("withheld");
      expect(out.min).toBe(3);
      expect(out).not.toHaveProperty("questions");
      expect(out).not.toHaveProperty("response_count");
      expect(JSON.stringify(out)).not.toContain(SECRET);
    });
  });

  it("the same survey WITH its settings row is withheld the same way — the control", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      await oneResponse(tx, f.a.id, f.m2.a.completed);

      await tx.as(f.a.mod.claims);
      const [{ out }] = await tx.q<{ out: Record<string, unknown> }>(`select public.survey_results($1) as out`, [f.m2.a.completed]);
      expect(out.status).toBe("withheld");
      expect(JSON.stringify(out)).not.toContain(SECRET);
    });
  });
});

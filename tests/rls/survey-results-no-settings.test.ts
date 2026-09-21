// `survey_results()` fails CLOSED when an org has no `org_settings` row
// (`0138`, the lead's one-line correction on `designer`'s adversarial read).
//
// ★ WHY THIS IS ITS OWN FILE AND ITS OWN CASE. Every guard in the function
// compares against `v_min`, and a missing settings row left it NULL: `v_n <
// NULL` is NULL, which is not TRUE, so the withheld branch was skipped; and
// `a.answered < NULL` is NULL, so `withheld` came back null rather than true.
// ONE response's free text was released. Nothing in the schema makes a settings
// row exist — `create_org()` writes one, and that is a convention, not a
// constraint — so the function must not depend on it.
//
// The fix is `v_min := greatest(coalesce(v_min, 3), 3)`, which also holds the
// floor against a row a future migration might let go below it (sync 1, R3).
//
// 03 §8.2 row: `RPC-survey_results.no_settings_fails_closed`.
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

const SECRET = "لم يكن المثال واضحًا في البداية";

/** A completed session with a survey of one scale and one free-text question,
 *  and `n` stored responses — written as the worker writes them. */
async function surveyWithResponses(tx: Tx, org: Org, n: number) {
  await tx.asOwner();
  const [session] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, state, published_at, completed_at)
     values ($1, 'جلسة بلا إعدادات', 'ملخص', $2, 'introductory', now() - interval '2 hours', 60, now() - interval '1 hour',
             $3, 40, 'completed', now() - interval '1 day', now() - interval '1 hour') returning id`,
    [org.id, org.categoryId, org.venueId],
  );
  const [survey] = await tx.q<{ id: string }>(
    `insert into public.surveys (org_id, session_id, title) values ($1, $2, 'استبانة') returning id`,
    [org.id, session.id],
  );
  const [scale] = await tx.q<{ id: string }>(
    `insert into public.survey_questions (org_id, survey_id, position, kind, prompt, required)
     values ($1, $2, 1, 'scale_1_5', 'ما مدى وضوح المحتوى؟', true) returning id`,
    [org.id, survey.id],
  );
  const [text] = await tx.q<{ id: string }>(
    `insert into public.survey_questions (org_id, survey_id, position, kind, prompt, required)
     values ($1, $2, 2, 'free_text', 'ماذا تقترح؟', false) returning id`,
    [org.id, survey.id],
  );

  for (let i = 0; i < n; i += 1) {
    const [response] = await tx.q<{ id: string }>(
      `insert into public.survey_responses (org_id, survey_id) values ($1, $2) returning id`,
      [org.id, survey.id],
    );
    await tx.q(
      `insert into public.survey_answers (org_id, survey_id, response_id, question_id, scale_value) values ($1, $2, $3, $4, 5)`,
      [org.id, survey.id, response.id, scale.id],
    );
    await tx.q(
      `insert into public.survey_answers (org_id, survey_id, response_id, question_id, text_value) values ($1, $2, $3, $4, $5)`,
      [org.id, survey.id, response.id, text.id, `${SECRET} (${i + 1})`],
    );
  }
  return { sessionId: session.id, surveyId: survey.id };
}

const results = async (tx: Tx, sessionId: string) =>
  (await tx.q<{ out: Record<string, unknown> }>(`select public.survey_results($1) as out`, [sessionId]))[0].out;

describe("RPC-survey_results.no_settings_fails_closed", () => {
  it("★ an org with NO settings row withholds ONE response — the free text never leaves", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const s = await surveyWithResponses(tx, f.a, 1);

      // The row every org has by convention and no constraint requires.
      await tx.asOwner();
      await tx.q(`delete from public.org_settings where org_id = $1`, [f.a.id]);

      await tx.as(f.a.admin.claims);
      const out = await results(tx, s.sessionId);
      expect(out.status).toBe("withheld");
      // The floor stands in for the missing row, so the screen can still say
      // «تظهر النتائج بعد 3 استجابات».
      expect(out.min).toBe(3);
      expect(out).not.toHaveProperty("questions");
      expect(out).not.toHaveProperty("response_count");
      // ★ The sentence the defect released.
      expect(JSON.stringify(out)).not.toContain(SECRET);
    });
  });

  it("two responses are withheld too, and the answer is not in the payload under any key", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const s = await surveyWithResponses(tx, f.a, 2);
      await tx.asOwner();
      await tx.q(`delete from public.org_settings where org_id = $1`, [f.a.id]);

      await tx.as(f.a.mod.claims);
      const out = await results(tx, s.sessionId);
      expect(out.status).toBe("withheld");
      expect(JSON.stringify(out)).not.toContain(SECRET);
    });
  });

  it("the floor is not a wall: at three responses the same org reads its results, with `min` 3", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const s = await surveyWithResponses(tx, f.a, 3);
      await tx.asOwner();
      await tx.q(`delete from public.org_settings where org_id = $1`, [f.a.id]);

      await tx.as(f.a.admin.claims);
      const out = (await results(tx, s.sessionId)) as {
        status: string; min: number; response_count: number;
        questions: { withheld: boolean; texts: string[] | null }[];
      };
      expect(out.status).toBe("ok");
      expect(out.min).toBe(3);
      expect(out.response_count).toBe(3);
      // `withheld` is a BOOLEAN on every question — never null, which is what
      // the DTO and the screen read.
      expect(out.questions.map((q) => q.withheld)).toEqual([false, false]);
      expect(out.questions[1].texts).toHaveLength(3);
    });
  });

  it("★ a settings row that a future migration let below the floor is raised to it, not obeyed", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      const s = await surveyWithResponses(tx, f.a, 1);
      // `0124`'s check refuses this from any client; the owner writes it here to
      // prove the function does not depend on that check either.
      await tx.asOwner();
      await tx.q(`alter table public.org_settings drop constraint org_settings_survey_min_responses_floor`);
      await tx.q(`update public.org_settings set survey_min_responses = 1 where org_id = $1`, [f.a.id]);

      await tx.as(f.a.admin.claims);
      const out = await results(tx, s.sessionId);
      expect(out.status).toBe("withheld");
      expect(out.min).toBe(3);
      expect(JSON.stringify(out)).not.toContain(SECRET);
    });
  });
});

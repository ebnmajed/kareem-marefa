// supabase/migrations/0135_data_export_surveys_answered.sql — the PDPL
// self-export lists the surveys a member answered, and nothing they said
// (REQ-PRF-006, REQ-SUR-009; DEC-160 §3). The lead's, as `platform`'s custodian.
//
// 03 §8.2 rows proven here: RPC-build_data_export_payload.surveys_answered,
// RPC-build_data_export_payload.surveys_no_answers.
import { afterAll, describe, expect, it } from "vitest";
import { pool, withTx, type Tx } from "./db";
import { seed } from "./fixture";

afterAll(() => pool.end());

type Payload = Record<string, unknown> & { surveys_answered: { session: string }[] };

const payloadOf = async (tx: Tx, member: string) =>
  (await tx.q<{ p: Payload }>(`select public.build_data_export_payload($1) as p`, [member]))[0].p;

/** A survey on a session with one scale question, and `member` on its register with one stored answer. */
async function answered(tx: Tx, orgId: string, sessionId: string, member: string) {
  const [s] = await tx.q<{ id: string }>(`insert into public.surveys (org_id, session_id, title) values ($1, $2, 'استبانة') returning id`, [orgId, sessionId]);
  const [q] = await tx.q<{ id: string }>(
    `insert into public.survey_questions (org_id, survey_id, position, kind, prompt, required)
     values ($1, $2, 1, 'free_text', 'ماذا تقترح؟', false) returning id`,
    [orgId, s.id],
  );
  await tx.q(`insert into public.survey_participations (org_id, survey_id, member_id) values ($1, $2, $3)`, [orgId, s.id, member]);
  const [r] = await tx.q<{ id: string }>(`insert into public.survey_responses (org_id, survey_id) values ($1, $2) returning id`, [orgId, s.id]);
  await tx.q(
    `insert into public.survey_answers (org_id, survey_id, response_id, question_id, text_value) values ($1, $2, $3, $4, 'إجابة لا يعرف أحد صاحبها')`,
    [orgId, s.id, r.id, q.id],
  );
  return s.id;
}

describe("RPC-build_data_export_payload.surveys_answered", () => {
  it("lists the sessions whose survey the member answered — by title, with no instant — and only that member's", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const me = f.a.members[1].memberId;
      const other = f.a.members[0].memberId;
      await answered(tx, f.a.id, f.m2.a.completed, me);

      const [title] = await tx.q<{ title: string }>(`select title from public.sessions where id = $1`, [f.m2.a.completed]);
      const mine = await payloadOf(tx, me);
      expect(mine.surveys_answered).toEqual([{ session: title.title }]);
      // One key per entry: nothing here can carry a time.
      expect(Object.keys(mine.surveys_answered[0])).toEqual(["session"]);

      expect((await payloadOf(tx, other)).surveys_answered).toEqual([]);
    });
  });
});

describe("RPC-build_data_export_payload.surveys_no_answers", () => {
  it("★ carries no answer text anywhere in the archive — there is no path from a member to a response", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const me = f.a.members[1].memberId;
      await answered(tx, f.a.id, f.m2.a.completed, me);

      const text = JSON.stringify(await payloadOf(tx, me));
      expect(text).not.toContain("إجابة لا يعرف أحد صاحبها");
      expect(text).not.toContain("ماذا تقترح؟");
    });
  });

  it("every key 0088 returned is still returned, and the new one is the only addition", async () => {
    await withTx(async (tx) => {
      const f = await seed(tx);
      await tx.asOwner();
      const keys = Object.keys(await payloadOf(tx, f.a.members[1].memberId)).sort();
      expect(keys).toEqual(
        ["certificates", "check_ins", "comments", "generated_at", "interests", "member", "org", "photos", "points_ledger", "ratings_given", "rsvps", "surveys_answered"].sort(),
      );
    });
  });
});

// supabase/proposed/event/05_survey_results.sql — the one function that
// releases results, under the withhold (REQ-SUR-005 … 008).
//
// 03 §8.2 rows proven here: RPC-survey_results.staff_only, .presenter_refused,
// .withheld_below_minimum, .withheld_per_question, .drawn, .free_text_order,
// .response_rate, .rate_never_exceeds_one.
//
// ★ No test lowers `survey_min_responses` (sync 1, R3): it has a floor of 3 in
// the database, and a suite that turned the withhold down to reach «drawn»
// would be testing a configuration no org can have. Three responses are
// stored instead.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, errorMessage, pool, PERMISSION_DENIED, withTx, type Tx } from "./db";
import { seed, type Org } from "./fixture";

afterAll(() => pool.end());

const FILES = [
  "event/02_rating_eligibility.sql",
  "event/03_survey_authoring.sql",
  "event/04_survey_submit.sql",
  "event/05_survey_results.sql",
];

const QUESTIONS = [
  { kind: "scale_1_5", prompt: "ما مدى وضوح المحتوى؟", required: true },
  { kind: "single_choice", prompt: "هل كانت المدة مناسبة؟", required: false, options: ["قصيرة", "مناسبة", "طويلة"] },
  { kind: "multi_choice", prompt: "ما الذي أعجبك؟", required: false, options: ["الأمثلة", "الإيقاع", "النقاش"] },
  { kind: "free_text", prompt: "ماذا تقترح؟", required: false },
];

interface Q { id: string; kind: string; options: { id: string; label: string }[] }

async function ready(tx: Tx) {
  const f = await seed(tx);
  for (const file of FILES) await applyProposed(tx, file);
  return f;
}

/** A completed session with `n` checked-in members, and a survey on it. */
async function surveyed(tx: Tx, f: { a: Org }, attendees: string[]) {
  await tx.asOwner();
  const [session] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, state, published_at, completed_at)
     values ($1, 'جلسة النتائج', 'ملخص', $2, 'introductory', now() - interval '2 hours', 60, now() - interval '1 hour',
             $3, 40, 'completed', now() - interval '1 day', now() - interval '1 hour') returning id`,
    [f.a.id, f.a.categoryId, f.a.venueId],
  );
  for (const member of attendees) {
    await tx.q(
      `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
       values ($1, $2, $3, 'manual', 'اختبار', $4, 'empty'::tstzrange)`,
      [f.a.id, session.id, member, f.a.admin.memberId],
    );
  }
  await tx.as(f.a.mod.claims);
  const [t] = await tx.q<{ out: { template_id: string } }>(
    `select public.survey_template_save(null, 'قالب النتائج', $1::jsonb) as out`,
    [JSON.stringify(QUESTIONS)],
  );
  const [a] = await tx.q<{ out: { survey_id: string } }>(`select public.survey_attach($1, $2) as out`, [session.id, t.out.template_id]);
  await tx.asOwner();
  const questions = await tx.q<Q>(
    `select q.id, q.kind::text as kind,
            coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by o.position)
                        from public.survey_question_options o where o.question_id = q.id), '[]'::jsonb) as options
       from public.survey_questions q where q.survey_id = $1 order by q.position`,
    [a.out.survey_id],
  );
  return { sessionId: session.id, surveyId: a.out.survey_id, questions };
}

/** One stored response, written the way the worker writes it. */
async function storeResponse(tx: Tx, surveyId: string, answers: { questionId: string; scale?: number; optionIds?: string[]; text?: string; textId?: string }[]) {
  await tx.asOwner();
  const [r] = await tx.q<{ id: string }>(
    `insert into public.survey_responses (org_id, survey_id)
     select org_id, id from public.surveys where id = $1 returning id`,
    [surveyId],
  );
  for (const a of answers) {
    if (a.scale !== undefined) {
      await tx.q(
        `insert into public.survey_answers (org_id, survey_id, response_id, question_id, scale_value)
         select org_id, $1, $2, $3, $4 from public.surveys where id = $1`,
        [surveyId, r.id, a.questionId, a.scale],
      );
    }
    for (const optionId of a.optionIds ?? []) {
      await tx.q(
        `insert into public.survey_answers (org_id, survey_id, response_id, question_id, option_id)
         select org_id, $1, $2, $3, $4 from public.surveys where id = $1`,
        [surveyId, r.id, a.questionId, optionId],
      );
    }
    if (a.text !== undefined) {
      await tx.q(
        `insert into public.survey_answers (id, org_id, survey_id, response_id, question_id, text_value)
         select coalesce($5::uuid, gen_random_uuid()), org_id, $1, $2, $3, $4 from public.surveys where id = $1`,
        [surveyId, r.id, a.questionId, a.text, a.textId ?? null],
      );
    }
  }
  return r.id;
}

const results = async (tx: Tx, sessionId: string) =>
  (await tx.q<{ out: Record<string, unknown> }>(`select public.survey_results($1) as out`, [sessionId]))[0].out;

describe("RPC-survey_results.staff_only / .presenter_refused", () => {
  it("★ the session's presenter is refused — and so is an admin who presented it", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await surveyed(tx, f, [f.a.members[1].memberId]);

      await tx.asOwner();
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`,
        [f.a.id, s.sessionId, f.a.members[0].memberId]);
      // The same session, presented by the org's ADMIN as well: REQ-SUR-005 is
      // about presenting, not about rank, and this is the case that says so.
      await tx.q(`insert into public.session_presenters (org_id, session_id, member_id, accepted) values ($1, $2, $3, true)`,
        [f.a.id, s.sessionId, f.a.admin.memberId]);

      await tx.as(f.a.members[0].claims);
      expect(await errorMessage(() => results(tx, s.sessionId))).toMatch(/not_authorized/);
      await tx.as(f.a.admin.claims);
      expect(await errorMessage(() => results(tx, s.sessionId))).toMatch(/not_authorized/);
      // The moderator, who presented nothing, reads it.
      await tx.as(f.a.mod.claims);
      expect((await results(tx, s.sessionId)).status).toBe("withheld");
    });
  });

  it("a member is refused, a stale admin is refused, another org's session is `not_found`, and anon cannot execute it", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await surveyed(tx, f, [f.a.members[0].memberId]);

      await tx.as(f.a.members[0].claims);
      expect(await errorMessage(() => results(tx, s.sessionId))).toMatch(/not_authorized/);
      await tx.as({ ...f.a.admin.claims, claims_version: 999 });
      expect(await errorMessage(() => results(tx, s.sessionId))).toMatch(/stale_claims/);
      await tx.asAnon();
      expect(await errorCode(() => results(tx, s.sessionId))).toBe(PERMISSION_DENIED);

      await tx.as(f.b.admin.claims);
      expect(await errorMessage(() => results(tx, s.sessionId))).toMatch(/not_found/);
      // A session of the caller's own org with no survey says so.
      await tx.as(f.a.admin.claims);
      expect((await results(tx, f.m2.a.published)).status).toBe("no_survey");
    });
  });
});

describe("RPC-survey_results.withheld_below_minimum / .withheld_per_question / .drawn", () => {
  it("★ below the minimum NOTHING leaves — not a mean, not a distribution, not the response count", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await surveyed(tx, f, [f.a.members[0].memberId, f.a.members[1].memberId, f.a.mod.memberId]);
      const [scale] = s.questions;

      await storeResponse(tx, s.surveyId, [{ questionId: scale.id, scale: 5 }]);
      await storeResponse(tx, s.surveyId, [{ questionId: scale.id, scale: 4 }]);

      await tx.as(f.a.admin.claims);
      const out = await results(tx, s.sessionId);
      expect(out.status).toBe("withheld");
      expect(out.min).toBe(3);
      expect(out.eligible_count).toBe(3);
      // The count is part of the withhold: in a survey one person answered, the
      // register says who, and «1» beside an attendance list is the other half.
      expect(out).not.toHaveProperty("response_count");
      expect(out).not.toHaveProperty("questions");
      expect(JSON.stringify(out)).not.toContain("mean");
    });
  });

  it("at the minimum: each question drawn on its own count, and an under-answered one withheld beside the others", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await surveyed(tx, f, [f.a.members[0].memberId, f.a.members[1].memberId, f.a.mod.memberId]);
      const [scale, single, multi, text] = s.questions;

      // Three responses. The single-choice question is answered by two of them
      // — below the minimum on its own, while the survey is at it.
      await storeResponse(tx, s.surveyId, [
        { questionId: scale.id, scale: 5 },
        { questionId: single.id, optionIds: [single.options[1].id] },
        { questionId: multi.id, optionIds: [multi.options[0].id, multi.options[2].id] },
        { questionId: text.id, text: "أ", textId: "11111111-1111-4111-8111-111111111111" },
      ]);
      await storeResponse(tx, s.surveyId, [
        { questionId: scale.id, scale: 3 },
        { questionId: single.id, optionIds: [single.options[1].id] },
        { questionId: multi.id, optionIds: [multi.options[1].id] },
        { questionId: text.id, text: "ب", textId: "22222222-2222-4222-8222-222222222222" },
      ]);
      await storeResponse(tx, s.surveyId, [
        { questionId: scale.id, scale: 4 },
        { questionId: multi.id, optionIds: [multi.options[0].id] },
        { questionId: text.id, text: "ج", textId: "33333333-3333-4333-8333-333333333333" },
      ]);

      await tx.as(f.a.mod.claims);
      const out = await results(tx, s.sessionId) as {
        status: string; response_count: number; eligible_count: number;
        questions: { id: string; withheld: boolean; answered_count: number | null; mean: string | null; distribution: { value?: number; label?: string; count: number }[] | null; texts: string[] | null }[];
      };
      expect(out.status).toBe("ok");
      expect(out.response_count).toBe(3);
      expect(out.eligible_count).toBe(3);

      const [qScale, qSingle, qMulti, qText] = out.questions;

      // The scale: its count, its mean and its 1…5 distribution, every value
      // present so a bar chart has five bars and not three.
      expect(qScale).toMatchObject({ id: scale.id, withheld: false, answered_count: 3 });
      expect(Number(qScale.mean)).toBe(4);
      expect(qScale.distribution).toEqual([
        { value: 1, count: 0 }, { value: 2, count: 0 }, { value: 3, count: 1 }, { value: 4, count: 1 }, { value: 5, count: 1 },
      ]);

      // ★ Two responses answered the single-choice question, so it is withheld
      // ON ITS OWN while the survey around it is drawn — and its count is
      // withheld with it (`DEC-163`): «2» here, read again at four responses,
      // would say whether the newest respondent answered this question.
      expect(qSingle).toMatchObject({ id: single.id, withheld: true, answered_count: null });
      expect(qSingle.distribution).toBeNull();
      expect(qSingle.mean ?? null).toBeNull();

      // The multi-choice: counted per response, not per row — the first
      // response chose two options and still counts once.
      expect(qMulti).toMatchObject({ id: multi.id, withheld: false, answered_count: 3 });
      expect(qMulti.distribution).toEqual([
        { id: multi.options[0].id, label: "الأمثلة", count: 2 },
        { id: multi.options[1].id, label: "الإيقاع", count: 1 },
        { id: multi.options[2].id, label: "النقاش", count: 1 },
      ]);

      // ★ Free text in the answers' own id order — inserted أ, ب, ج but that is
      // not what proves it; the next case is.
      expect(qText).toMatchObject({ id: text.id, withheld: false, answered_count: 3 });
      expect(qText.texts).toEqual(["أ", "ب", "ج"]);
    });
  });

  it("★ free text comes back in the answers' random-id order, never in the order people answered", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await surveyed(tx, f, [f.a.members[0].memberId, f.a.members[1].memberId, f.a.mod.memberId]);
      const [scale, , , text] = s.questions;

      // Written third, first, second — so insertion order and id order differ,
      // and only one of them can be what comes back.
      const write = (t: string, id: string) =>
        storeResponse(tx, s.surveyId, [{ questionId: scale.id, scale: 4 }, { questionId: text.id, text: t, textId: id }]);
      await write("ثالث", "33333333-3333-4333-8333-333333333333");
      await write("أول", "11111111-1111-4111-8111-111111111111");
      await write("ثاني", "22222222-2222-4222-8222-222222222222");

      await tx.as(f.a.admin.claims);
      const out = await results(tx, s.sessionId) as { questions: { texts: string[] | null }[] };
      expect(out.questions[3].texts).toEqual(["أول", "ثاني", "ثالث"]);
    });
  });
});

describe("RPC-survey_results.response_rate / .rate_never_exceeds_one", () => {
  it("the numerator is the stored responses and the denominator the session's active attendees", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await surveyed(tx, f, [f.a.members[0].memberId, f.a.members[1].memberId, f.a.mod.memberId, f.a.admin.memberId]);
      const [scale] = s.questions;
      for (const v of [5, 4, 3]) await storeResponse(tx, s.surveyId, [{ questionId: scale.id, scale: v }]);

      await tx.as(f.a.mod.claims);
      const out = await results(tx, s.sessionId) as { response_count: number; eligible_count: number };
      expect(out.response_count).toBe(3);
      expect(out.eligible_count).toBe(4);
    });
  });

  it("★ a check-in removed AFTER the member answered cannot take the response with it, so the rate never exceeds 100 %", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await surveyed(tx, f, [f.a.members[0].memberId, f.a.members[1].memberId, f.a.mod.memberId]);
      const [scale] = s.questions;
      for (const v of [5, 4, 3]) await storeResponse(tx, s.surveyId, [{ questionId: scale.id, scale: v }]);

      // REQ-CHK-017: an admin removes every check-in after the fact. The
      // responses stay, because nothing can find them.
      await tx.asOwner();
      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where session_id = $1`, [s.sessionId, f.a.admin.memberId]);

      await tx.as(f.a.admin.claims);
      const out = await results(tx, s.sessionId) as { response_count: number; eligible_count: number };
      expect(out.response_count).toBe(3);
      expect(out.eligible_count).toBe(3);      // greatest(0, 3) — never 0, never a rate above one
    });
  });

  it("a session nobody attended reports zero eligible attendees rather than dividing by them", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await surveyed(tx, f, []);
      await tx.as(f.a.admin.claims);
      const out = await results(tx, s.sessionId) as { status: string; eligible_count: number };
      expect(out.status).toBe("withheld");     // no responses either
      expect(out.eligible_count).toBe(0);
    });
  });
});

describe("RPC-survey_results.withheld_hides_n / .withheld_per_question hides its count", () => {
  it("★ the withheld branch publishes the ATTENDEE count, never `greatest(attendees, responses)` — which would BE n", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await surveyed(tx, f, [f.a.members[0].memberId, f.a.members[1].memberId]);
      const [scale] = s.questions;
      await storeResponse(tx, s.surveyId, [{ questionId: scale.id, scale: 5 }]);
      await storeResponse(tx, s.surveyId, [{ questionId: scale.id, scale: 4 }]);

      // Both check-ins removed after the fact (REQ-CHK-017). `greatest()` would
      // now return 2 — and 2 is exactly the response count the withhold exists
      // to hide, next to an attendance screen that says zero.
      await tx.asOwner();
      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where session_id = $1`, [s.sessionId, f.a.admin.memberId]);

      await tx.as(f.a.admin.claims);
      const out = await results(tx, s.sessionId) as { status: string; eligible_count: number };
      expect(out.status).toBe("withheld");
      expect(out.eligible_count).toBe(0);
    });
  });

  it("★ a withheld question returns NO answered count — two reads a response apart would otherwise name the question the newest respondent answered", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      const s = await surveyed(tx, f, [f.a.members[0].memberId, f.a.members[1].memberId, f.a.mod.memberId]);
      const [scale, single, , text] = s.questions;

      // Three responses; the single-choice answered by one of them.
      await storeResponse(tx, s.surveyId, [{ questionId: scale.id, scale: 5 }, { questionId: single.id, optionIds: [single.options[0].id] }, { questionId: text.id, text: "أ" }]);
      await storeResponse(tx, s.surveyId, [{ questionId: scale.id, scale: 4 }, { questionId: text.id, text: "ب" }]);
      await storeResponse(tx, s.surveyId, [{ questionId: scale.id, scale: 3 }, { questionId: text.id, text: "ج" }]);

      await tx.as(f.a.mod.claims);
      const out = await results(tx, s.sessionId) as { questions: { id: string; withheld: boolean; answered_count: number | null }[] };
      const drawn = out.questions.find((q) => q.id === scale.id)!;
      const hidden = out.questions.find((q) => q.id === single.id)!;
      expect(drawn).toMatchObject({ withheld: false, answered_count: 3 });
      expect(hidden.withheld).toBe(true);
      expect(hidden.answered_count).toBeNull();
    });
  });
});

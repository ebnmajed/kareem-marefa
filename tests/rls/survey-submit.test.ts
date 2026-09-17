// supabase/proposed/event/04_survey_submit.sql — the one function that accepts
// an answer, and the one the worker calls to store it (E1's answer half).
//
// 03 §8.2 rows proven here: RPC-submit_survey_response.eligibility,
// .agrees_with_rating_policy, .second_submission, .validates_before_writing,
// .enqueues_decorrelated, .no_audit, RPC-record_survey_response.service_role_only,
// .replay, RPC-survey_for_member.no_survey, .audience.
//
// The structural half of the contract — no member on a response, no timestamp,
// no path to `members` — is `tests/rls/survey-structure.test.ts`.
import { afterAll, describe, expect, it } from "vitest";
import { applyProposed, errorCode, pool, PERMISSION_DENIED, withTx, type Tx } from "./db";
import { seed, type Fixture, type Org } from "./fixture";

afterAll(() => pool.end());

const QUESTIONS = [
  { kind: "scale_1_5", prompt: "ما مدى وضوح المحتوى؟", required: true },
  { kind: "single_choice", prompt: "هل كانت المدة مناسبة؟", required: false, options: ["قصيرة", "مناسبة", "طويلة"] },
  { kind: "multi_choice", prompt: "ما الذي أعجبك؟", required: false, options: ["الأمثلة", "الإيقاع", "النقاش"] },
  { kind: "free_text", prompt: "ماذا تقترح؟", required: false },
];

async function ready(tx: Tx): Promise<Fixture & { m2: { a: { completed: string; published: string } } }> {
  const f = await seed(tx);
  for (const file of ["event/02_rating_eligibility.sql", "event/03_survey_authoring.sql", "event/04_survey_submit.sql"]) {
    await applyProposed(tx, file);
  }
  return f as never;
}

/** A completed session `daysAgo` old with a check-in for `member`. */
async function completedSession(tx: Tx, org: Org, member: string, daysAgo = 2) {
  const [session] = await tx.q<{ id: string }>(
    `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                  venue_id, capacity, state, published_at, completed_at)
     values ($1, 'جلسة الاستبانة', 'ملخص', $2, 'introductory',
             now() - make_interval(days => $4) - interval '2 hours', 60, now() - make_interval(days => $4) - interval '1 hour',
             $3, 40, 'completed', now() - make_interval(days => $4) - interval '1 day', now() - make_interval(days => $4))
     returning id`,
    [org.id, org.categoryId, org.venueId, daysAgo],
  );
  const [checkIn] = await tx.q<{ id: string }>(
    `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
     values ($1, $2, $3, 'manual', 'اختبار', $4, 'empty'::tstzrange) returning id`,
    [org.id, session.id, member, org.admin.memberId],
  );
  return { sessionId: session.id, checkInId: checkIn.id };
}

interface Q { id: string; kind: string; required: boolean; options: { id: string; label: string }[] }

/** Attach a survey built from QUESTIONS, and hand back its ids. */
async function surveyOn(tx: Tx, org: Org, staff: { claims: Parameters<Tx["as"]>[0] }, sessionId: string, title = "استبانة الجلسة") {
  await tx.as(staff.claims);
  const [t] = await tx.q<{ out: { template_id: string } }>(
    `select public.survey_template_save(null, $1, $2::jsonb) as out`,
    [title, JSON.stringify(QUESTIONS)],
  );
  const [a] = await tx.q<{ out: { status: string; survey_id: string } }>(
    `select public.survey_attach($1, $2) as out`,
    [sessionId, t.out.template_id],
  );
  expect(a.out.status).toBe("ok");
  await tx.asOwner();
  const questions = await tx.q<Q>(
    `select q.id, q.kind::text as kind, q.required,
            coalesce((select jsonb_agg(jsonb_build_object('id', o.id, 'label', o.label) order by o.position)
                        from public.survey_question_options o where o.question_id = q.id), '[]'::jsonb) as options
       from public.survey_questions q where q.survey_id = $1 order by q.position`,
    [a.out.survey_id],
  );
  return { surveyId: a.out.survey_id, templateId: t.out.template_id, questions };
}

const submit = (tx: Tx, sessionId: string, answers: unknown[]) =>
  tx.q<{ out: { status: string; reason?: string; missing?: string[]; invalid?: string[] } }>(
    `select public.submit_survey_response($1, $2::jsonb) as out`,
    [sessionId, JSON.stringify(answers)],
  );

const jobs = (tx: Tx) =>
  tx.q<{ key: string | null; run_at: string; payload: Record<string, unknown>; seconds_ahead: number }>(
    `select j.key, j.run_at, j.payload, extract(epoch from (j.run_at - now()))::int as seconds_ahead
       from graphile_worker._private_jobs j
       join graphile_worker._private_tasks t on t.id = j.task_id
      where t.identifier = 'record_survey_response'`,
  );

/** Every answer of a full, valid submission. */
const fullAnswers = (q: Q[]) => [
  { question_id: q[0].id, scale_value: 4 },
  { question_id: q[1].id, option_ids: [q[1].options[1].id] },
  { question_id: q[2].id, option_ids: [q[2].options[0].id, q[2].options[2].id] },
  { question_id: q[3].id, text_value: "مثال عملي أكثر" },
];

describe("RPC-submit_survey_response.eligibility / .agrees_with_rating_policy", () => {
  it("★ answers `not_eligible` exactly when a rating insert is refused — the survey never admits someone the rating turns away", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);

      await tx.asOwner();
      // Four situations, one member each, so no unique (session, member) gets in the way.
      const open = await completedSession(tx, f.a, f.a.members[0].memberId, 2);
      const past = await completedSession(tx, f.a, f.a.members[1].memberId, 15);
      const removed = await completedSession(tx, f.a, f.a.mod.memberId, 2);
      await tx.q(`update public.check_ins set removed_at = now(), removed_by = $2 where id = $1`, [removed.checkInId, f.a.admin.memberId]);
      const [live] = await tx.q<{ id: string }>(
        `insert into public.sessions (org_id, title, abstract, category_id, level, starts_at, duration_minutes, ends_at,
                                      venue_id, capacity, state, published_at)
         values ($1, 'جلسة لم تكتمل', 'ملخص', $2, 'introductory', now() - interval '30 minutes', 60, now() + interval '30 minutes',
                 $3, 40, 'in_progress', now() - interval '1 day') returning id`,
        [f.a.id, f.a.categoryId, f.a.venueId],
      );
      const [liveCheckIn] = await tx.q<{ id: string }>(
        `insert into public.check_ins (org_id, session_id, member_id, method, manual_reason, marked_by, session_window)
         values ($1, $2, $3, 'manual', 'اختبار', $4, 'empty'::tstzrange) returning id`,
        [f.a.id, live.id, f.a.admin.memberId, f.a.admin.memberId],
      );

      const cases: { who: { claims: Parameters<Tx["as"]>[0]; memberId: string }; s: { sessionId: string; checkInId: string }; reason: string }[] = [
        { who: f.a.members[1], s: past, reason: "window_closed" },
        { who: f.a.mod, s: removed, reason: "not_checked_in" },
        { who: f.a.admin, s: { sessionId: live.id, checkInId: liveCheckIn.id }, reason: "window_closed" },
      ];

      for (const c of cases) {
        const { surveyId } = await surveyOn(tx, f.a, f.a.mod, c.s.sessionId, `استبانة ${c.s.sessionId.slice(0, 8)}`);
        expect(surveyId).toBeTruthy();
        await tx.as(c.who.claims);
        const [out] = await submit(tx, c.s.sessionId, []);
        expect(out.out).toMatchObject({ status: "not_eligible", reason: c.reason });
        // …and the rating the same member would write is refused too.
        expect(
          await errorCode(() =>
            tx.q(`insert into public.ratings (org_id, session_id, member_id, check_in_id, session_stars, presenter_stars) values ($1, $2, $3, $4, 5, 5)`,
              [f.a.id, c.s.sessionId, c.who.memberId, c.s.checkInId]),
          ),
        ).toBe(PERMISSION_DENIED);
        await tx.asOwner();
      }

      // The eligible member: both succeed.
      const { questions } = await surveyOn(tx, f.a, f.a.mod, open.sessionId, "استبانة مفتوحة");
      await tx.as(f.a.members[0].claims);
      expect((await submit(tx, open.sessionId, fullAnswers(questions)))[0].out.status).toBe("ok");
      const [rating] = await tx.q<{ id: string }>(
        `insert into public.ratings (org_id, session_id, member_id, check_in_id, session_stars, presenter_stars) values ($1, $2, $3, $4, 5, 5) returning id`,
        [f.a.id, open.sessionId, f.a.members[0].memberId, open.checkInId],
      );
      expect(rating.id).toBeTruthy();
    });
  });

  it("a member with no check-in at all is refused, and a session with no survey answers `no_survey`", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const s = await completedSession(tx, f.a, f.a.members[0].memberId);
      await surveyOn(tx, f.a, f.a.mod, s.sessionId);

      await tx.as(f.a.members[1].claims);      // never checked in to this session
      expect((await submit(tx, s.sessionId, []))[0].out).toMatchObject({ status: "not_eligible", reason: "not_checked_in" });

      await tx.as(f.a.members[0].claims);
      expect((await submit(tx, f.m2.a.published, []))[0].out.status).toBe("no_survey");
    });
  });
});

describe("RPC-submit_survey_response.validates_before_writing / .second_submission / .no_audit", () => {
  it("every refusal names the questions and leaves NO participation and NO job behind", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const s = await completedSession(tx, f.a, f.a.members[0].memberId);
      const { surveyId, questions } = await surveyOn(tx, f.a, f.a.mod, s.sessionId);
      const [q1, q2, q3, q4] = questions;

      await tx.as(f.a.members[0].claims);
      const refusals: [unknown[], string, string[]][] = [
        [[], "missing", [q1.id]],                                                        // the required scale, not sent at all
        [[{ question_id: q1.id, scale_value: 6 }], "invalid", [q1.id]],                  // out of range
        [[{ question_id: q1.id, scale_value: 4 }, { question_id: q2.id, option_ids: [q3.options[0].id] }], "invalid", [q2.id]], // another question's option
        [[{ question_id: q1.id, scale_value: 4 }, { question_id: q2.id, option_ids: [q2.options[0].id, q2.options[1].id] }], "invalid", [q2.id]], // two on single_choice
        [[{ question_id: q1.id, scale_value: 4 }, { question_id: q1.id, scale_value: 5 }], "invalid", [q1.id]],                 // the same question twice
      ];
      for (const [answers, field, ids] of refusals) {
        const [out] = await submit(tx, s.sessionId, answers);
        expect(out.out.status).toBe("invalid");
        expect(out.out[field as "missing" | "invalid"]).toEqual(ids);
      }
      // A question of ANOTHER survey is refused by id, not silently dropped.
      await tx.asOwner();
      const other = await completedSession(tx, f.a, f.a.members[1].memberId);
      const foreign = await surveyOn(tx, f.a, f.a.mod, other.sessionId, "استبانة أخرى");
      await tx.as(f.a.members[0].claims);
      expect((await submit(tx, s.sessionId, [{ question_id: q1.id, scale_value: 3 }, { question_id: foreign.questions[0].id, scale_value: 3 }]))[0].out)
        .toMatchObject({ status: "invalid", invalid: [foreign.questions[0].id] });

      await tx.asOwner();
      expect((await tx.q<{ n: string }>(`select count(*)::text as n from public.survey_participations where survey_id = $1`, [surveyId]))[0].n).toBe("0");
      expect(await jobs(tx)).toHaveLength(0);
      expect(q4.required).toBe(false);   // the optional ones never appear in `missing`
    });
  });

  it("one submission, then `already_answered` by name — and the second enqueues nothing", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const s = await completedSession(tx, f.a, f.a.members[0].memberId);
      const { surveyId, questions } = await surveyOn(tx, f.a, f.a.mod, s.sessionId);
      const [before] = await tx.q<{ n: string }>(`select count(*)::text as n from public.audit_log where org_id = $1`, [f.a.id]);

      await tx.as(f.a.members[0].claims);
      expect((await submit(tx, s.sessionId, fullAnswers(questions)))[0].out.status).toBe("ok");
      expect((await submit(tx, s.sessionId, fullAnswers(questions)))[0].out.status).toBe("already_answered");

      await tx.asOwner();
      expect(await jobs(tx)).toHaveLength(1);
      expect((await tx.q<{ n: string }>(`select count(*)::text as n from public.survey_participations where survey_id = $1`, [surveyId]))[0].n).toBe("1");
      // ★ The submit writes no audit row (DEC-160 §3.5) — an audit row would
      // carry the member and the moment, which is the pairing this removes.
      expect((await tx.q<{ n: string }>(`select count(*)::text as n from public.audit_log where org_id = $1`, [f.a.id]))[0].n).toBe(before.n);
    });
  });
});

describe("RPC-submit_survey_response.enqueues_decorrelated", () => {
  it("★ one job: key NULL, `run_at` 10 minutes to 4 hours ahead, and a payload that names nobody", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const s = await completedSession(tx, f.a, f.a.members[0].memberId);
      const { surveyId, questions } = await surveyOn(tx, f.a, f.a.mod, s.sessionId);

      await tx.as(f.a.members[0].claims);
      const [rating] = await tx.q<{ id: string }>(
        `insert into public.ratings (org_id, session_id, member_id, check_in_id, session_stars, presenter_stars) values ($1, $2, $3, $4, 5, 5) returning id`,
        [f.a.id, s.sessionId, f.a.members[0].memberId, s.checkInId],
      );
      expect((await submit(tx, s.sessionId, fullAnswers(questions)))[0].out.status).toBe("ok");

      await tx.asOwner();
      const [job] = await jobs(tx);
      expect(job.key).toBeNull();
      expect(job.seconds_ahead).toBeGreaterThanOrEqual(600);
      expect(job.seconds_ahead).toBeLessThanOrEqual(14400);
      expect(Object.keys(job.payload).sort()).toEqual(["answers", "response_id", "survey_id"]);
      expect(job.payload.survey_id).toBe(surveyId);

      // ★ Nothing in the payload can find the member: not their id, not the
      // rating they wrote a moment earlier, not the check-in that let them in.
      const text = JSON.stringify(job.payload);
      for (const id of [f.a.members[0].memberId, f.a.members[0].authUserId, rating.id, s.checkInId, s.sessionId]) {
        expect(text).not.toContain(id);
      }
    });
  });
});

describe("RPC-record_survey_response", () => {
  it("only the worker's role may call it; a replay writes one response; the answers land as their shapes", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const s = await completedSession(tx, f.a, f.a.members[0].memberId);
      const { surveyId, questions } = await surveyOn(tx, f.a, f.a.mod, s.sessionId);

      await tx.as(f.a.members[0].claims);
      await submit(tx, s.sessionId, fullAnswers(questions));
      await tx.asOwner();
      const [job] = await jobs(tx);
      const payload = job.payload as { response_id: string; survey_id: string; answers: unknown[] };

      const call = () =>
        tx.q(`select public.record_survey_response($1, $2, $3::jsonb)`, [payload.response_id, payload.survey_id, JSON.stringify(payload.answers)]);

      await tx.asAnon();
      expect(await errorCode(call)).toBe(PERMISSION_DENIED);
      for (const who of [f.a.members[0].claims, f.a.mod.claims, f.a.admin.claims]) {
        await tx.as(who);
        expect(await errorCode(call)).toBe(PERMISSION_DENIED);
      }

      // The worker's role — the only one that may store a response.
      await tx.asServiceRole();
      const [first] = await tx.q<{ record_survey_response: number }>(
        `select public.record_survey_response($1, $2, $3::jsonb)`,
        [payload.response_id, payload.survey_id, JSON.stringify(payload.answers)],
      );
      expect(first.record_survey_response).toBe(5);   // 1 scale + 1 single + 2 multi + 1 text
      const [replay] = await tx.q<{ record_survey_response: number }>(
        `select public.record_survey_response($1, $2, $3::jsonb)`,
        [payload.response_id, payload.survey_id, JSON.stringify(payload.answers)],
      );
      expect(replay.record_survey_response).toBe(0);  // exactly once, from the id in the payload

      await tx.asOwner();
      expect((await tx.q<{ n: string }>(`select count(*)::text as n from public.survey_responses where survey_id = $1`, [surveyId]))[0].n).toBe("1");
      const stored = await tx.q<{ kind: string; scale_value: number | null; label: string | null; text_value: string | null }>(
        `select q.kind::text as kind, a.scale_value, o.label, a.text_value
           from public.survey_answers a
           join public.survey_questions q on q.id = a.question_id
           left join public.survey_question_options o on o.id = a.option_id
          where a.response_id = $1 order by q.position, o.position`,
        [payload.response_id],
      );
      expect(stored.map((r) => r.kind)).toEqual(["scale_1_5", "single_choice", "multi_choice", "multi_choice", "free_text"]);
      expect(stored[0].scale_value).toBe(4);
      expect(stored[1].label).toBe("مناسبة");
      expect([stored[2].label, stored[3].label]).toEqual(["الأمثلة", "النقاش"]);
      expect(stored[4].text_value).toBe("مثال عملي أكثر");
    });
  });

  it("a survey detached before the job ran stores nothing and does not fail the job", async () => {
    await withTx(async (tx) => {
      await ready(tx);
      await tx.asServiceRole();
      const [out] = await tx.q<{ record_survey_response: number }>(
        `select public.record_survey_response($1, $2, '[]'::jsonb)`,
        ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      );
      expect(out.record_survey_response).toBe(0);
    });
  });
});

describe("RPC-survey_for_member", () => {
  it("null for a session with no survey, null for a member who never attended, the questions for one who did", async () => {
    await withTx(async (tx) => {
      const f = await ready(tx);
      await tx.asOwner();
      const s = await completedSession(tx, f.a, f.a.members[0].memberId);
      const { surveyId, questions } = await surveyOn(tx, f.a, f.a.mod, s.sessionId);

      const read = async (who: Parameters<Tx["as"]>[0], sessionId: string) => {
        await tx.as(who);
        return (await tx.q<{ out: { survey_id: string; answered: boolean; questions: unknown[] } | null }>(
          `select public.survey_for_member($1) as out`, [sessionId],
        ))[0].out;
      };

      // REQ-SUR-001: a session with no survey says nothing about one.
      expect(await read(f.a.members[0].claims, f.m2.a.published)).toBeNull();
      // A member who never attended cannot read the questions by holding the id.
      expect(await read(f.a.members[1].claims, s.sessionId)).toBeNull();
      // Another org's member: the same silence.
      expect(await read(f.b.members[0].claims, s.sessionId)).toBeNull();

      const mine = await read(f.a.members[0].claims, s.sessionId);
      expect(mine).toMatchObject({ survey_id: surveyId, answered: false });
      expect(mine!.questions).toHaveLength(4);
      expect((mine!.questions as { id: string }[]).map((q) => q.id)).toEqual(questions.map((q) => q.id));

      // After answering it still reads, so the screen can say «أجبت» — and the
      // answers are not in it.
      await submit(tx, s.sessionId, fullAnswers(questions));
      const after = await read(f.a.members[0].claims, s.sessionId);
      expect(after).toMatchObject({ answered: true });
      expect(JSON.stringify(after)).not.toContain("مثال عملي أكثر");
    });
  });
});

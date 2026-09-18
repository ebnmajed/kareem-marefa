// worker/src/tasks/record_survey_response.ts — the job that stores a survey
// response (REQ-SUR-004, REQ-SUR-009, DEC-160 §3.5, contract 7).
//
// The SQL is proven in tests/rls/survey-submit.test.ts. What is proven HERE is
// the half a database test cannot see: that nothing this task writes into a log
// line or an error message carries an answer, an id or a payload — because a
// worker log outlives the queue row it came from.
import { describe, expect, it, vi } from "vitest";
import { record_survey_response } from "../../worker/src/tasks/record_survey_response";

type Helpers = Parameters<typeof record_survey_response>[1];

function helpers(written = 3) {
  const query = vi.fn(async () => ({ rows: [{ written }] }));
  const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() };
  return { query, logger } as unknown as Helpers & { query: typeof query; logger: typeof logger };
}

const PAYLOAD = {
  response_id: "11111111-1111-4111-8111-111111111111",
  survey_id: "22222222-2222-4222-8222-222222222222",
  answers: [
    { question_id: "33333333-3333-4333-8333-333333333333", scale_value: 4 },
    { question_id: "44444444-4444-4444-8444-444444444444", text_value: "أكثر من مثال عملي" },
  ],
};

describe("record_survey_response", () => {
  it("calls the one storing function with the payload's three fields, and nothing else", async () => {
    const h = helpers();
    await record_survey_response(PAYLOAD, h);

    expect(h.query).toHaveBeenCalledTimes(1);
    const [sql, params] = h.query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain("public.record_survey_response");
    expect(params).toEqual([PAYLOAD.response_id, PAYLOAD.survey_id, JSON.stringify(PAYLOAD.answers)]);
  });

  it("★ logs a COUNT — no payload, no ids, and no answer text", async () => {
    const h = helpers(5);
    await record_survey_response(PAYLOAD, h);

    expect(h.logger.info).toHaveBeenCalledTimes(1);
    const line = h.logger.info.mock.calls[0][0] as string;
    expect(line).toBe("record_survey_response: stored 1 response with 5 answers");
    for (const secret of [PAYLOAD.response_id, PAYLOAD.survey_id, "أكثر من مثال عملي", "question_id", "scale_value"]) {
      expect(line).not.toContain(secret);
    }
  });

  it("reports zero answers on a replay rather than inventing a number", async () => {
    const h = helpers(0);
    await record_survey_response(PAYLOAD, h);
    expect(h.logger.info.mock.calls[0][0]).toBe("record_survey_response: stored 1 response with 0 answers");
  });

  it("★ refuses a malformed payload by naming the SHAPE, never the contents — award_points.ts's JSON.stringify would be fatal here", async () => {
    const h = helpers();
    const bad = { survey_id: "22222222-2222-4222-8222-222222222222", answers: [{ text_value: "سر" }] };

    await expect(record_survey_response(bad, h)).rejects.toThrow(
      "record_survey_response: malformed payload — expected response_id, survey_id and an answers array",
    );
    await expect(record_survey_response(bad, h)).rejects.not.toThrow(/سر|answers":|survey_id":/);
    expect(h.query).not.toHaveBeenCalled();
  });

  it("refuses anything that is not the shape at all", async () => {
    const h = helpers();
    for (const bad of [null, undefined, 3, "x", {}, { response_id: "a", survey_id: "b" }, { response_id: "a", survey_id: "b", answers: {} }]) {
      await expect(record_survey_response(bad, h)).rejects.toThrow(/malformed payload/);
    }
    expect(h.query).not.toHaveBeenCalled();
  });
});

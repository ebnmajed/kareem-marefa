// ★★ THE TEST THAT WOULD HAVE CAUGHT `/app/admin/surveys/undefined`.
//
// `survey_template_save()` returns `{status, template_id, question_count}` and
// `SaveTemplateOutcome` says `templateId`. The DAL cast the one to the other —
// `data as SaveTemplateOutcome` — which compiles, and is a lie. The editor read
// `outcome.templateId`, got `undefined`, and pushed the browser at
// `/app/admin/surveys/undefined` after a save that had in fact WORKED.
//
// Nothing caught it, and each reason is worth keeping:
//   · `tsc` believes a cast — that is what a cast is;
//   · the RLS suite reads the envelope in SQL's own words, so `template_id` is
//     exactly what it expects to see;
//   · the component test MOCKED the action and returned the camelCase shape,
//     so the mock was more correct than the code it stood in for;
//   · jsdom and the dev server never navigate, so nobody saw the URL.
//
// So this file feeds the DAL the DATABASE'S ACTUAL KEYS and asserts what the
// screens read. It is the only place the two spellings meet.
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({
    session: { orgId: "org", memberId: "me", role: "admin" },
    supabase: { rpc, from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) }) },
  }),
}));

const { attachSurvey, detachSurvey, saveSurveyTemplate, submitSurveyResponse } = await import("@/lib/dal/surveys");

const TEMPLATE = { templateId: null, title: "قالب", questions: [{ kind: "free_text" as const, prompt: "س", required: false, options: [] }] };

beforeEach(() => rpc.mockReset());

describe("saveSurveyTemplate — the envelope the database actually returns", () => {
  it("★ `template_id` becomes `templateId`, because the editor builds a URL out of it", async () => {
    rpc.mockResolvedValue({ data: { status: "ok", template_id: "11111111-1111-4111-8111-111111111111", question_count: 1 }, error: null });

    const outcome = await saveSurveyTemplate("ar", TEMPLATE);
    expect(outcome).toEqual({ status: "ok", templateId: "11111111-1111-4111-8111-111111111111" });
    // The shape of the failure, spelled out: a URL with this in it is the defect.
    expect(`/app/admin/surveys/${(outcome as { templateId: string }).templateId}`).not.toContain("undefined");
  });

  it("carries a refused question's index and field through untouched — the editor puts the error on that card", async () => {
    rpc.mockResolvedValue({ data: { status: "invalid", at: 2, field: "options" }, error: null });
    expect(await saveSurveyTemplate("ar", TEMPLATE)).toEqual({ status: "invalid", at: 2, field: "options" });
  });

  it("passes the plain refusals through by name", async () => {
    for (const status of ["invalid_title", "empty", "title_taken"] as const) {
      rpc.mockResolvedValue({ data: { status }, error: null });
      expect(await saveSurveyTemplate("ar", TEMPLATE)).toEqual({ status });
    }
  });
});

describe("attachSurvey — the same rename, one screen away from being live", () => {
  it("★ `survey_id` becomes `surveyId`: nothing reads it today, which is exactly how the other one survived", async () => {
    rpc.mockResolvedValue({ data: { status: "ok", survey_id: "22222222-2222-4222-8222-222222222222", question_count: 3 }, error: null });

    const outcome = await attachSurvey("ar", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444");
    expect(outcome).toEqual({ status: "ok", surveyId: "22222222-2222-4222-8222-222222222222" });
  });

  it("passes `already_attached` and `template_empty` through by name", async () => {
    for (const status of ["already_attached", "template_empty"] as const) {
      rpc.mockResolvedValue({ data: { status }, error: null });
      expect(await attachSurvey("ar", "33333333-3333-4333-8333-333333333333", "44444444-4444-4444-8444-444444444444")).toEqual({ status });
    }
  });
});

// ★ The other two readers. Their keys are single words today — `missing`,
// `invalid`, `reason` — so a cast would be correct BY LUCK. These cases make
// the rule one rule: the next key somebody adds will be two words, and the next
// reader will copy whatever is beside it.
describe("submitSurveyResponse — the member's own envelope", () => {
  const answers = [{ questionId: "55555555-5555-4555-8555-555555555555", scaleValue: 4 }];
  const submit = () => submitSurveyResponse("ar", "77777777-7777-4777-8777-777777777777", answers);

  it("carries the refused question ids through as arrays the form can index by", async () => {
    rpc.mockResolvedValue({ data: { status: "invalid", missing: ["66666666-6666-4666-8666-666666666666"], invalid: [] }, error: null });
    expect(await submit()).toEqual({ status: "invalid", missing: ["66666666-6666-4666-8666-666666666666"], invalid: [] });
  });

  it("an `invalid` with neither list still gives the form two arrays, never undefined", async () => {
    rpc.mockResolvedValue({ data: { status: "invalid" }, error: null });
    expect(await submit()).toEqual({ status: "invalid", missing: [], invalid: [] });
  });

  it("keeps `not_eligible`'s reason, which is the sentence the member reads", async () => {
    rpc.mockResolvedValue({ data: { status: "not_eligible", reason: "window_closed" }, error: null });
    expect(await submit()).toEqual({ status: "not_eligible", reason: "window_closed" });
  });

  it("passes the four plain outcomes through by name", async () => {
    for (const status of ["ok", "no_survey", "empty", "already_answered"] as const) {
      rpc.mockResolvedValue({ data: { status }, error: null });
      expect(await submit()).toEqual({ status });
    }
  });
});

describe("detachSurvey", () => {
  it("passes its three outcomes through by name", async () => {
    for (const status of ["ok", "no_survey", "has_responses"] as const) {
      rpc.mockResolvedValue({ data: { status }, error: null });
      expect(await detachSurvey("ar", "77777777-7777-4777-8777-777777777777")).toEqual({ status });
    }
  });
});

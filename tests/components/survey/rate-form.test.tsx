// SCR-015's form when the two halves disagree — `DEC-164`.
//
// ★ A required survey question blocks the SURVEY, never the rating. The action
// decides that; what this pins is the half a member actually reads, and it is
// the half that is easy to get wrong: the summary must stop saying «لم نستطع
// إرسال تقييمك» when the rating IS stored, it must say which half went through,
// and every answer the member had already given must still be in the form —
// React resets a `<form action>` after every submission (`DEC-149` §1), so a
// value that is not read back out of the returned state is gone.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { RateForm } from "@/app/[locale]/app/sessions/[id]/rate/rate-form";
import type { MemberSurveyDTO } from "@/lib/dal/surveys";
import ratings from "@/messages/ar/ratings.json";
import survey from "@/messages/ar/survey.json";
import ui from "@/messages/ar/ui.json";

const messages = { ...ratings, ...survey, ...ui };

const submit = vi.hoisted(() => vi.fn());
const update = vi.hoisted(() => vi.fn());
vi.mock("@/app/[locale]/app/sessions/[id]/rate/actions", () => ({ submitRatingAction: submit, updateRatingAction: update }));

const SURVEY: MemberSurveyDTO = {
  surveyId: "s1",
  title: "استبانة ما بعد الجلسة",
  answered: false,
  questions: [
    { id: "q1", kind: "scale_1_5", prompt: "ما مدى وضوح المحتوى؟", required: true, options: [] },
    { id: "q2", kind: "free_text", prompt: "ماذا تقترح؟", required: false, options: [] },
  ],
};

/** What the action returns when the rating went in and the survey did not. */
const RATING_SAVED = {
  errors: { "q:q1": "survey:required" },
  formError: "survey:rating_saved",
  values: { sessionStars: "5", presenterStars: "4", comment: "جلسة ممتازة", "q:q2": "وقت أطول للنقاش" },
  lists: {},
  attempt: 1,
};

function renderForm(surveyProp: MemberSurveyDTO | null = SURVEY) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <RateForm locale="ar" sessionId="sess" checkInId="ci" existing={null} survey={surveyProp} />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  submit.mockReset();
  update.mockReset();
});

describe("RateForm when the survey is refused and the rating is not", () => {
  it("★ says the rating was SAVED and the answers were not — the title never claims the rating failed", async () => {
    const user = userEvent.setup();
    submit.mockResolvedValue(RATING_SAVED);
    renderForm();

    await user.click(screen.getByRole("button", { name: /إرسال التقييم والإجابات/ }));

    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("لم نستطع إرسال إجاباتك");
    expect(summary).toHaveTextContent("حُفظ تقييمك. أكمل الأسئلة المطلوبة لإرسال إجاباتك.");
    // The rating's own summary copy would be a lie here.
    expect(summary).not.toHaveTextContent("لم نستطع إرسال تقييمك");
  });

  it("names the question to fix, in the summary and at the field", async () => {
    const user = userEvent.setup();
    submit.mockResolvedValue(RATING_SAVED);
    renderForm();
    await user.click(screen.getByRole("button", { name: /إرسال التقييم والإجابات/ }));

    const summary = await screen.findByRole("alert");
    expect(within(summary).getByRole("link", { name: /ما مدى وضوح المحتوى؟/ })).toBeTruthy();
    const question = screen.getByRole("radiogroup", { name: /ما مدى وضوح المحتوى؟/ });
    expect(question).toHaveAttribute("aria-invalid", "true");
    expect(question.textContent).toContain("أجب عن هذا السؤال");
  });

  it("★ keeps every value the member had already given — the stars, the comment and the answered question", async () => {
    const user = userEvent.setup();
    submit.mockResolvedValue(RATING_SAVED);
    renderForm();
    await user.click(screen.getByRole("button", { name: /إرسال التقييم والإجابات/ }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const chosen = (screen.getAllByRole("radio") as HTMLInputElement[]).filter((r) => r.checked);
    expect(chosen.map((r) => [r.name, r.value])).toEqual([
      ["sessionStars", "5"],
      ["presenterStars", "4"],
    ]);
    expect((screen.getByRole("textbox", { name: /ملاحظات/ }) as HTMLTextAreaElement).value).toBe("جلسة ممتازة");
    expect((screen.getByRole("textbox", { name: /ماذا تقترح؟/ }) as HTMLTextAreaElement).value).toBe("وقت أطول للنقاش");
  });

  it("a refused WRITE is still the red alert, and still says a write did not happen", async () => {
    const user = userEvent.setup();
    submit.mockResolvedValue({ errors: {}, formError: "window_closed", values: {}, lists: {}, attempt: 1 });
    renderForm();
    await user.click(screen.getByRole("button", { name: /إرسال التقييم والإجابات/ }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("أُغلق باب التقييم لهذه الجلسة");
    expect(alert).not.toHaveTextContent("حُفظ تقييمك");
  });

  it("a session with NO survey keeps the rating's own summary copy and its own button", async () => {
    const user = userEvent.setup();
    submit.mockResolvedValue({ errors: { sessionStars: "starsRequired" }, formError: null, values: {}, lists: {}, attempt: 1 });
    renderForm(null);

    expect(screen.getByRole("button", { name: "إرسال التقييم" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "إرسال التقييم" }));
    const summary = await screen.findByRole("alert");
    expect(summary).toHaveTextContent("لم نستطع إرسال تقييمك");
    expect(summary).not.toHaveTextContent("حُفظ تقييمك");
  });
});

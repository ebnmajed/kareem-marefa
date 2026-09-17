// SCR-064's results, drawn (REQ-SUR-006, REQ-SUR-008, `09` SCR-064).
//
// The component decides NOTHING about what may be shown — `survey_results()`
// has already withheld it — so what is pinned here is that it renders what it
// was given faithfully: a withheld question says so instead of drawing an empty
// chart, every bar carries its own number, and no Arabic-Indic digit reaches
// the screen (DEC-124).
import { render, screen, within } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import { SurveyResults } from "@/components/survey/results";
import type { SurveyResultsDTO } from "@/lib/dal/surveys";
import survey from "@/messages/ar/survey.json";
import ui from "@/messages/ar/ui.json";

const messages = { ...survey, ...ui };

// The components project runs in jsdom, where `next-intl/server` resolves to
// its client build and `getTranslations` throws by design. The translator is
// the real one, over the real Arabic catalogue — `comments.test.tsx`'s pattern.
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "survey.session" }),
}));

const RESULTS: SurveyResultsDTO = {
  status: "ok",
  surveyId: "s1",
  title: "استبانة ما بعد الجلسة",
  attachedAt: null,
  min: 3,
  responseCount: 4,
  eligibleCount: 12,
  questions: [
    {
      id: "q1", kind: "scale_1_5", prompt: "ما مدى وضوح المحتوى؟", required: true,
      answeredCount: 4, withheld: false, mean: 4.25,
      distribution: [
        { value: 1, count: 0 }, { value: 2, count: 0 }, { value: 3, count: 1 }, { value: 4, count: 1 }, { value: 5, count: 2 },
      ],
      texts: null,
    },
    {
      id: "q2", kind: "single_choice", prompt: "هل كانت المدة مناسبة؟", required: false,
      answeredCount: 2, withheld: true, mean: null, distribution: null, texts: null,
    },
    {
      id: "q3", kind: "free_text", prompt: "ماذا تقترح؟", required: false,
      answeredCount: 4, withheld: false, mean: null, distribution: null,
      texts: ["مثال عملي أكثر", "وقت أطول للنقاش"],
    },
  ],
};

/** The component is async (a Server Component): await it into an element. */
async function renderResults(results: SurveyResultsDTO = RESULTS) {
  return render(await SurveyResults({ results }));
}

describe("SurveyResults", () => {
  it("shows the response rate against ELIGIBLE attendees, in Western digits", async () => {
    const { container } = await renderResults();
    expect(screen.getByText("4 / 12")).toBeTruthy();
    expect(screen.getByText(/من 12 حاضرًا مؤهلًا/)).toBeTruthy();
    expect(container.textContent).not.toMatch(/[٠-٩]/);
  });

  it("draws a scale question with its mean and every value of the scale, each bar carrying its own number", async () => {
    await renderResults();
    const scale = screen.getByRole("article", { name: /ما مدى وضوح المحتوى؟/ });
    expect(scale.textContent).toContain("المتوسط 4.25");
    const bars = within(scale).getAllByRole("progressbar");
    expect(bars).toHaveLength(5);                       // 1…5, including the values nobody chose
    expect(bars[0]).toHaveAttribute("aria-valuenow", "0");
    expect(bars[4]).toHaveAttribute("aria-valuenow", "2");
  });

  it("★ a withheld question SAYS SO and draws no chart at all", async () => {
    await renderResults();
    const withheld = screen.getByRole("article", { name: /هل كانت المدة مناسبة؟/ });
    expect(withheld.textContent).toContain("محجوبة");
    expect(within(withheld).queryAllByRole("progressbar")).toHaveLength(0);
  });

  it("free text is a list, each answer bidi-isolated", async () => {
    await renderResults();
    const texts = screen.getByRole("article", { name: /ماذا تقترح؟/ });
    const items = within(texts).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["مثال عملي أكثر", "وقت أطول للنقاش"]);
    expect(items[0].querySelector("bdi")).toBeTruthy();
  });

  it("a session nobody attended says so rather than showing a rate over zero", async () => {
    await renderResults({ ...RESULTS, responseCount: 0, eligibleCount: 0, questions: [] });
    expect(screen.getByText("لا حضور مؤهلون لهذه الجلسة بعد")).toBeTruthy();
    expect(screen.queryByText("0 / 0")).toBeNull();
  });
});

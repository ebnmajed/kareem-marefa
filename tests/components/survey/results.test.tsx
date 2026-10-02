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
import type { PresenterAggregate } from "@/lib/dal/ratings";
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
      answeredCount: null, withheld: true, mean: null, distribution: null, texts: null,
    },
    {
      id: "q3", kind: "free_text", prompt: "ماذا تقترح؟", required: false,
      answeredCount: 4, withheld: false, mean: null, distribution: null,
      texts: ["مثال عملي أكثر", "وقت أطول للنقاش"],
    },
  ],
};

const RATING: PresenterAggregate = { ratingCount: 9, sessionAvg: 4.6, presenterAvg: 4.8, comments: [] };

/** The component is async (a Server Component): await it into an element. */
async function renderResults(results: SurveyResultsDTO = RESULTS, rating: PresenterAggregate | null = RATING, ratingCount = 9) {
  return render(await SurveyResults({ results, rating, ratingCount }));
}

describe("SurveyResults", () => {
  it("shows the response rate against ELIGIBLE attendees, in Western digits", async () => {
    const { container } = await renderResults();
    expect(screen.getByText("4 / 12")).toBeTruthy();
    expect(screen.getByText("33%")).toBeTruthy();
    expect(container.textContent).not.toMatch(/[٠-٩]/);
  });

  it("draws a scale question with its mean and every value of the scale, each bar carrying its own number", async () => {
    await renderResults();
    const scale = screen.getByRole("article", { name: /ما مدى وضوح المحتوى؟/ });
    expect(scale.textContent).toContain("المتوسط 4.25");
    const bars = within(scale).getAllByRole("progressbar");
    expect(bars).toHaveLength(5);                       // 5…1, including the values nobody chose
    expect(bars[0]).toHaveAttribute("aria-valuenow", "2");
    expect(bars[4]).toHaveAttribute("aria-valuenow", "0");
  });

  it("★ every bar carries its label and its count as VISIBLE TEXT, not only in aria", async () => {
    const { container } = await renderResults();
    const scale = screen.getByRole("article", { name: /ما مدى وضوح المحتوى؟/ });

    // Five unlabelled grey lines is what this replaces: a sighted reader could
    // not tell «4 chose 3» from «3 chose 4».
    const rows = within(scale).getAllByRole("listitem");
    expect(rows).toHaveLength(5);
    expect(rows.map((li) => li.textContent?.trim())).toEqual(["5 نجوم2", "4 نجوم1", "3 نجوم1", "نجمتان0", "نجمة0"]);

    // The bar's own aria is unchanged, so the two audiences read the same thing.
    const bars = within(scale).getAllByRole("progressbar");
    expect(bars[0]).toHaveAttribute("aria-valuenow", "2");
    expect(container.textContent).not.toMatch(/[٠-٩]/);
  });

  it("a choice question shows its option labels beside the bars, bidi-isolated", async () => {
    await renderResults({
      ...RESULTS,
      questions: [{
        id: "q4", kind: "single_choice", prompt: "هل كانت المدة مناسبة؟", required: false,
        answeredCount: 4, withheld: false, mean: null,
        distribution: [{ id: "o1", label: "قصيرة", count: 1 }, { id: "o2", label: "مناسبة", count: 3 }],
        texts: null,
      }],
    });
    const question = screen.getByRole("article", { name: /هل كانت المدة مناسبة؟/ });
    const rows = within(question).getAllByRole("listitem");
    expect(rows.map((li) => li.textContent?.trim())).toEqual(["قصيرة1", "مناسبة3"]);
    expect(within(question).getAllByText("مناسبة")[0].closest("bdi")).toBeTruthy();
  });

  it("★ a withheld question SAYS SO, draws no chart — and publishes no count either", async () => {
    await renderResults();
    const withheld = screen.getByRole("article", { name: /هل كانت المدة مناسبة؟/ });
    expect(withheld.textContent).toContain("محجوبة");
    expect(within(withheld).queryAllByRole("progressbar")).toHaveLength(0);
    // `answeredCount` is null (DEC-163), so there is no «أجاب عنها …» line at
    // all: two reads a response apart would otherwise name the question the
    // newest respondent answered.
    expect(withheld.textContent).not.toMatch(/إجاب/);
  });

  it("free text is a list, each answer bidi-isolated", async () => {
    await renderResults();
    const texts = screen.getByRole("article", { name: /ماذا تقترح؟/ });
    const items = within(texts).getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["«مثال عملي أكثر»", "«وقت أطول للنقاش»"]);
    expect(items[0].querySelector("bdi")).toBeTruthy();
  });

  it("a session nobody attended says so rather than showing a rate over zero", async () => {
    await renderResults({ ...RESULTS, status: "withheld", responseCount: null, eligibleCount: 0, questions: [] });
    expect(screen.getByText("لا حضور مؤهلون لهذه الجلسة بعد")).toBeTruthy();
    expect(screen.queryByText("0 / 0")).toBeNull();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it("★ each figure says WHICH instrument it is — the survey's two, the rating's two (DEC-074, DEC-232)", async () => {
    await renderResults();
    expect(screen.getByText("استجابات الاستبانة")).toBeTruthy();
    expect(screen.getByText("نسبة الرد على الاستبانة")).toBeTruthy();
    expect(screen.getByText("متوسط تقييم الجلسة")).toBeTruthy();
    expect(screen.getByText("متوسط تقييم المُقدِّم")).toBeTruthy();
    expect(screen.getByText("4.6")).toBeTruthy();
    expect(screen.getByText("4.8")).toBeTruthy();
  });

  it("★ a withheld survey shows «—», never a 0 the withhold did not release, and no question at all", async () => {
    await renderResults({ ...RESULTS, status: "withheld", responseCount: null, questions: [] });
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.queryByText(/ \/ 12/)).toBeNull();
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    // The rating is a second instrument with its own minimum: its averages still show.
    expect(screen.getByText("4.6")).toBeTruthy();
  });

  it("★ the rating below ITS minimum: the averages are «—» and only the count is said (REQ-RAT-006)", async () => {
    await renderResults(RESULTS, null, 2);
    expect(screen.getAllByText("—")).toHaveLength(2);
    expect(screen.getAllByText("تقييمان")).toHaveLength(2);
  });

  it("★ the anonymity line tells the truth — never the presenter — and reads the minimum (REQ-SUR-005, DEC-232)", async () => {
    await renderResults({ ...RESULTS, min: 5 });
    const line = screen.getByText(/مجهولة/);
    expect(line.textContent).toContain("لا يراها المُقدِّم");
    expect(line.textContent).toContain("5 استجابات");
    expect(line.textContent).not.toMatch(/يراها المشرفون والمُقدِّم/);
  });
});

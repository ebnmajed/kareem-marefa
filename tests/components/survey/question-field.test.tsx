// `components/survey/question-field.tsx` — one survey question as a member
// answers it (REQ-SUR-002, REQ-UIX-009, REQ-UIX-010).
//
// What is worth pinning here, rather than in a browser: that each of the four
// types is ONE named group with real controls in it, that a required question
// says so and an error is ASSOCIATED with the group rather than merely sitting
// near it, and that a prompt written by staff is bidi-isolated — a question
// ending in a Latin product name would otherwise drag its punctuation across
// the line in Arabic.
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { SurveyQuestionField } from "@/components/survey/question-field";
import type { SurveyQuestionDTO } from "@/lib/dal/surveys";
import survey from "@/messages/ar/survey.json";
import ui from "@/messages/ar/ui.json";

const messages = { ...survey, ...ui };

const question = (over: Partial<SurveyQuestionDTO> = {}): SurveyQuestionDTO => ({
  id: "11111111-1111-4111-8111-111111111111",
  kind: "scale_1_5",
  prompt: "ما مدى وضوح المحتوى؟",
  required: false,
  options: [],
  ...over,
});

function renderQuestion(q: SurveyQuestionDTO, props: Partial<Parameters<typeof SurveyQuestionField>[0]> = {}) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <form data-testid="form">
        <SurveyQuestionField question={q} name={`q:${q.id}`} {...props} />
      </form>
    </NextIntlClientProvider>,
  );
}

describe("SurveyQuestionField", () => {
  it("a scale is one radiogroup named by the prompt, with five radios in ascending order and Western digits", () => {
    renderQuestion(question());
    const group = screen.getByRole("radiogroup", { name: /ما مدى وضوح المحتوى؟/ });
    const radios = within(group).getAllByRole("radio");
    expect(radios).toHaveLength(5);
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(["1", "2", "3", "4", "5"]);
    // ★ The digit is what is SEEN — a scale reads as 1 2 3 4 5 — while each
    // radio is ANNOUNCED as «واحد من 5», the split `star-rating.tsx` uses so a
    // bare number is never read out of context. Western digits either way,
    // never ١ (DEC-124).
    expect(within(group).getByText("1", { selector: '[aria-hidden="true"]' })).toBeTruthy();
    expect(radios[0]).toHaveAccessibleName("واحد من 5");
    expect(radios[4]).toHaveAccessibleName("5 من 5");
    expect(group.textContent).not.toMatch(/[٠-٩]/);
  });

  it("a single choice is a radiogroup of the authored options, in their order", () => {
    renderQuestion(question({ kind: "single_choice", prompt: "هل كانت المدة مناسبة؟", options: [
      { id: "o1", label: "قصيرة" }, { id: "o2", label: "مناسبة" }, { id: "o3", label: "طويلة" },
    ] }));
    const group = screen.getByRole("radiogroup", { name: /هل كانت المدة مناسبة؟/ });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => (r as HTMLInputElement).value)).toEqual(["o1", "o2", "o3"]);
    expect(group.textContent).toContain("قصيرة");
  });

  it("a multiple choice is a group of checkboxes with its own hint, and what was chosen comes back checked", () => {
    renderQuestion(
      question({ kind: "multi_choice", prompt: "ما الذي أعجبك؟", options: [
        { id: "o1", label: "الأمثلة" }, { id: "o2", label: "الإيقاع" }, { id: "o3", label: "النقاش" },
      ] }),
      { defaultList: ["o1", "o3"] },
    );
    const group = screen.getByRole("group", { name: /ما الذي أعجبك؟/ });
    const boxes = within(group).getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.value)).toEqual(["o1", "o2", "o3"]);
    expect(boxes.map((b) => b.checked)).toEqual([true, false, true]);
    expect(group.textContent).toContain("يمكنك اختيار أكثر من إجابة");
  });

  it("free text is a labelled textarea that reads back what was typed", () => {
    renderQuestion(question({ kind: "free_text", prompt: "ماذا تقترح؟" }), { defaultValue: "مثال عملي أكثر" });
    const box = screen.getByRole("textbox", { name: /ماذا تقترح؟/ }) as HTMLTextAreaElement;
    expect(box.value).toBe("مثال عملي أكثر");
    expect(box.maxLength).toBe(2000);
  });

  it("★ a required question says «مطلوب», and an error is ASSOCIATED with the group, not merely next to it", () => {
    renderQuestion(question({ required: true }), { error: "أجب عن هذا السؤال" });
    const group = screen.getByRole("radiogroup", { name: /ما مدى وضوح المحتوى؟/ });
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAttribute("aria-required", "true");
    expect(group.textContent).toContain("مطلوب");

    const describedBy = group.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    const described = describedBy!.split(" ").map((id) => document.getElementById(id)?.textContent ?? "").join(" ");
    expect(described).toContain("أجب عن هذا السؤال");
  });

  it("★ the staff-written prompt is bidi-isolated wherever it is rendered", () => {
    const { container } = renderQuestion(question({ prompt: "ما رأيك في Next.js؟" }));
    const isolated = Array.from(container.querySelectorAll("bdi")).map((b) => b.textContent);
    expect(isolated).toContain("ما رأيك في Next.js؟");
  });

  it("a scale that came back from a failed round trip is still chosen", () => {
    renderQuestion(question(), { defaultValue: "4" });
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios.filter((r) => r.checked).map((r) => r.value)).toEqual(["4"]);
  });

  it("every control carries the question's field name, so the action reads one answer per question", () => {
    renderQuestion(question({ kind: "multi_choice", options: [{ id: "o1", label: "أ" }, { id: "o2", label: "ب" }] }));
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(new Set(boxes.map((b) => b.name))).toEqual(new Set(["q:11111111-1111-4111-8111-111111111111"]));
  });
});

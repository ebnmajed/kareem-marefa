// SCR-065's editor — the questions an org asks again and again (REQ-SUR-002,
// REQ-DSG-028, SC 2.5.7, DEC-160 §5).
//
// What is pinned here is what a browser would not tell me more cheaply: that a
// question moves WITH A CLICK and carries its own text with it (the keys are
// stable across a reorder, which an index-keyed list would get wrong the moment
// two rows swapped), that the array order is what the save sends, and that a
// refusal lands on the field it belongs to.
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { TemplateEditor } from "@/app/[locale]/app/admin/surveys/[templateId]/template-editor";
import type { SurveyTemplateDTO } from "@/lib/dal/surveys";
import survey from "@/messages/ar/survey.json";
import ui from "@/messages/ar/ui.json";

const messages = { ...survey, ...ui };

const router = { push: vi.fn(), refresh: vi.fn() };
vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  useRouter: () => router,
}));

const save = vi.hoisted(() => vi.fn(async () => ({ status: "ok", templateId: "99999999-9999-4999-8999-999999999999" })));
const remove = vi.hoisted(() => vi.fn(async () => ({ status: "ok" as const })));
vi.mock("@/app/[locale]/app/admin/surveys/[templateId]/actions", () => ({ saveTemplate: save, removeTemplate: remove }));

const TEMPLATE: SurveyTemplateDTO = {
  id: "11111111-1111-4111-8111-111111111111",
  title: "استبانة ما بعد الجلسة",
  questions: [
    { id: "q1", kind: "scale_1_5", prompt: "ما مدى وضوح المحتوى؟", required: true, options: [] },
    { id: "q2", kind: "single_choice", prompt: "هل كانت المدة مناسبة؟", required: false, options: [{ id: "o1", label: "قصيرة" }, { id: "o2", label: "مناسبة" }] },
    { id: "q3", kind: "free_text", prompt: "ماذا تقترح؟", required: false, options: [] },
  ],
};

function renderEditor(template: SurveyTemplateDTO | null = TEMPLATE) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      <TemplateEditor locale="ar" template={template} />
    </NextIntlClientProvider>,
  );
}

const prompts = () => screen.getAllByLabelText(/نص السؤال/).map((input) => (input as HTMLInputElement).value);

/** The questions list's OWN rows — `:scope > li`, because a choice question
 *  nests a second reorderable list inside its own row and its options are
 *  `listitem`s too. */
const questionRows = () =>
  Array.from(screen.getByRole("list", { name: "أسئلة الاستبانة" }).querySelectorAll(":scope > li")) as HTMLElement[];

/** A row's own ▲▼ — the last child of the row, beside `renderActions`; the
 *  nested option list's arrows are inside `renderItem`, which comes first. */
const rowControls = (row: HTMLElement) => within(row.querySelector(":scope > div:last-child") as HTMLElement);

beforeEach(() => {
  save.mockClear();
  remove.mockClear();
  router.push.mockClear();
  router.refresh.mockClear();
});

describe("TemplateEditor", () => {
  it("renders the template's questions in their order, each with its own text", () => {
    renderEditor();
    expect((screen.getByLabelText(/اسم القالب/) as HTMLInputElement).value).toBe("استبانة ما بعد الجلسة");
    expect(prompts()).toEqual(["ما مدى وضوح المحتوى؟", "هل كانت المدة مناسبة؟", "ماذا تقترح؟"]);
  });

  it("★ a CLICK alone moves a question, and the row's own text moves with it (SC 2.5.7)", async () => {
    const user = userEvent.setup();
    renderEditor();
    // The second row's ▼ — named «انقل لأسفل» and described by the row it moves.
    await user.click(rowControls(questionRows()[1]).getByRole("button", { name: "انقل لأسفل" }));
    expect(prompts()).toEqual(["ما مدى وضوح المحتوى؟", "ماذا تقترح؟", "هل كانت المدة مناسبة؟"]);

    // And back up again, which is the same gesture in the other direction.
    await user.click(rowControls(questionRows()[2]).getByRole("button", { name: "انقل لأعلى" }));
    expect(prompts()).toEqual(["ما مدى وضوح المحتوى؟", "هل كانت المدة مناسبة؟", "ماذا تقترح؟"]);
  });

  it("★ the ARRAY ORDER is what the save sends — no position ever leaves the browser", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(rowControls(questionRows()[0]).getByRole("button", { name: "انقل لأسفل" }));
    await user.click(screen.getByRole("button", { name: "حفظ القالب" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const [, input] = save.mock.calls[0] as unknown as [string, { templateId: string; title: string; questions: { prompt: string }[] }];
    expect(input.templateId).toBe(TEMPLATE.id);
    expect(input.questions.map((q) => q.prompt)).toEqual(["هل كانت المدة مناسبة؟", "ما مدى وضوح المحتوى؟", "ماذا تقترح؟"]);
    expect(JSON.stringify(input)).not.toContain("position");
  });

  it("a new question is added at the end, named «سؤال 4» until it is written", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "أضف سؤالًا" }));
    const rows = questionRows();
    expect(rows).toHaveLength(4);
    // The arrows of the empty row are described by its fallback name, in
    // Western digits (DEC-124) — an unnamed row would leave twelve identical
    // «انقل لأعلى» buttons with nothing to tell them apart.
    expect(rowControls(rows[3]).getByRole("button", { name: "انقل لأعلى" })).toHaveAccessibleDescription("سؤال 4");
  });

  it("choosing a choice type seeds two empty options, because one option is not a choice", async () => {
    const user = userEvent.setup();
    renderEditor(null);
    await user.click(screen.getByRole("button", { name: "أضف سؤالًا" }));
    await user.selectOptions(screen.getByLabelText(/نوع السؤال/), "multi_choice");
    expect(screen.getAllByLabelText(/نص الخيار/)).toHaveLength(2);
  });

  it("★ a question with no text is refused AT the field and in the summary, and nothing is sent", async () => {
    const user = userEvent.setup();
    renderEditor(null);
    await user.type(screen.getByLabelText(/اسم القالب/), "قالب");
    await user.click(screen.getByRole("button", { name: "أضف سؤالًا" }));
    await user.click(screen.getByRole("button", { name: "حفظ القالب" }));

    expect(save).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent("لم نستطع حفظ القالب");
    expect(screen.getAllByText("اكتب نص السؤال").length).toBeGreaterThan(0);
  });

  it("a template with no name at all is refused without reaching the database", async () => {
    const user = userEvent.setup();
    renderEditor(null);
    await user.click(screen.getByRole("button", { name: "حفظ القالب" }));
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText("اكتب اسمًا للقالب")).toBeTruthy();
  });

  it("a name the org already uses comes back from the database and lands on the name field", async () => {
    const user = userEvent.setup();
    save.mockResolvedValueOnce({ status: "title_taken" } as never);
    renderEditor();
    await user.click(screen.getByRole("button", { name: "حفظ القالب" }));
    await waitFor(() => expect(screen.getByText("يوجد قالب بهذا الاسم")).toBeTruthy());
  });

  it("deleting asks first, and only the second press calls the action", async () => {
    const user = userEvent.setup();
    renderEditor();
    await user.click(screen.getByRole("button", { name: "احذف القالب" }));
    expect(remove).not.toHaveBeenCalled();
    expect(screen.getByText(/هل تحذف هذا القالب؟/)).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "احذف القالب" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith("ar", TEMPLATE.id));
  });
});

// SCR-065's two tables (REQ-UIX-106, REQ-SUR-002, DEC-232).
//
// Selection is a link the server reads, never client state; the type names are REQ-SUR-002's, the editor's own;
// the artboard's «افتراضي» has no column and is absent; every count is Western and bidi-isolated (DEC-124); the
// row's ⋯ is named by the template it acts on.
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { TemplateQuestionsTable, TemplatesTable, type TemplateRow } from "@/components/survey/templates-table";
import admin from "@/messages/ar/admin.json";
import survey from "@/messages/ar/survey.json";
import ui from "@/messages/ar/ui.json";

const messages = { ...survey, ...ui, ...admin };

const ROWS: TemplateRow[] = [
  { id: "11111111-1111-4111-8111-111111111111", title: "التقييم القياسي", questionCount: 4, sessionCount: 38 },
  { id: "22222222-2222-4222-8222-222222222222", title: "ورشة عملية", questionCount: 6, sessionCount: 0 },
];

function wrap(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe("TemplatesTable", () => {
  it("draws name · questions · sessions, the counts Western and isolated — and no «افتراضي»", () => {
    const { container } = wrap(<TemplatesTable rows={ROWS} selectedId={ROWS[0].id} />);
    const table = screen.getByRole("table", { name: "قوالب الاستبانات" });
    expect(within(table).getAllByRole("columnheader").map((th) => th.textContent)).toEqual(["القالب", "الأسئلة", "الجلسات", "إجراءات"]);
    expect(within(table).getByText("38").closest("bdi")).toBeTruthy();
    expect(container.textContent).not.toContain("افتراضي");
    expect(container.textContent).not.toMatch(/[٠-٩]/);
  });

  it("★ selecting is a LINK to ?template=<id>, and the selected one says so", () => {
    wrap(<TemplatesTable rows={ROWS} selectedId={ROWS[1].id} />);
    const table = screen.getByRole("table", { name: "قوالب الاستبانات" });
    const second = within(table).getByRole("link", { name: "ورشة عملية" });
    expect(second.getAttribute("href")).toContain(`/app/admin/surveys?template=${ROWS[1].id}`);
    expect(second).toHaveAttribute("aria-current", "true");
    expect(within(table).getByRole("link", { name: "التقييم القياسي" })).not.toHaveAttribute("aria-current");
  });

  it("the row's ⋯ is named by the template it acts on", () => {
    wrap(<TemplatesTable rows={ROWS} selectedId={null} />);
    const table = screen.getByRole("table", { name: "قوالب الاستبانات" });
    expect(within(table).getByRole("button", { name: "إجراءات القالب ورشة عملية" })).toBeTruthy();
  });

  it("no templates: the empty state and its way out", () => {
    wrap(<TemplatesTable rows={[]} selectedId={null} />);
    expect(screen.getByText("لا قوالب بعد")).toBeTruthy();
    expect(screen.getByRole("link", { name: "قالب جديد" }).getAttribute("href")).toContain("/app/admin/surveys/new");
  });
});

describe("TemplateQuestionsTable", () => {
  it("★ question · type · required, the types in REQ-SUR-002's names, the prompt isolated", () => {
    wrap(
      <TemplateQuestionsTable
        templateId={ROWS[0].id}
        title="التقييم القياسي"
        rows={[
          { id: "q1", prompt: "ما مدى وضوح المحتوى؟", kind: "scale_1_5", required: true },
          { id: "q2", prompt: "ما الذي نفعك؟", kind: "free_text", required: false },
        ]}
      />,
    );
    const table = screen.getByRole("table", { name: "أسئلة القالب التقييم القياسي" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => Array.from(r.querySelectorAll("td")).map((td) => td.textContent))).toEqual([
      ["ما مدى وضوح المحتوى؟", "مقياس 1–5", "نعم"],
      ["ما الذي نفعك؟", "نص حر", "لا"],
    ]);
    expect(within(table).getByText("ما مدى وضوح المحتوى؟").closest("bdi")).toBeTruthy();
  });
});

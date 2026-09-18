// `getSurveyExportRows()` — contract 6's rows, ALREADY WITHHELD
// (REQ-SUR-006, REQ-SUR-007, DEC-160 §3.3).
//
// The withhold itself is the database's and is proven in
// `tests/rls/survey-results.test.ts`; what is proven here is that the shaping
// keeps every promise the CSV makes to a spreadsheet — Western digits, numeric
// columns carrying nothing but numbers, and a withheld result that is one row
// SAYING SO rather than an empty file, which a reader would take for «nobody
// answered».
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const rpc = vi.fn();
const sessionRow = vi.fn(() => ({ data: { title: "كيف نقرأ ميزانية الفريق" } }));

vi.mock("@/lib/dal/session", () => ({
  sessionClient: async () => ({
    session: { orgId: "org", memberId: "me", role: "admin" },
    supabase: {
      rpc,
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: sessionRow }) }) }),
    },
  }),
}));

const { getSurveyExportRows } = await import("@/lib/dal/surveys");

const OK = {
  status: "ok",
  survey_id: "s1",
  title: "استبانة ما بعد الجلسة",
  min: 3,
  response_count: 4,
  eligible_count: 12,
  questions: [
    {
      id: "q1", kind: "scale_1_5", prompt: "ما مدى وضوح المحتوى؟", required: true,
      answered_count: 4, withheld: false, mean: 4.25,
      distribution: [
        { value: 1, count: 0 }, { value: 2, count: 0 }, { value: 3, count: 1 }, { value: 4, count: 1 }, { value: 5, count: 2 },
      ],
      texts: null,
    },
    { id: "q2", kind: "single_choice", prompt: "هل كانت المدة مناسبة؟", required: false, answered_count: null, withheld: true, mean: null, distribution: null, texts: null },
    { id: "q3", kind: "free_text", prompt: "ماذا تقترح؟", required: false, answered_count: 4, withheld: false, mean: null, distribution: null, texts: ["مثال عملي أكثر", "وقت أطول"] },
  ],
};

beforeEach(() => {
  rpc.mockReset();
  sessionRow.mockClear();
});

describe("getSurveyExportRows", () => {
  it("a session with no survey exports nothing at all — the route answers 404 rather than an empty file", async () => {
    rpc.mockResolvedValue({ data: { status: "no_survey" }, error: null });
    expect(await getSurveyExportRows("ar", "11111111-1111-4111-8111-111111111111")).toBeNull();
  });

  it("★ a withheld result is ONE ROW saying so, never an empty file", async () => {
    rpc.mockResolvedValue({ data: { status: "withheld", survey_id: "s1", title: "t", min: 3, eligible_count: 9 }, error: null });
    const sheet = (await getSurveyExportRows("ar", "11111111-1111-4111-8111-111111111111"))!;

    expect(sheet.withheld).toBe(true);
    expect(sheet.rows).toHaveLength(1);
    expect(sheet.rows[0][0]).toContain("محجوبة");
    // No answer, no count of responses, no distribution reaches the file.
    expect(JSON.stringify(sheet.rows)).not.toContain("مثال");
  });

  it("★ the rows a spreadsheet can pivot: the rate first, then one row per value, with the numbers alone in the numeric columns", async () => {
    rpc.mockResolvedValue({ data: OK, error: null });
    const sheet = (await getSurveyExportRows("ar", "11111111-1111-4111-8111-111111111111"))!;

    expect(sheet.sessionTitle).toBe("كيف نقرأ ميزانية الفريق");
    expect(sheet.headers).toEqual(["السؤال", "النوع", "عدد المجيبين", "القيمة", "العدد", "المتوسط"]);

    // The response rate, in the same columns, both numbers parseable.
    expect(sheet.rows[0]).toEqual(["نسبة الاستجابة", "ملخص", "4", "من الحضور المؤهلين", "12", ""]);

    // The scale: five rows, its mean repeated so any row of the group carries it.
    const scale = sheet.rows.filter((r) => r[0] === "ما مدى وضوح المحتوى؟");
    expect(scale).toHaveLength(5);
    expect(scale.map((r) => [r[3], r[4]])).toEqual([["1", "0"], ["2", "0"], ["3", "1"], ["4", "1"], ["5", "2"]]);
    expect(scale.every((r) => r[5] === "4.25")).toBe(true);
    expect(scale.every((r) => r[1] === "مقياس 1–5")).toBe(true);

    // ★ The withheld question keeps its row and says «محجوبة» — the file must
    // not silently lose a question, which would read as «nobody asked it».
    const withheld = sheet.rows.filter((r) => r[0] === "هل كانت المدة مناسبة؟");
    // ★ An EMPTY cell where its count would be: a withheld question releases no
    // number at all (DEC-163), and a zero would be a number it did not release.
    expect(withheld).toEqual([["هل كانت المدة مناسبة؟", "اختيار واحد", "", "محجوبة", "", ""]]);

    // Free text: one row per answer, the text in the value column.
    const texts = sheet.rows.filter((r) => r[0] === "ماذا تقترح؟");
    expect(texts.map((r) => r[3])).toEqual(["مثال عملي أكثر", "وقت أطول"]);

    // Every numeric cell is Western digits and nothing else (DEC-124), so Excel
    // parses the columns as numbers instead of text.
    for (const row of sheet.rows) {
      for (const cell of [row[2], row[4], row[5]]) {
        expect(cell).not.toMatch(/[٠-٩]/);
        if (cell !== "") expect(cell).toMatch(/^\d+(\.\d+)?$/);
      }
    }
  });

  it("★ a formula-looking answer is handed over RAW — `buildCsv()` neutralises it, and twice would be wrong", async () => {
    // A member can write «=SUM(A1:A9)» in a free-text answer, and Excel would
    // run it in an admin's spreadsheet. `buildCsv()` prefixes an apostrophe
    // (the lead's, `DEC-163`); this file must NOT do it too, or the admin reads
    // «''=SUM…» and the escape becomes the bug it was written to prevent.
    rpc.mockResolvedValue({
      data: { ...OK, questions: [{ id: "q3", kind: "free_text", prompt: "ماذا تقترح؟", required: false, answered_count: 4, withheld: false, mean: null, distribution: null, texts: ["=SUM(A1:A9)", "+1 أفضل"] }] },
      error: null,
    });
    const sheet = (await getSurveyExportRows("ar", "11111111-1111-4111-8111-111111111111"))!;
    expect(sheet.rows.filter((r) => r[0] === "ماذا تقترح؟").map((r) => r[3])).toEqual(["=SUM(A1:A9)", "+1 أفضل"]);
  });

  it("a question nobody answered still has a row, so the file lists every question asked", async () => {
    rpc.mockResolvedValue({
      data: { ...OK, questions: [{ id: "q3", kind: "free_text", prompt: "ماذا تقترح؟", required: false, answered_count: 0, withheld: false, mean: null, distribution: null, texts: [] }] },
      error: null,
    });
    const sheet = (await getSurveyExportRows("ar", "11111111-1111-4111-8111-111111111111"))!;
    expect(sheet.rows.filter((r) => r[0] === "ماذا تقترح؟")).toEqual([["ماذا تقترح؟", "نص حر", "0", "", "", ""]]);
  });
});

// `<FormSummary>` — ask 5. `16` §8.2 item 4, REQ-UIX-010, REQ-UIX-017, DEC-091.
//
// The distinction being proven is the whole feature: the M2 proposal form has
// a summary and it lists SENTENCES. This one lists LINKS, and a link moves
// focus to the control — «الفئة: اختر تصنيفًا» lands on the select.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { FormSummary } from "@/components/ui/form-summary";
import type { FormSummaryError } from "@/components/ui";

const TITLE = "تعذّر إرسال النموذج";

const ERRORS: FormSummaryError[] = [
  { fieldId: "title", label: "العنوان", message: "فضلًا أدخل عنوان موضوعك" },
  { fieldId: "categoryId", label: "الفئة", message: "اختر تصنيفًا" },
];

// jsdom has no layout engine — see the note in field.test.tsx.
async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

/** The shape a real form renders: the summary above the controls it names. */
function Form({ errors = ERRORS, attempt = 1 }: { errors?: FormSummaryError[]; attempt?: number }) {
  return (
    <form noValidate>
      <FormSummary key={attempt} title={TITLE} errors={errors} />
      <label htmlFor="title">العنوان</label>
      <input id="title" name="title" />
      <label htmlFor="categoryId">الفئة</label>
      <select id="categoryId" name="categoryId">
        <option value="">اختر تصنيفًا</option>
      </select>
      <fieldset id="level">
        <legend>المستوى</legend>
        <label htmlFor="level-introductory">تمهيدي</label>
        <input id="level-introductory" type="radio" name="level" value="introductory" />
      </fieldset>
    </form>
  );
}

describe("FormSummary — what it says", () => {
  it("renders nothing at all when nothing failed", () => {
    const { container } = render(<FormSummary title={TITLE} errors={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("announces itself, and names each failure «الحقل: الرسالة»", () => {
    render(<Form />);
    const summary = screen.getByRole("alert");
    expect(summary).toHaveTextContent(TITLE);
    expect(screen.getByRole("link", { name: "العنوان: فضلًا أدخل عنوان موضوعك" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "الفئة: اختر تصنيفًا" })).toBeInTheDocument();
  });

  it("★ every failure is a LINK, not a sentence — one per failed field", () => {
    render(<Form />);
    // This is the M2 defect, in one assertion.
    expect(screen.getAllByRole("link")).toHaveLength(ERRORS.length);
  });

  it("bidi-isolates the field name, which is an interpolated value", () => {
    const { container } = render(<Form />);
    const names = [...container.querySelectorAll("bdi")].map((b) => b.textContent);
    expect(names).toEqual(["العنوان", "الفئة"]);
  });

  it("keeps a real href, so the link survives a middle-click and a dead script", () => {
    render(<Form />);
    expect(screen.getByRole("link", { name: /العنوان/ })).toHaveAttribute("href", "#title");
  });

  it("carries the failure on more than colour — the glyph and the words are there too", () => {
    const { container } = render(<Form />);
    expect(container.querySelector('[role="alert"] svg')).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: new RegExp(TITLE) })).toBeInTheDocument();
  });
});

describe("FormSummary — focus", () => {
  it("takes focus itself when it appears, so the reader is told what happened", () => {
    render(<Form />);
    expect(document.activeElement).toBe(screen.getByRole("alert"));
  });

  it("★ re-takes focus on the NEXT failed attempt, with identical errors", () => {
    const { rerender } = render(<Form attempt={1} />);
    // The member reads the summary, tabs away, submits again, fails the same way.
    screen.getByRole("link", { name: /العنوان/ }).focus();
    expect(document.activeElement).not.toBe(screen.getByRole("alert"));

    rerender(<Form attempt={2} />);
    // `key={state.attempt}` remounts it; an effect watching the error list
    // would not have fired, because the errors did not change.
    expect(document.activeElement).toBe(screen.getByRole("alert"));
  });

  it("does not re-take focus while the same attempt is on screen", () => {
    const { rerender } = render(<Form attempt={1} />);
    screen.getByRole("link", { name: /العنوان/ }).focus();
    rerender(<Form attempt={1} />);
    expect(document.activeElement).not.toBe(screen.getByRole("alert"));
  });
});

describe("FormSummary — the link moves focus to the control", () => {
  it("focuses the input it names", async () => {
    render(<Form />);
    await userEvent.click(screen.getByRole("link", { name: /العنوان/ }));
    expect(document.activeElement).toBe(screen.getByRole("textbox"));
  });

  it("focuses the SELECT, which is the case «الفئة: اختر تصنيفًا» names", async () => {
    render(<Form />);
    await userEvent.click(screen.getByRole("link", { name: /الفئة/ }));
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
  });

  it("★ focuses the first control inside a group, not the group", async () => {
    render(<Form errors={[{ fieldId: "level", label: "المستوى", message: "اختر مستوى الجلسة" }]} />);
    await userEvent.click(screen.getByRole("link", { name: /المستوى/ }));
    // A <fieldset> is not focusable: `focus()` on it would do nothing at all
    // and the member would be left where they were.
    expect(document.activeElement).toBe(screen.getByRole("radio"));
  });

  it("leaves the anchor alone when the id names nothing on the page", async () => {
    render(<Form errors={[{ fieldId: "gone", label: "حقل", message: "رسالة" }]} />);
    const link = screen.getByRole("link");
    await userEvent.click(link);
    // No throw, no stolen focus, and the href is still the browser's business.
    expect(link).toHaveAttribute("href", "#gone");
  });
});

describe("★ REQ-UIX-017 — the tokens that stop this feature defeating itself", () => {
  // `focus()` scrolls the control into view with scroll-padding/scroll-margin
  // applied. Without them the control lands BEHIND the sticky header and the
  // member is sent to a box they cannot see. Those tokens live in
  // `src/app/globals.css`, which this track does not own — so the dependency
  // is asserted rather than assumed, and it fails loudly if it regresses.
  //
  // jsdom has no layout engine, so this reads the stylesheet source. The
  // geometric proof is in tests/e2e/forms-propose.spec.ts.
  // `import.meta.url` is an http: URL under jsdom, so the path is resolved
  // from the project root Vitest already runs in.
  const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");

  it("html carries scroll-padding on both block edges", () => {
    expect(css).toMatch(/scroll-padding-block-start:\s*calc\([^;]*--header-h/);
    expect(css).toMatch(/scroll-padding-block-end:\s*calc\([^;]*--tabbar-h/);
  });

  it("every id target carries a scroll-margin clear of the header", () => {
    expect(css).toMatch(/\[id\]\s*\{[^}]*scroll-margin-block-start:\s*calc\([^;]*--header-h/);
  });

  it("the sticky-layer heights are declared, not left to be guessed", () => {
    for (const token of ["--header-h", "--subnav-h", "--tabbar-h"]) {
      expect(css).toMatch(new RegExp(`${token}:\\s*[^;]+;`));
    }
  });
});

describe("FormSummary — axe", () => {
  it("is clean", async () => {
    const { container } = render(<Form />);
    await expectAccessible(container);
  });

  it("is clean with a single failure", async () => {
    const { container } = render(<Form errors={[ERRORS[0]]} />);
    await expectAccessible(container);
  });
});

// `<FormSummary>` inside the playground's scope — DEC-183 §4.2, DEC-186 §2, §6, REQ-UIX-030, REQ-UIX-010.
//
// New cases live here, never in `form-summary.test.tsx`, which is evidence (DEC-186 §9).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { FormSummaryError } from "@/components/ui";
import { FormSummary } from "@/components/ui/form-summary";
import { contrastRatio } from "@/lib/brand/contrast";

function classes(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const ERRORS: FormSummaryError[] = [
  { fieldId: "title", label: "عنوان الجلسة", message: "اكتب عنوانًا من 3 أحرف على الأقل" },
  { fieldId: "category", label: "الفئة", message: "اختر فئة" },
];

// The class strings as they stood before wave 15.
const REGION = "rounded-field border border-error-border bg-error-bg p-4 focus-visible:outline-2 focus-visible:outline-offset-2".split(" ");
const TITLE = "flex items-start gap-2 text-label text-error".split(" ");
const LINK = "inline-block py-2.5 text-caption text-error underline underline-offset-4".split(" ");

function added(el: Element | null, before: string[]) {
  const got = classes(el);
  for (const cls of before) expect(got, cls).toContain(cls);
  return got.filter((c) => !before.includes(c)).sort();
}

describe("FormSummary — the scope adds, it never replaces", () => {
  it("keeps every class on every part, and adds only its scope classes", () => {
    render(<FormSummary title="تعذّر إرسال النموذج" description="ما كتبته محفوظ كما هو" errors={ERRORS} />);
    const region = screen.getByRole("alert");
    expect(added(region, REGION)).toEqual(
      ["pg-dark:bg-transparent", "pg-dark:border-error-on-dark", "pg:focus-visible:outline-[length:var(--focus-width)]", "pg:rounded-input"].sort(),
    );
    expect(added(region.querySelector("h2"), TITLE)).toEqual(["pg-dark:text-error-on-dark"]);
    for (const link of screen.getAllByRole("link")) expect(added(link, LINK)).toEqual(["pg-dark:text-error-on-dark"]);
    // The reassurance keeps its one class: the scope reassigns `--fg-body`.
    expect(classes(screen.getByText("ما كتبته محفوظ كما هو"))).toEqual(["mt-1", "text-caption", "text-fg-body"]);
  });

  it("★ on the dark ground the summary is an outline, because the light box and the light red fail there", () => {
    expect(contrastRatio("#9e3b3f", "#0b0c12")).toBeLessThan(3); // --color-error on the scope's ink
    expect(contrastRatio("#e08c8f", "#0b0c12")).toBeGreaterThanOrEqual(4.5); // its on-dark constant
    expect(contrastRatio("#e08c8f", "#0b0c12")).toBeGreaterThanOrEqual(3); // as a border, SC 1.4.11
  });

  it("inside the scope, right to left, it still focuses itself, jumps to the control, and is accessible", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div className="theme-play" dir="rtl">
        <FormSummary title="تعذّر إرسال النموذج" errors={ERRORS} />
        <label htmlFor="title">عنوان الجلسة</label>
        {/* ui-lint does not reach tests; a bare input stands in for a control the summary names */}
        <input id="title" />
      </div>,
    );
    expect(screen.getByRole("alert")).toHaveFocus();
    await user.click(screen.getByRole("link", { name: /عنوان الجلسة/ }));
    expect(document.getElementById("title")).toHaveFocus();
    await expectAccessible(container);
  });
});

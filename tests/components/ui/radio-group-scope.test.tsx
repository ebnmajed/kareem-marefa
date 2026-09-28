// `<RadioGroup>` inside the playground's scope — DEC-183 §4.2, DEC-186 §2, §6, REQ-UIX-030.
//
// New cases live here, never in `radio-group.test.tsx`, which is evidence (DEC-186 §9).
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { RadioGroup } from "@/components/ui/radio-group";
import { contrastRatio } from "@/lib/brand/contrast";

function classes(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const LEVELS = [
  { value: "introductory", label: "تمهيدي", hint: "لا يحتاج معرفة سابقة" },
  { value: "intermediate", label: "متوسط" },
  { value: "advanced", label: "متقدم", disabled: true },
];

// The class strings as they stood before wave 15.
const LEGEND = "text-label text-fg-heading".split(" ");
const ROW = "flex min-h-11 items-center gap-3 rounded-field px-2 text-body text-fg-body".split(" ");
const BOX = "size-5 shrink-0 accent-[var(--btn-bg)]".split(" ");
const HINT = "ps-10 pb-1.5 text-caption text-fg-muted".split(" ");
const ERROR = "mt-2 flex items-start gap-2 text-caption text-error".split(" ");

describe("RadioGroup — the scope adds, it never replaces", () => {
  it("keeps every class it had on every part, and adds only the corner and the on-dark error", () => {
    render(<RadioGroup name="level" legend="مستوى الجلسة" options={LEVELS} error="اختر مستوى الجلسة" />);
    const group = screen.getByRole("radiogroup", { name: "مستوى الجلسة" });

    expect(classes(group.querySelector("legend"))).toEqual(LEGEND);

    const row = classes(screen.getByRole("radio", { name: "تمهيدي" }).closest("label"));
    for (const cls of ROW) expect(row, cls).toContain(cls);
    expect(row.filter((c) => !ROW.includes(c)).sort()).toEqual(["cursor-pointer", "hover:bg-[var(--btn2-bg-hover)]", "pg:rounded-input"]);

    expect(classes(screen.getByRole("radio", { name: "تمهيدي" }))).toEqual(BOX);
    expect(classes(screen.getByText("لا يحتاج معرفة سابقة"))).toEqual(HINT);

    const error = classes(document.getElementById(group.getAttribute("aria-describedby")!));
    for (const cls of ERROR) expect(error, cls).toContain(cls);
    expect(error.filter((c) => !ERROR.includes(c))).toEqual(["pg-dark:text-error-on-dark"]);
  });

  it("★ the error changes colour on the dark ground because the light one fails there", () => {
    // `--color-error` on the scope's ink is under 3:1; its on-dark constant clears 4.5:1 on the
    // ground and the surface (DEC-186 §2, «the status constants serve, in their on-dark forms»).
    expect(contrastRatio("#9e3b3f", "#0b0c12")).toBeLessThan(3);
    expect(contrastRatio("#e08c8f", "#0b0c12")).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio("#e08c8f", "#151724")).toBeGreaterThanOrEqual(4.5);
  });

  it("renders inside the scope, right to left, with its behaviour unchanged, and is accessible", async () => {
    const { container } = render(
      <div className="theme-play" dir="rtl">
        <RadioGroup name="level" legend="مستوى الجلسة" options={LEVELS} defaultValue="intermediate" error="اختر مستوى الجلسة" />
      </div>,
    );
    const group = screen.getByRole("radiogroup", { name: "مستوى الجلسة" });
    expect(group).toHaveAttribute("aria-invalid", "true");
    expect(group).toHaveAttribute("id", "level");
    expect(screen.getByRole("radio", { name: "متوسط" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "متقدم" })).toBeDisabled();
    await expectAccessible(container);
  });
});

// `<Checkbox>` inside the playground's scope — DEC-183 §4.2, DEC-186 §2, §6, REQ-UIX-030.
//
// New cases live here, never in `checkbox.test.tsx`, which is evidence (DEC-186 §9).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Checkbox } from "@/components/ui/checkbox";

function classes(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

// The row's classes as they stood before wave 15, but the one approved change.
const ROW = "flex min-h-11 items-center gap-3 rounded-field px-2 text-body text-fg-body".split(" ");
const BOX = "size-5 shrink-0 accent-[var(--btn-bg)]".split(" ");

describe("Checkbox — the scope adds, it never replaces", () => {
  it("keeps every class it had, and adds only the input's corner", () => {
    render(<Checkbox name="coPresenters" value="m1" label="زميلة الاختبار" />);
    const box = screen.getByRole("checkbox");
    const row = classes(box.closest("label"));
    for (const cls of ROW) expect(row, cls).toContain(cls);
    expect(row.filter((c) => !ROW.includes(c)).sort()).toEqual(["cursor-pointer", "hover:bg-[var(--btn2-bg-hover)]", "pg:rounded-input"]);
    expect(classes(box)).toEqual(BOX);
  });

  it("★ the one class that changed: the hover is a theme token, not a raw palette name", () => {
    render(<Checkbox name="coPresenters" value="m1" label="زميلة الاختبار" />);
    const row = screen.getByRole("checkbox").closest("label")!.className;
    expect(row).not.toMatch(/\bsilver-\d/);
    // …and that token IS `silver-100` at `:root`, which is why nothing moves outside a dark section.
    const css = readFileSync(resolve(process.cwd(), "src/app/globals.css"), "utf8");
    const silver = css.match(/--color-silver-100:\s*(#[0-9a-f]{6})/i)?.[1];
    const rootHover = css.match(/:root\s*\{[^}]*--btn2-bg-hover:\s*(#[0-9a-f]{6})/i)?.[1];
    expect(silver).toBeDefined();
    expect(rootHover?.toLowerCase()).toBe(silver?.toLowerCase());
  });

  it("a disabled row keeps the corner and loses only the hover", () => {
    render(<Checkbox name="coPresenters" value="m1" label="زميلة الاختبار" disabled />);
    const row = classes(screen.getByRole("checkbox").closest("label"));
    expect(row).toContain("pg:rounded-input");
    expect(row).toContain("cursor-not-allowed");
    expect(row.some((c) => c.startsWith("hover:"))).toBe(false);
  });

  it("renders inside the scope, right to left, named by its own label, and is accessible", async () => {
    const { container } = render(
      <div className="theme-play" dir="rtl">
        <Checkbox name="topics" value="design" label="تصميم الواجهات" defaultChecked />
        <Checkbox name="topics" value="data" label="تحليل البيانات" />
        <Checkbox name="topics" value="ops" label="العمليات" disabled />
      </div>,
    );
    expect(screen.getByRole("checkbox", { name: "تصميم الواجهات" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "العمليات" })).toBeDisabled();
    await expectAccessible(container);
  });
});

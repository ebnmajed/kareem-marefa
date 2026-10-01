// `ui/stepper` — REQ-UIX-064, DEC-213 §5.125. An ordered list; the current step is `aria-current="step"`; a done
// step is marked by more than colour; at most one current.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { StepperStep } from "@/components/ui";
import { Stepper } from "@/components/ui/stepper";

const STEPS: StepperStep[] = [
  { id: "sent", label: "أُرسل", status: "done" },
  { id: "review", label: "قيد المراجعة", status: "done" },
  { id: "changes", label: "طُلب تعديل", status: "current" },
  { id: "approved", label: "معتمد", status: "upcoming" },
  { id: "scheduled", label: "مُجدوَل", status: "upcoming" },
];

function draw(steps: StepperStep[] = STEPS, tone?: "signal" | "accent") {
  return render(
    <div dir="rtl">
      <Stepper label="مراحل المقترح" doneLabel="مكتملة" steps={steps} currentTone={tone} />
    </div>,
  );
}

describe("Stepper", () => {
  it("is a named ordered list, one item per step, in order", () => {
    draw();
    const list = screen.getByRole("list", { name: "مراحل المقترح" });
    expect(list.tagName).toBe("OL");
    expect(within(list).getAllByRole("listitem").map((li) => li.textContent?.replace(/\d|— مكتملة/g, "").trim())).toEqual([
      "أُرسل",
      "قيد المراجعة",
      "طُلب تعديل",
      "معتمد",
      "مُجدوَل",
    ]);
  });

  it("marks the current step with aria-current=step, and only it", () => {
    draw();
    const items = screen.getAllByRole("listitem");
    expect(items.filter((li) => li.getAttribute("aria-current") === "step")).toEqual([items[2]]);
  });

  it("★ a done step is not colour alone: the check glyph and the words «مكتملة»", () => {
    draw();
    const [first] = screen.getAllByRole("listitem");
    expect(first).toHaveTextContent("أُرسل — مكتملة");
    expect(first.querySelector("svg")).not.toBeNull();
    // An upcoming step keeps its number and says nothing of completion.
    const fourth = screen.getAllByRole("listitem")[3];
    expect(fourth).not.toHaveTextContent("مكتملة");
    expect(fourth.querySelector("svg")).toBeNull();
    expect(fourth).toHaveTextContent("4");
  });

  it("the drawn number is hidden from assistive technology — the list already says the position", () => {
    draw();
    const disc = screen.getAllByRole("listitem")[4].querySelector("[aria-hidden]") as HTMLElement;
    expect(disc).toHaveTextContent("5");
  });

  it("★ a second current is drawn upcoming — never two «you are here»", () => {
    draw(STEPS.map((s) => ({ ...s, status: s.id === "changes" || s.id === "approved" ? "current" : s.status })));
    expect(screen.getAllByRole("listitem").filter((li) => li.getAttribute("aria-current") === "step")).toHaveLength(1);
    expect(screen.getAllByRole("listitem")[3]).toHaveAttribute("data-status", "upcoming");
  });

  it("the current tone is signal by default and accent on request — a state colour, never a status class", () => {
    const { container, unmount } = draw();
    const current = () => container.querySelector('[aria-current="step"] [aria-hidden]') as HTMLElement;
    expect(current()).toHaveClass("bg-signal");
    unmount();
    const again = draw(STEPS, "accent");
    expect(again.container.querySelector('[aria-current="step"] [aria-hidden]')).toHaveClass("bg-accent");
    expect(again.container.innerHTML).not.toMatch(/(?:bg|text)-(?:success|error|live|ended|info)\b/);
  });

  it("is accessible", async () => {
    const { container } = draw();
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

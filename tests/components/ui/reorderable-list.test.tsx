// The lead's file — `ui/reorderable-list`, `16` §10.2.1, REQ-DSG-028, SC 2.5.7,
// DEC-160 §5. Three lists use it (a survey's questions, a choice question's
// options, an email's blocks), so what is asserted here is what all three rely
// on: taps alone, a name for every ▲▼, focus that survives reaching an end, and
// a sentence for a person who cannot see the row move.
import { useState } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { ReorderableList } from "@/components/ui/reorderable-list";
import type { ReorderableMove } from "@/components/ui";
import arUi from "@/messages/ar/ui.json";
import enUi from "@/messages/en/ui.json";

interface Question {
  id: string;
  text: string;
}

const QUESTIONS: Question[] = [
  { id: "q1", text: "ما مدى وضوح المحتوى؟" },
  { id: "q2", text: "هل كانت المدة مناسبة؟" },
  { id: "q3", text: "ماذا تقترح للجلسة القادمة؟" },
];

const UP = "انقل لأعلى";
const DOWN = "انقل لأسفل";

/** The caller owns the order — exactly how an editor will hold it. */
function Harness({
  initial = QUESTIONS,
  onReorder,
  disabled,
}: {
  initial?: Question[];
  onReorder?: (next: string[], moved: ReorderableMove) => void;
  disabled?: boolean;
}) {
  const [items, setItems] = useState(initial);
  return (
    <NextIntlClientProvider locale="ar" messages={arUi}>
      <ReorderableList
        items={items}
        getKey={(q) => q.id}
        getName={(q) => q.text}
        label="أسئلة الاستبانة"
        disabled={disabled}
        renderItem={(q) => <p>{q.text}</p>}
        onReorder={(next, moved) => {
          onReorder?.(next, moved);
          setItems(next.map((id) => items.find((q) => q.id === id)!));
        }}
      />
    </NextIntlClientProvider>
  );
}

function rows() {
  return within(screen.getByRole("list", { name: "أسئلة الاستبانة" })).getAllByRole("listitem");
}

function order() {
  return rows().map((row) => within(row).getByRole("paragraph").textContent);
}

describe("ReorderableList", () => {
  it("is an ordered list with a name, one row per item, in the order given", () => {
    render(<Harness />);
    expect(screen.getByRole("list", { name: "أسئلة الاستبانة" }).tagName).toBe("OL");
    expect(order()).toEqual(QUESTIONS.map((q) => q.text));
  });

  it("names every ▲▼ and describes each by the row it moves", () => {
    render(<Harness />);
    for (const [index, row] of rows().entries()) {
      const up = within(row).getByRole("button", { name: UP });
      const down = within(row).getByRole("button", { name: DOWN });
      expect(up).toHaveAccessibleDescription(QUESTIONS[index].text);
      expect(down).toHaveAccessibleDescription(QUESTIONS[index].text);
    }
  });

  it("the describing name is not rendered a second time for a sighted reader or a screen reader's row", () => {
    render(<Harness />);
    // One visible paragraph per row; the description's source is `hidden`.
    expect(screen.getAllByText(QUESTIONS[0].text).filter((el) => !el.hidden)).toHaveLength(1);
  });

  it("SC 2.5.7 — a click alone moves a row down, and hands back the whole new order", async () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    await userEvent.click(within(rows()[0]).getByRole("button", { name: DOWN }));
    expect(onReorder).toHaveBeenCalledExactlyOnceWith(["q2", "q1", "q3"], { key: "q1", from: 0, to: 1 });
    expect(order()).toEqual([QUESTIONS[1].text, QUESTIONS[0].text, QUESTIONS[2].text]);
  });

  it("a click alone moves a row up", async () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    await userEvent.click(within(rows()[2]).getByRole("button", { name: UP }));
    expect(onReorder).toHaveBeenCalledExactlyOnceWith(["q1", "q3", "q2"], { key: "q3", from: 2, to: 1 });
  });

  it("the ends are inert by aria-disabled, never by disabled — and a press there changes nothing", async () => {
    const onReorder = vi.fn();
    render(<Harness onReorder={onReorder} />);
    const firstUp = within(rows()[0]).getByRole("button", { name: UP });
    const lastDown = within(rows()[2]).getByRole("button", { name: DOWN });
    expect(firstUp).toHaveAttribute("aria-disabled", "true");
    expect(lastDown).toHaveAttribute("aria-disabled", "true");
    expect(firstUp).not.toBeDisabled();
    expect(lastDown).not.toBeDisabled();
    await userEvent.click(firstUp);
    await userEvent.click(lastDown);
    expect(onReorder).not.toHaveBeenCalled();
    // The inner buttons carry no aria-disabled at all.
    expect(within(rows()[1]).getByRole("button", { name: UP })).not.toHaveAttribute("aria-disabled");
  });

  it("keeps focus on the button that moved the row, even when the row reaches the top", async () => {
    render(<Harness />);
    const up = within(rows()[1]).getByRole("button", { name: UP });
    up.focus();
    await userEvent.keyboard("{Enter}");
    // q2 is now first; its ▲ is inert — and still the focused element.
    const moved = within(rows()[0]).getByRole("button", { name: UP });
    expect(moved).toHaveAccessibleDescription(QUESTIONS[1].text);
    expect(moved).toHaveAttribute("aria-disabled", "true");
    expect(moved).toHaveFocus();
  });

  it("announces the move politely, naming the row and its new position in Western digits", async () => {
    render(<Harness />);
    const status = screen.getByRole("status");
    expect(status).toBeEmptyDOMElement();
    await userEvent.click(within(rows()[0]).getByRole("button", { name: DOWN }));
    expect(status).toHaveTextContent(`نُقل ${QUESTIONS[0].text} إلى الموضع 2 من 3`);
    // The interpolated name is bidi-isolated.
    expect(within(status).getByText(QUESTIONS[0].text).tagName).toBe("BDI");
    // A second move is a different sentence, so it is read too.
    await userEvent.click(within(rows()[1]).getByRole("button", { name: DOWN }));
    expect(status).toHaveTextContent(`نُقل ${QUESTIONS[0].text} إلى الموضع 3 من 3`);
    expect(status.textContent).not.toMatch(/[٠-٩]/);
  });

  it("disabled makes every ▲▼ inert and keeps them in the tab order", async () => {
    const onReorder = vi.fn();
    render(<Harness disabled onReorder={onReorder} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(6);
    for (const button of buttons) {
      expect(button).toHaveAttribute("aria-disabled", "true");
      expect(button).not.toBeDisabled();
    }
    await userEvent.click(within(rows()[1]).getByRole("button", { name: UP }));
    expect(onReorder).not.toHaveBeenCalled();
  });

  it("renders a row's own actions beside ▲▼, with the row's context", () => {
    render(
      <NextIntlClientProvider locale="ar" messages={arUi}>
        <ReorderableList
          items={QUESTIONS}
          getKey={(q) => q.id}
          getName={(q) => q.text}
          label="أسئلة الاستبانة"
          renderItem={(q) => <p>{q.text}</p>}
          renderActions={(q, { index, total }) => <button type="button">{`حذف ${index + 1}/${total}`}</button>}
          onReorder={() => {}}
        />
      </NextIntlClientProvider>,
    );
    expect(within(rows()[2]).getByRole("button", { name: "حذف 3/3" })).toBeInTheDocument();
  });

  it("a single row has two inert buttons and an empty list renders no row", () => {
    const { unmount } = render(<Harness initial={[QUESTIONS[0]]} />);
    for (const button of screen.getAllByRole("button")) expect(button).toHaveAttribute("aria-disabled", "true");
    unmount();
    render(<Harness initial={[]} />);
    expect(screen.getByRole("list", { name: "أسئلة الاستبانة" })).toBeEmptyDOMElement();
  });

  it("reads English from the same keys", () => {
    render(
      <NextIntlClientProvider locale="en" messages={enUi}>
        <ReorderableList
          items={QUESTIONS}
          getKey={(q) => q.id}
          getName={(q) => q.text}
          label="Survey questions"
          renderItem={(q) => <p>{q.text}</p>}
          onReorder={() => {}}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getAllByRole("button", { name: "Move up" })).toHaveLength(3);
    expect(screen.getAllByRole("button", { name: "Move down" })).toHaveLength(3);
  });

  it("is axe-clean", async () => {
    const { container } = render(<Harness />);
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
  });
});

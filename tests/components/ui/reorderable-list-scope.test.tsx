// `ui/reorderable-list` inside the playground's scope — DEC-199 §3, REQ-UIX-051.
//
// `04-components.md`: «tokens only; **no animation**». The list has no surface of
// its own — a row is whatever the caller renders — so what it draws is its move
// buttons, which are `ui/icon-button`. Held here: it carries no raw palette name,
// it declares no animation, and taps alone reorder it (`DEC-093`, SC 2.5.7).
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { NextIntlClientProvider } from "next-intl";
import { Direction } from "radix-ui";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ReorderableList } from "@/components/ui/reorderable-list";
import { PlayScope } from "@/components/ui/scope";

const MESSAGES = { ui: { reorderableList: { moveUp: "انقل لأعلى", moveDown: "انقل لأسفل", moved: "نُقل <t>{name}</t> إلى الموضع {position} من {total}" } } };

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={MESSAGES}>
      <Direction.Provider dir="rtl">
        <PlayScope>{children}</PlayScope>
      </Direction.Provider>
    </NextIntlClientProvider>
  );
}

const tokens = (s: string | null | undefined) => (s ?? "").split(/\s+/).filter(Boolean);
const scoped = (c: string) => /^pg(?:-dark|-light)?:/.test(c);
/** What is left when every class the scope added is taken away — the string `main` rendered. */
const inside = (el: Element | null) => tokens(el?.getAttribute("class")).filter(scoped);

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

function Example() {
  const [items, setItems] = useState(["الاسم", "التقييم", "ملاحظات"]);
  return (
    <ReorderableList
      label="أسئلة الاستبيان"
      items={items}
      getKey={(item) => item}
      getName={(item) => item}
      renderItem={(item) => <p className="rounded-input border border-edge bg-surface p-3 text-body text-fg-body">{item}</p>}
      onReorder={(next) => setItems(next)}
    />
  );
}

describe("ui/reorderable-list — inside the scope", () => {
  it("renders inside the scope and names no raw palette colour", () => {
    const { container } = render(<Example />, { wrapper: Wrap });
    expect(screen.getByRole("list", { name: "أسئلة الاستبيان" }).closest(".theme-play")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/\b(?:navy|silver|slate)-\d/);
  });

  it("declares no animation: nothing of its own animates, transitions or moves", () => {
    render(<Example />, { wrapper: Wrap });
    const list = screen.getByRole("list", { name: "أسئلة الاستبيان" });
    // The list, its rows and their wrappers — everything but the move buttons, which are `ui/icon-button`'s.
    for (const el of [list, ...list.querySelectorAll("li, li > div, li > span")]) {
      expect(el.getAttribute("class") ?? "", el.tagName).not.toMatch(/animate-|transition|duration-|translate-|scale-/);
    }
    // And no glyph in it spins or pulses.
    for (const svg of list.querySelectorAll("svg")) expect(svg.getAttribute("class") ?? "").not.toMatch(/animate-/);
  });

  it("its controls are the icon button — the scope's circle — and nothing is draggable", () => {
    render(<Example />, { wrapper: Wrap });
    const up = screen.getAllByRole("button", { name: "انقل لأعلى" });
    expect(up).toHaveLength(3);
    expect(inside(up[1])).toContain("pg:rounded-pill");
    expect(document.querySelector("[draggable]")).toBeNull();
  });

  it("taps alone reorder it, and the move is announced", async () => {
    const user = userEvent.setup();
    render(<Example />, { wrapper: Wrap });
    await user.click(screen.getAllByRole("button", { name: "انقل لأسفل" })[0]);
    expect(screen.getAllByRole("listitem").map((li) => li.querySelector("p")!.textContent)).toEqual(["التقييم", "الاسم", "ملاحظات"]);
    expect(screen.getByRole("status")).toHaveTextContent("نُقل الاسم إلى الموضع 2 من 3");
  });

  it("RTL: at an end the button is inert, never disabled, and the markup is accessible", async () => {
    const { container } = render(<Example />, { wrapper: Wrap });
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    const first = screen.getAllByRole("button", { name: "انقل لأعلى" })[0];
    expect(first).toHaveAttribute("aria-disabled", "true");
    expect(first).not.toBeDisabled();
    await expectAccessible(container);
  });
});

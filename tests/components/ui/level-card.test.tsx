// `<LevelCard>` — REQ-UIX-039, REQ-REC-004, DEC-186 §7. Two faces from props;
// both readable by a screen reader in either state; nothing moves.
import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { LevelFace } from "@/components/ui";
import { LevelCard, rampStop } from "@/components/ui/level-card";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const HELD: LevelFace = { tier: 3, name: "صاحب أثر", caption: "مستواك الحالي", unlocks: ["أولوية الحجز"] };
const REACHED: LevelFace = { tier: 4, name: "كريم معرفة", caption: "مستوى جديد", unlocks: ["الحق في اقتراح جلسة"] };
const LABELS = { unlocksLabel: "يفتح لك", noUnlocksLabel: "لا امتياز مرتبط بهذا المستوى بعد" };

function groups() {
  return screen.getAllByRole("group");
}

function hiddenFromAT(el: HTMLElement): boolean {
  for (let node: HTMLElement | null = el; node; node = node.parentElement) {
    if (node.hasAttribute("hidden") || node.getAttribute("aria-hidden") === "true" || node.hasAttribute("inert")) return true;
  }
  return false;
}

describe("LevelCard — one face", () => {
  it("draws the level held, named by its caption, with what it unlocks", () => {
    render(<LevelCard level={HELD} {...LABELS} />);
    const face = screen.getByRole("group", { name: "مستواك الحالي" });
    expect(within(face).getByText("صاحب أثر")).toBeInTheDocument();
    expect(within(face).getByRole("list", { name: "يفتح لك" })).toBeInTheDocument();
    expect(within(face).getByText("أولوية الحجز")).toBeInTheDocument();
    expect(groups()).toHaveLength(1);
  });

  it("★ says there is no privilege rather than invent one when `unlocks` is empty", () => {
    render(<LevelCard level={{ tier: 1, name: "مشارِك", caption: "مستواك الحالي", unlocks: [] }} {...LABELS} />);
    expect(screen.getByText(LABELS.noUnlocksLabel)).toBeInTheDocument();
    expect(screen.queryByRole("list")).toBeNull();
    expect(screen.queryByText("يفتح لك")).toBeNull();
  });

  it("isolates the org's level name and every unlock in <bdi>", () => {
    render(<LevelCard level={HELD} {...LABELS} />);
    expect(screen.getByText("صاحب أثر").tagName).toBe("BDI");
    expect(screen.getByText("أولوية الحجز").tagName).toBe("BDI");
  });

  it("«reached» with no reached face shows the level held", () => {
    const { container } = render(<LevelCard level={HELD} shown="reached" {...LABELS} />);
    expect(container.firstElementChild).toHaveAttribute("data-shown", "level");
    expect(groups()[0]).toHaveAttribute("data-visible", "true");
  });
});

describe("LevelCard — two faces", () => {
  it.each(["level", "reached"] as const)("★ both faces are reachable by a screen reader when shown=%s", (shown) => {
    render(<LevelCard level={HELD} reached={REACHED} shown={shown} {...LABELS} />);
    const all = groups();
    expect(all).toHaveLength(2);
    for (const g of all) expect(hiddenFromAT(g)).toBe(false);
    expect(screen.getByRole("group", { name: "مستواك الحالي" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "مستوى جديد" })).toBeInTheDocument();
    // …and in logical order: the level held, then the level reached.
    expect(all.map((g) => g.getAttribute("data-face"))).toEqual(["level", "reached"]);
  });

  it("shows exactly one face, and the other is visually hidden only", () => {
    render(<LevelCard level={HELD} reached={REACHED} shown="reached" {...LABELS} />);
    const [held, reached] = groups();
    expect(reached).toHaveAttribute("data-visible", "true");
    expect(reached.className).not.toContain("sr-only");
    expect(held).toHaveAttribute("data-visible", "false");
    expect(held.className).toBe("sr-only");
  });

  it("the reached face wears its ramp stop with the ink on it; the held face does not", () => {
    render(<LevelCard level={HELD} reached={REACHED} shown="reached" {...LABELS} />);
    const reached = screen.getByRole("group", { name: "مستوى جديد" });
    expect(reached.className).toContain("bg-level-4");
    expect(reached.className).toContain("text-on-level");
  });

  it("has no axe violations in either state", async () => {
    const a = render(<LevelCard level={HELD} reached={REACHED} shown="level" {...LABELS} />);
    await expectAccessible(a.container);
    a.unmount();
    const b = render(<LevelCard level={HELD} reached={REACHED} shown="reached" {...LABELS} />);
    await expectAccessible(b.container);
  });
});

describe("LevelCard — no id is written twice (the lead's finding on a985050a)", () => {
  it("★ a card with both faces, rendered TWICE from one element, repeats no id", () => {
    const card = <LevelCard level={HELD} reached={REACHED} shown="reached" {...LABELS} />;
    // The gallery places one demo element on both grounds; Flight writes the same subtree twice.
    // ★ Honest limit: a client render gives each instance its own useId, so this case alone would
    // NOT have caught the old code — the next case, «no id reference at all», is what pins the fix.
    const { container } = render(
      <>
        {card}
        {card}
      </>,
    );
    const ids = [...container.querySelectorAll("[id]")].map((el) => el.id);
    expect(ids.filter((id, i) => ids.indexOf(id) !== i)).toEqual([]);
  });

  it("★ each face is named by its own caption and its list by its own label, with no id reference", () => {
    const { container } = render(<LevelCard level={HELD} reached={REACHED} shown="level" {...LABELS} />);
    expect(container.querySelector("[aria-labelledby], [aria-describedby]")).toBeNull();
    for (const [caption, unlock] of [
      ["مستواك الحالي", "أولوية الحجز"],
      ["مستوى جديد", "الحق في اقتراح جلسة"],
    ]) {
      const face = screen.getByRole("group", { name: caption });
      const list = within(face).getByRole("list", { name: "يفتح لك" });
      expect(within(list).getByText(unlock)).toBeInTheDocument();
      expect(within(face).getByText(caption)).toBeInTheDocument();
    }
  });
});

describe("LevelCard — the ramp is keyed on tier, never on the name", () => {
  it("clamps sort_order to the five stops", () => {
    expect([1, 2, 3, 4, 5].map(rampStop)).toEqual([1, 2, 3, 4, 5]);
    expect(rampStop(0)).toBe(1);
    expect(rampStop(-3)).toBe(1);
    expect(rampStop(7)).toBe(5);
    expect(rampStop(Number.NaN)).toBe(1);
  });

  it("an org that renames level 4 keeps level 4's stop", () => {
    render(<LevelCard level={HELD} reached={{ ...REACHED, name: "خبير" }} shown="reached" {...LABELS} />);
    expect(screen.getByRole("group", { name: "مستوى جديد" }).className).toContain("bg-level-4");
  });
});

describe("LevelCard — RTL and motion", () => {
  it("renders inside the RTL document", () => {
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    render(<LevelCard level={HELD} reached={REACHED} shown="reached" {...LABELS} />);
    expect(screen.getByText("كريم معرفة").closest("[role=group]")).toHaveClass("text-center");
  });

  it("★ nothing moves: no transition, no animation, no keyframe, no physical direction (DEC-186 §4)", () => {
    const source = readFileSync("src/components/ui/level-card.tsx", "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, " ")
      .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
    expect(source).not.toMatch(/\btransition|\banimate-|@keyframes|\.animate\(/);
    expect(source).not.toMatch(/\b(?:ml|mr|pl|pr|left|right)-|text-left|text-right/);
    // `overflow: hidden` on a text line clips tashkeel (CLAUDE.md).
    expect(source).not.toMatch(/overflow-hidden|truncate/);
  });
});

// ★ wave 16 (DEC-197): `flip` — moment 4's layout. New behaviour, new cases; the ones above are untouched.
describe("LevelCard — flip, the two faces stacked back to back", () => {
  it("★ draws BOTH faces, neither hidden from assistive technology, held first then reached", async () => {
    const { container } = render(<LevelCard flip level={HELD} reached={REACHED} shown="reached" {...LABELS} />);
    expect(groups().map((g) => g.getAttribute("aria-label"))).toEqual(["مستواك الحالي", "مستوى جديد"]);
    for (const g of groups()) {
      expect(hiddenFromAT(g)).toBe(false);
      expect(g).not.toHaveClass("sr-only");
      expect(g).toHaveClass("backface-hidden");
    }
    await expectAccessible(container);
  });

  it("`shown` turns the inner card as a static class: the reached face is the end frame, with nothing moving", () => {
    const { rerender } = render(<LevelCard flip level={HELD} reached={REACHED} shown="reached" {...LABELS} />);
    const inner = document.querySelector("[data-slot=flip-inner]")!;
    expect(inner).toHaveClass("transform-3d", "rotate-y-180");
    expect(screen.getByRole("group", { name: "مستوى جديد" })).toHaveClass("rotate-y-180");
    rerender(<LevelCard flip level={HELD} reached={REACHED} shown="level" {...LABELS} />);
    expect(document.querySelector("[data-slot=flip-inner]")).not.toHaveClass("rotate-y-180");
  });

  it("the reached face carries one decorative shine, transparent at rest, clipped on its own layer — never the text's", () => {
    render(<LevelCard flip level={HELD} reached={REACHED} shown="reached" {...LABELS} />);
    const shines = document.querySelectorAll("[data-slot=shine]");
    expect(shines).toHaveLength(1);
    expect(screen.getByRole("group", { name: "مستوى جديد" }).contains(shines[0])).toBe(true);
    expect(shines[0]).toHaveClass("opacity-0");
    expect(shines[0].parentElement).toHaveAttribute("aria-hidden", "true");
    expect(shines[0].parentElement!.className).toContain("clip-path");
    expect(shines[0].parentElement!.textContent).toBe("");
  });

  it("with no reached face, `flip` draws the one face as before", () => {
    render(<LevelCard flip level={HELD} {...LABELS} />);
    expect(groups()).toHaveLength(1);
    expect(document.querySelector("[data-slot=flip-inner]")).toBeNull();
  });
});

// `<LevelCard layout="standing">` — wave 19, DEC-214 §3 N10, add-only: the profile's standing card. One row — the
// level's medallion, the caption, the name in its ramp colour, the figure at the inline-end — and the caller's
// content under it. No unlock list, no reached face, no flip: no moment can play on it (DEC-213 §5.117).
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { LevelCard } from "@/components/ui/level-card";

const LEVEL = { tier: 4, name: "كريم معرفة", caption: "المستوى", unlocks: ["أولوية الحجز"] };

function mount(extra = {}) {
  return render(
    <LevelCard
      layout="standing"
      level={LEVEL}
      reached={{ tier: 5, name: "سفير المعرفة", caption: "مستوى جديد", unlocks: [] }}
      shown="reached"
      flip
      unlocksLabel="يفتح لك"
      noUnlocksLabel="لا امتياز"
      standing={{ figure: "1,240", unit: "نقطة", children: <p>السطر والأرقام</p> }}
      {...extra}
    />,
  );
}

describe("LevelCard — the standing layout", () => {
  it("one group, named by its caption: the level's name, the figure and its unit, the caller's content", () => {
    mount();
    const card = screen.getByRole("group", { name: "المستوى" });
    expect(within(card).getByText("كريم معرفة").tagName).toBe("BDI");
    expect(within(card).getByText("1,240")).toBeInTheDocument();
    expect(within(card).getByText("نقطة")).toBeInTheDocument();
    expect(within(card).getByText("السطر والأرقام")).toBeInTheDocument();
    expect(card.getAttribute("data-tier")).toBe("4");
    expect(card.innerHTML).toContain("text-level-4");
  });

  it("★ draws the level alone — no unlock list, no reached face, no flip", () => {
    const { container } = mount();
    expect(screen.queryByText("يفتح لك")).toBeNull();
    expect(screen.queryByText("أولوية الحجز")).toBeNull();
    expect(screen.queryByText("سفير المعرفة")).toBeNull();
    expect(container.querySelector("[data-layout=flip]")).toBeNull();
    expect(screen.getAllByRole("group")).toHaveLength(1);
  });

  it("the medallion is decoration beside the name already drawn", () => {
    const { container } = mount();
    expect(container.querySelector("[data-slot=badge-medallion]")!.getAttribute("aria-hidden")).toBe("true");
  });

  it("without `standing` the default faces are drawn, unchanged", () => {
    render(<LevelCard layout="standing" level={LEVEL} unlocksLabel="يفتح لك" noUnlocksLabel="لا امتياز" />);
    expect(screen.getByRole("list", { name: "يفتح لك" })).toBeInTheDocument();
  });

  it("has no accessibility violation", async () => {
    const { container } = mount();
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  }, 30_000);
});

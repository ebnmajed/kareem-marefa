// `<StoryRing>` with no `onOpen` — wave 18, DEC-206 §1.5, DEC-207 §1.5, REQ-UIX-055. Until session stories
// exist a ring opens nothing, so it is not a button: the same drawing, named as an image, out of the tab order.
// Rendered inside the playground's scope, as the home renders it. RTL document.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { StoryRingState } from "@/components/ui";
import { StoryRing } from "@/components/ui/story-ring";

const WORD: Record<StoryRingState, string> = { live: "مباشر", recap: "ملخص", upcoming: "قادمة", seen: "شوهدت" };
const STATES = Object.keys(WORD) as StoryRingState[];

function inert(state: StoryRingState, teamColor: string | null = "#35D0FF") {
  return (
    <div className="theme-play">
      <StoryRing state={state} label={`جلسة: العرض في 5 شرائح، ${WORD[state]}`} stateLabel={WORD[state]} glyph="ع" caption="اليوم" teamColor={teamColor} />
    </div>
  );
}

describe("StoryRing with no onOpen — not a button", () => {
  it.each(STATES)("%s is an image named by the caller's label, and no button exists", (state) => {
    render(inert(state));
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: `جلسة: العرض في 5 شرائح، ${WORD[state]}` })).toHaveAttribute("data-state", state);
  });

  it("is out of the tab order: a Tab lands on nothing", async () => {
    render(
      <>
        {inert("live")}
        <button type="button">بعدها</button>
      </>,
    );
    await userEvent.tab();
    expect(screen.getByRole("button", { name: "بعدها" })).toHaveFocus();
  });

  it("draws the same thing the button draws: the word, the caption, the double ring, the seen mark", () => {
    const { container, unmount } = render(inert("live"));
    expect(container.querySelector('[data-slot="outer-ring"]')).not.toBeNull();
    expect(container.querySelector("[data-state]")).toHaveTextContent("مباشر");
    expect(container.querySelector("[data-state]")).toHaveTextContent("اليوم");
    unmount();
    const seen = render(inert("seen"));
    expect(seen.container.querySelector('[data-slot="seen-mark"]')).not.toBeNull();
  });

  it("an upcoming ring still wears the team as --team, re-checked", () => {
    const { container } = render(inert("upcoming", "#35D0FF"));
    expect((container.querySelector("[data-state]") as HTMLElement).style.getPropertyValue("--team")).toBe("#35D0FF");
  });

  it("everything drawn inside is aria-hidden, so the name is read once", () => {
    const { container } = render(inert("recap"));
    for (const child of container.querySelector("[data-state]")!.children) expect(child).toHaveAttribute("aria-hidden", "true");
  });

  it("is accessible inside the scope, every state", async () => {
    const { container } = render(<div className="theme-play">{STATES.map((s) => (<div key={s}>{inert(s)}</div>))}</div>);
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

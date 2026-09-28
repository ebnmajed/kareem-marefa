// `<Switch>` inside the playground's scope — DEC-183 §4.2, DEC-186 §2, §6, REQ-UIX-030.
//
// New cases live here, never in `switch.test.tsx`, which is evidence (DEC-186 §9).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Switch } from "@/components/ui/switch";
import { contrastRatio } from "@/lib/brand/contrast";

function classes(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

// The track's classes as they stood before wave 15.
const TRACK =
  "flex h-6 w-11 shrink-0 items-center justify-start rounded-full bg-edge-strong p-0.5 transition-colors duration-[var(--dur-fast)] ease-[var(--ease-out)] peer-checked:justify-end peer-checked:bg-[var(--btn-bg)] peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--ring)] peer-disabled:opacity-60".split(
    " ",
  );

function track() {
  return screen.getByRole("switch").parentElement!.querySelector("[aria-hidden]");
}

describe("Switch — the scope adds, it never replaces", () => {
  it("keeps every class the track had, and adds only the ring's width and the light variant's ON fill", () => {
    render(<Switch label="السماح بالحضور دون حجز" />);
    const got = classes(track());
    for (const cls of TRACK) expect(got, cls).toContain(cls);
    expect(got.filter((c) => !TRACK.includes(c)).sort()).toEqual(["pg-light:peer-checked:bg-fg-heading", "pg:peer-focus-visible:outline-[length:var(--focus-width)]"]);
    expect(classes(track()?.firstElementChild ?? null)).toEqual(["size-5", "rounded-full", "bg-canvas"]);
  });

  it("★ the light variant's ON track cannot be the accent: an ON switch would vanish", () => {
    // Lime on paper, and the paper thumb on lime — both ~1.07:1. The text colour clears both.
    const paper = "#f6f3ec";
    const lime = "#c6ff3d";
    const ink = "#12131a";
    expect(contrastRatio(lime, paper)).toBeLessThan(1.5);
    expect(contrastRatio(ink, paper)).toBeGreaterThanOrEqual(3);
  });

  it("still toggles, posts and is named inside the scope, right to left, and is accessible", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div className="theme-play" dir="rtl">
        <form aria-label="إعدادات الجلسة">
          <Switch name="walkIns" label="السماح بالحضور دون حجز" description="يُسجَّل الحاضر دون مقعد محجوز" />
        </form>
      </div>,
    );
    const control = screen.getByRole("switch", { name: "السماح بالحضور دون حجز" });
    expect(control).not.toBeChecked();
    await user.click(control);
    expect(control).toBeChecked();
    expect(new FormData(container.querySelector("form")!).get("walkIns")).toBe("on");
    await expectAccessible(container);
  });
});

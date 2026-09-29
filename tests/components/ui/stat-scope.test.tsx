// `<Stat>` inside the playground's scope — DEC-183, DEC-186 §2 – §3, REQ-UIX-030, DEC-073.
//
// New cases live here, never in `stat.test.tsx`, which is evidence (DEC-186 §9).
import type React from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { Tone } from "@/components/ui";
import { Stat } from "@/components/ui/stat";
import { contrastRatio } from "@/lib/brand/contrast";
import ar from "@/messages/ar/browse.json";

function Wrap({ scope, children }: { scope?: boolean; children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={ar}>
      <div className={scope ? "theme-play" : undefined}>{children}</div>
    </NextIntlClientProvider>
  );
}

function classes(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

function expectAdded(el: Element | null, before: string[], added: string[]) {
  const got = classes(el);
  for (const cls of before) expect(got, cls).toContain(cls);
  expect(got.filter((c) => !before.includes(c)).sort()).toEqual([...added].sort());
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

// The class strings as they stood at `886260a`, before wave 15.
const BEFORE_BOX = "block rounded-card border border-edge bg-surface p-4".split(" ");
const BEFORE_LINK = [...BEFORE_BOX, "transition-shadow", "duration-150", "hover:shadow-raise"];

describe("Stat — the scope adds, it never replaces", () => {
  it("the box keeps every class and adds the panel radius", () => {
    const { container } = render(<Stat label="الحضور" value="124" />);
    expectAdded(container.firstElementChild, BEFORE_BOX, ["pg:rounded-panel"]);
  });

  it("a linked box keeps its hover, and inside the scope drops the shadow and the transition", () => {
    render(
      <Wrap>
        <Stat label="الجلسات" value="18" href="/app/sessions" />
      </Wrap>,
    );
    expectAdded(screen.getByRole("link"), BEFORE_LINK, [
      "pg:rounded-panel",
      "pg:transition-none",
      "pg:hover:shadow-none",
      "pg:hover:border-edge-strong",
    ]);
  });

  it("the value is in the display face at 700, and keeps its heading colour", () => {
    const { container } = render(<Stat label="الحضور" value="124" />);
    expectAdded(container.querySelector("strong"), ["block", "text-h2", "text-fg-heading"], ["pg:font-display", "pg:font-bold"]);
  });

  it.each([
    ["success", "text-success", "pg-dark:text-success-on-dark"],
    ["live", "text-live", "pg-dark:text-live-on-dark"],
    ["ended", "text-ended", "pg-dark:text-ended-on-dark"],
    ["error", "text-error", "pg-dark:text-error-on-dark"],
  ] as const)("a %s value keeps %s and takes %s in a dark scope — never the accent", (tone, before, added) => {
    const { container } = render(<Stat label="الحالة" value="3" tone={tone as Tone} />);
    expectAdded(container.querySelector("strong"), ["block", "text-h2", before], ["pg:font-display", "pg:font-bold", added]);
  });

  it("is accessible inside the scope, linked and not, every tone", async () => {
    const { container } = render(
      <Wrap scope>
        <Stat label="الحضور" value="124" hint="هذا الشهر" />
        <Stat label="الجلسات" value="18" href="/app/sessions" />
        <Stat label="مكتملة" value="12" tone="success" />
        <Stat label="أُلغيت" value="1" tone="error" />
      </Wrap>,
    );
    await expectAccessible(container);
  });
});

describe("Stat — contrast inside the dark scope (DEC-073's on-dark constants)", () => {
  it.each([
    ["success", "#8fbfa5"],
    ["live", "#d2a86b"],
    ["ended", "#a8b3c4"],
    ["error", "#e08c8f"],
    ["untoned (the scope's text)", "#f4f1ea"],
  ])("%s clears 4.5:1 on the scope's surface", (_name, hex) => {
    expect(contrastRatio(hex, "#151724")).toBeGreaterThanOrEqual(4.5);
  });
});

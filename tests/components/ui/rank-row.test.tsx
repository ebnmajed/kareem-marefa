// `<RankRow>` — REQ-UIX-037, DEC-183 §3, DEC-186 §7. A leaderboard never
// shames: a row whose rank fell is the neutral row, byte for byte.
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { RankRowProps } from "@/components/ui";
import { RankRow } from "@/components/ui/rank-row";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

function Wrap({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={{}}>
      {children}
    </NextIntlClientProvider>
  );
}

const BASE: RankRowProps = {
  rank: 5,
  rankLabel: "المركز 5",
  memberId: "m-reem",
  displayName: "ريم الشهري",
  company: "بنينسولا ستوري",
  teamColor: "#ff4fb8",
  points: "1,410",
  pointsLabel: "1,410 نقطة",
};

/** One row, in the list a board wraps it in; returns the list's markup. */
function markup(props: RankRowProps): string {
  const { container, unmount } = render(
    <ul>
      <RankRow {...props} />
    </ul>,
  );
  const html = container.innerHTML;
  unmount();
  return html;
}

// Anything that would make a row read as a verdict.
const LOUD = /accent|signal|error|live|success|danger|warn|animate|transition|motion-/;

describe("RankRow — what it draws", () => {
  it("draws the rank, the name over the company and the points, each isolated", () => {
    render(
      <ul>
        <RankRow {...BASE} />
      </ul>,
    );
    const row = screen.getByRole("listitem");
    expect(screen.getByText("ريم الشهري").tagName).toBe("BDI");
    expect(screen.getByText("بنينسولا ستوري").tagName).toBe("BDI");
    expect(screen.getByText("1,410").tagName).toBe("BDI");
    expect(screen.getByText("5").tagName).toBe("BDI");
    // In order: rank, the avatar's initial (aria-hidden), name, company, points.
    expect(row.textContent).toBe("المركز 55رريم الشهريبنينسولا ستوري1,410 نقطة1,410");
    expect(screen.getByText("المركز 5")).toHaveClass("sr-only");
    expect(screen.getByText("5")).toHaveAttribute("aria-hidden", "true");
  });

  it("★ draws initials in the team ring and never a photograph (DEC-183 §3)", () => {
    const { container } = render(
      <ul>
        <RankRow {...BASE} />
      </ul>,
    );
    expect(container.querySelector("img")).toBeNull();
    const avatar = container.querySelector("[aria-hidden='true'].border-team") as HTMLElement;
    expect(avatar).not.toBeNull();
    expect(avatar.style.getPropertyValue("--team")).toBe("#ff4fb8");
    expect(avatar.textContent).toBe("ر");
  });

  it("a company with no colour gets the neutral ring; a member with no company gets no company line", () => {
    const { container } = render(
      <ul>
        <RankRow {...BASE} teamColor={null} company={null} />
      </ul>,
    );
    expect(container.querySelector(".border-team-neutral")).not.toBeNull();
    expect(container.innerHTML).not.toContain("--team");
    expect(screen.queryByText("بنينسولا ستوري")).toBeNull();
  });

  it("uses Western digits for the rank whatever the locale", () => {
    render(
      <ul>
        <RankRow {...BASE} rank={12} rankLabel="المركز 12" />
      </ul>,
    );
    expect(screen.getByText("12")).toBeInTheDocument();
  });
});

describe("RankRow — ★★ a row whose rank fell carries no colour, no icon and no motion", () => {
  const neutral = markup(BASE);

  it.each([
    ["fell from 3 to 5", { previousRank: 3, riseLabel: "تقدّم مركزين" }],
    ["a tie (5 → 5)", { previousRank: 5, riseLabel: "…" }],
    ["previousRank 0", { previousRank: 0, riseLabel: "…" }],
    ["previousRank NaN", { previousRank: Number.NaN, riseLabel: "…" }],
  ])("%s renders byte-identically to a row with no movement", (_, movement) => {
    const html = markup({ ...BASE, movement });
    expect(html).toBe(neutral);
    expect(html).not.toContain("<svg");
    if (movement.riseLabel !== "…") expect(html).not.toContain(movement.riseLabel);
  });

  it("and holds no loud class and no inline style but the avatar's --team", () => {
    const { container } = render(
      <ul>
        <RankRow {...BASE} movement={{ previousRank: 3, riseLabel: "تقدّم مركزين" }} />
      </ul>,
    );
    for (const el of container.querySelectorAll("*")) {
      expect(el.getAttribute("class") ?? "", el.outerHTML.slice(0, 80)).not.toMatch(LOUD);
      const style = el.getAttribute("style");
      if (style !== null) expect(style.replace(/\s/g, "")).toBe("--team:#ff4fb8;");
    }
  });

  it("the viewer's own row that fell is the viewer's own row, unchanged", () => {
    const self = { ...BASE, selfLabel: "أنت" };
    expect(markup({ ...self, movement: { previousRank: 2, riseLabel: "…" } })).toBe(markup(self));
  });

  it("★ guard against a vacuous pass: a row that ROSE does differ, and carries the marker", () => {
    const risen = markup({ ...BASE, movement: { previousRank: 7, riseLabel: "تقدّم مركزين" } });
    expect(risen).not.toBe(neutral);
    expect(risen).toContain("<svg");
    expect(risen).toContain('data-direction="up"');
    expect(risen).toContain("تقدّم مركزين");
  });
});

describe("RankRow — the rise, and the viewer's own row", () => {
  it("names the rise in words beside an arrow, so colour is never the only channel", () => {
    render(
      <ul>
        <RankRow {...BASE} movement={{ previousRank: 6, riseLabel: "تقدّم مركزًا واحدًا" }} />
      </ul>,
    );
    const label = screen.getByText("تقدّم مركزًا واحدًا");
    expect(label).toHaveClass("sr-only");
    expect(label.parentElement?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  it("★ the viewer's row is outlined AND says it is theirs in visible words, keeping the name", () => {
    render(
      <ul>
        <RankRow {...BASE} selfLabel="أنت" />
      </ul>,
    );
    const word = screen.getByText("أنت");
    expect(word).not.toHaveClass("sr-only");
    expect(screen.getByText("ريم الشهري")).toBeInTheDocument();
    expect(screen.getByRole("listitem").className).toContain("border-accent");
  });

  it("another member's row is not outlined", () => {
    render(
      <ul>
        <RankRow {...BASE} />
      </ul>,
    );
    expect(screen.getByRole("listitem").className).not.toContain("border-accent");
  });
});

describe("RankRow — the link", () => {
  it("names the link by the member, and stretches it over the whole row", () => {
    render(
      <ul>
        <RankRow {...BASE} href="/app/members/m-reem" />
      </ul>,
      { wrapper: Wrap },
    );
    const link = screen.getByRole("link", { name: "ريم الشهري" });
    expect(link.getAttribute("href")).toMatch(/\/app\/members\/m-reem$/);
    expect(link.className).toContain("after:inset-0");
    expect(screen.getByRole("listitem").className).toContain("relative");
    expect(screen.getByRole("listitem").className).toContain("min-h-14");
  });

  it("has no axe violations — plain, self, risen and linked", async () => {
    const { container } = render(
      <ul>
        <RankRow {...BASE} />
        <RankRow {...BASE} memberId="m-2" selfLabel="أنت" movement={{ previousRank: 9, riseLabel: "تقدّم أربعة مراكز" }} />
        <RankRow {...BASE} memberId="m-3" href="/app/members/m-3" />
      </ul>,
      { wrapper: Wrap },
    );
    await expectAccessible(container);
  });
});

describe("RankRow — the source", () => {
  const source = readFileSync("src/components/ui/rank-row.tsx", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");

  it("★ nothing moves (DEC-186 §4), and no physical direction", () => {
    expect(source).not.toMatch(/\btransition|\banimate-|@keyframes|\.animate\(/);
    expect(source).not.toMatch(/\b(?:ml|mr|pl|pr|left|right)-|text-left|text-right/);
    expect(source).not.toMatch(/overflow-hidden|truncate/);
  });

  it("★ passes no `src` to the avatar", () => {
    expect(source).not.toMatch(/\bsrc\b/);
  });
});

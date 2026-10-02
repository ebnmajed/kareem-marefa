// `<Podium>` — REQ-UIX-081, REQ-UIX-078, DEC-216 §5.10, DEC-218 §3.4, §3.7. Static; DOM order is rank order; initials
// only; the collapse to `rank-row`s is CSS and only one of the two is ever displayed.
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { PodiumPlace } from "@/components/ui";
import { Podium } from "@/components/ui/podium";

function Wrap({ children }: { children: ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={{}}>
      {children}
    </NextIntlClientProvider>
  );
}

const place = (rank: number, name: string, extra: Partial<PodiumPlace> = {}): PodiumPlace => ({
  rank,
  rankLabel: `المركز ${rank}`,
  memberId: `m-${rank}-${name}`,
  displayName: name,
  company: "صنف",
  teamColor: "#ff9a2e",
  points: String(300 - rank * 10),
  pointsLabel: `${300 - rank * 10} نقطة`,
  href: `/app/members/m-${rank}`,
  ...extra,
});

const THREE = [place(1, "سارة القحطاني"), place(2, "فهد العنزي"), place(3, "محمد الدوسري")];

function mount(places: PodiumPlace[]) {
  return render(
    <Wrap>
      <Podium label="المراكز الأولى" places={places} />
    </Wrap>,
  ).container;
}

describe("ui/podium", () => {
  it("★ DOM order is rank order; the eye's 2 · 1 · 3 is CSS order", () => {
    const podium = mount(THREE).querySelector("[data-slot=podium]")!;
    const items = Array.from(podium.children);
    expect(items.map((li) => li.textContent)).toEqual([expect.stringContaining("سارة"), expect.stringContaining("فهد"), expect.stringContaining("محمد")]);
    expect(items.map((li) => li.getAttribute("class")!.match(/order-\d/)![0])).toEqual(["order-2", "order-1", "order-3"]);
  });

  it("the cup stands over the first only, and the blocks are the three podium colours by position", () => {
    const podium = mount(THREE).querySelector("[data-slot=podium]")!;
    const items = Array.from(podium.children);
    expect(items[0].querySelector("svg")).not.toBeNull();
    expect(items[1].querySelector("svg")).toBeNull();
    const blocks = Array.from(podium.querySelectorAll("[data-slot=block]")).map((b) => b.getAttribute("class")!.match(/bg-podium-\d/)![0]);
    expect(blocks).toEqual(["bg-podium-1", "bg-podium-2", "bg-podium-3"]);
  });

  it("★ a tie keeps its ranks: the number is the place's rank, the height its position", () => {
    const podium = mount([place(1, "أ"), place(1, "ب"), place(3, "ج")]).querySelector("[data-slot=podium]")!;
    const ranks = Array.from(podium.querySelectorAll("[data-slot=block] bdi")).filter((_, i) => i % 2 === 0).map((b) => b.textContent);
    expect(ranks).toEqual(["1", "1", "3"]);
  });

  it("★ initials only — no photograph anywhere (DEC-099)", () => {
    expect(mount(THREE).querySelector("img")).toBeNull();
  });

  it("the viewer's place says «أنت» in words and is outlined", () => {
    const podium = mount([THREE[0], place(2, "يمان", { selfLabel: "أنت" }), THREE[2]]).querySelector("[data-slot=podium]")!;
    const mine = Array.from(podium.children)[1];
    expect(mine.textContent).toContain("أنت");
    expect(mine.querySelector("[data-slot=block]")!.getAttribute("class")).toContain("outline-accent");
  });

  it("★ the collapse is CSS — the podium shown only where three fit and motion is allowed; the rows the rest of the time", () => {
    const c = mount(THREE);
    expect(c.querySelector("[data-slot=podium]")!.getAttribute("class")).toMatch(/\bhidden\b.*motion-safe:@min-\[21rem\]:flex/);
    expect(c.querySelector("[data-slot=rows]")!.getAttribute("class")).toContain("motion-safe:@min-[21rem]:hidden");
    expect(c.querySelectorAll("[data-slot=rows] > li")).toHaveLength(3);
  });

  it("fewer than three draws fewer; none draws nothing", () => {
    expect(mount(THREE.slice(0, 2)).querySelectorAll("[data-slot=podium] > li")).toHaveLength(2);
    expect(mount([]).innerHTML).toBe("");
  });

  it("is a named group", () => {
    mount(THREE);
    expect(screen.getByRole("group", { name: "المراكز الأولى" })).toBeTruthy();
  });

  it("★ static: no keyframe, no transition, no hover scale, no hex", () => {
    expect(readFileSync("src/components/ui/podium.tsx", "utf8").replace(/^\s*\/\/.*$/gm, "")).not.toMatch(/animate-|transition|hover:scale|@keyframes|#[0-9a-fA-F]{3,8}\b/);
  });

  it("is axe-clean", async () => {
    const { violations } = await axe.run(mount(THREE), { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

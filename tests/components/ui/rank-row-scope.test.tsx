// `ui/rank-row` inside the playground's scope — DEC-199 §3 – §4, REQ-UIX-050, REQ-UIX-037.
//
// `rank-row.test.tsx` holds what the row IS and never speaks of the scope it was
// born in; `tests/unit/ui-playground.test.ts` found that. This renders it on both
// of the scope's grounds. Written by the lead as `scoring`'s custodian (wave 17).
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import type { RankRowProps } from "@/components/ui";
import { RankRow } from "@/components/ui/rank-row";
import { PlayScope } from "@/components/ui/scope";

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

function mount(props: Partial<RankRowProps>, light = false) {
  return render(
    <NextIntlClientProvider locale="ar" messages={{}}>
      <PlayScope light={light}>
        <ul>
          <RankRow {...BASE} {...props} />
        </ul>
      </PlayScope>
    </NextIntlClientProvider>,
  ).container;
}

describe("ui/rank-row — inside the scope", () => {
  it.each([false, true])("renders inside the scope's element (light: %s) and names no raw palette colour of its own", (light) => {
    const container = mount({}, light);
    expect(container.querySelector("li")!.closest(".theme-play")).not.toBeNull();
    // Its own source: the avatar it draws is `ui/avatar`'s, with its own scope test.
    expect(readFileSync("src/components/ui/rank-row.tsx", "utf8")).not.toMatch(/\b(?:navy|silver|slate)-\d/);
  });

  it("the viewer's own row is outlined in the accent — and in the heading ink on the light ground, where lime is 1.07:1", () => {
    const self = mount({ selfLabel: "أنت" }).querySelector("li")!;
    expect(self.getAttribute("class")).toContain("border-accent");
    expect(self.getAttribute("class")).toContain("pg-light:border-fg-heading");
  });

  it("a rise is shown in the accent with the same light-ground rule; a fall is the neutral row", () => {
    const rose = mount({ movement: { previousRank: 7, riseLabel: "صعدت مركزين" } });
    const marker = rose.querySelector("[data-slot='rise']")!;
    expect(marker.getAttribute("class")).toContain("text-accent");
    expect(marker.getAttribute("class")).toContain("pg-light:text-fg-heading");
    expect(mount({ movement: { previousRank: 3, riseLabel: "" } }).querySelector("[data-slot='rise']")).toBeNull();
  });

  it("nothing in the row animates or scales on hover (DEC-183 §2)", () => {
    expect(mount({ selfLabel: "أنت", movement: { previousRank: 7, riseLabel: "صعدت" } }).innerHTML).not.toMatch(/animate-|hover:scale/);
  });
});

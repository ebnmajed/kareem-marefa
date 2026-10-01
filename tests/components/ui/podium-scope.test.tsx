// `ui/podium` inside the playground's scope — DEC-199 §3 – §4, REQ-UIX-050, REQ-UIX-081. Born inside it.
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { Podium } from "@/components/ui/podium";
import { PlayScope } from "@/components/ui/scope";

function mount(light = false) {
  return render(
    <NextIntlClientProvider locale="ar" messages={{}}>
      <PlayScope light={light}>
        <Podium
          label="المراكز الأولى"
          places={[
            { rank: 1, rankLabel: "المركز 1", memberId: "m-1", displayName: "سارة", company: null, teamColor: null, points: "210", pointsLabel: "210 نقطة", selfLabel: "أنت" },
          ]}
        />
      </PlayScope>
    </NextIntlClientProvider>,
  ).container;
}

describe("ui/podium — inside the scope", () => {
  it.each([false, true])("renders inside the scope's element (light: %s)", (light) => {
    expect(mount(light).querySelector("[role=group]")!.closest(".theme-play")).not.toBeNull();
  });

  it("the blocks carry the on-level ink, and the viewer's outline takes the heading ink on the light ground", () => {
    const block = mount(true).querySelector("[data-slot=block]")!;
    expect(block.getAttribute("class")).toContain("text-on-level");
    expect(block.getAttribute("class")).toContain("pg-light:outline-fg-heading");
  });
});

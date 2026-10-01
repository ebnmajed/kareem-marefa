// `ui/ledger-row` inside the playground's scope — DEC-199 §3 – §4, REQ-UIX-050, REQ-UIX-081. Born inside it.
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { LedgerRow } from "@/components/ui/ledger-row";
import { PlayScope } from "@/components/ui/scope";

function mount(light = false) {
  return render(
    <PlayScope light={light}>
      <ul>
        <LedgerRow value={-50} figure="−50" figureLabel="خُصمت 50 نقطة" title="إلغاء نقاط سابقة" kind="reversal" reversed={{ figure: "+50", figureLabel: "50 نقطة", title: "حضور جلسة" }} />
      </ul>
    </PlayScope>,
  ).container;
}

describe("ui/ledger-row — inside the scope", () => {
  it.each([false, true])("renders inside the scope's element (light: %s)", (light) => {
    expect(mount(light).querySelector("li")!.closest(".theme-play")).not.toBeNull();
  });

  it("a loss takes the deeper signal on the light ground; a gain the heading ink", () => {
    const li = mount(true).querySelector("li")!;
    const [loss, gain] = Array.from(li.querySelectorAll("[data-slot=figure]"));
    expect(loss.getAttribute("class")).toContain("pg-light:text-signal-deep");
    expect(gain.getAttribute("class")).toContain("pg-light:text-fg-heading");
  });
});

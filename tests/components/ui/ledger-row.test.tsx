// `<LedgerRow>` — REQ-UIX-081, REQ-UIX-072, REQ-NFR-007, DEC-216 §5.5, §5.9. One line of a points history: the sign
// at the numeral's inline-start, a loss never colour alone, the cap and the notice explanations, the reversal pair.
import { readFileSync } from "node:fs";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { LedgerRowProps } from "@/components/ui";
import { LedgerRow } from "@/components/ui/ledger-row";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

function mount(props: LedgerRowProps) {
  return render(
    <ul>
      <LedgerRow {...props} />
    </ul>,
  ).container;
}

const ENTRY: LedgerRowProps = { value: 50, figure: "+50", figureLabel: "50 نقطة", title: "حضور جلسة", meta: "الأرقام التي تكذب · أمس 8:02 م" };

describe("ui/ledger-row", () => {
  it("draws the signed figure in an ltr isolate, so the sign leads the digits, and hears it once", () => {
    const li = mount(ENTRY).querySelector("li")!;
    const bdi = li.querySelector("[data-slot=figure] bdi")!;
    expect(bdi.getAttribute("dir")).toBe("ltr");
    expect(bdi.textContent).toBe("+50");
    expect(bdi.getAttribute("aria-hidden")).toBe("true");
    expect(li.querySelector("[data-slot=figure] .sr-only")!.textContent).toBe("50 نقطة");
    expect(li.textContent).not.toMatch(/[٠-٩]/);
  });

  it("★ a loss is the signal tone AND its minus — never colour alone (REQ-NFR-007)", () => {
    const li = mount({ ...ENTRY, value: -50, figure: "−50", figureLabel: "خُصمت 50 نقطة" }).querySelector("li")!;
    const figure = li.querySelector("[data-slot=figure]")!;
    expect(figure.getAttribute("class")).toContain("text-signal");
    expect(figure.textContent).toContain("−50");
  });

  it("a gain is the accent, and the heading ink on the light ground where lime is 1.07:1", () => {
    const cls = mount(ENTRY).querySelector("[data-slot=figure]")!.getAttribute("class")!;
    expect(cls).toContain("text-accent");
    expect(cls).toContain("pg-light:text-fg-heading");
  });

  it("★ the cap form is an explanation: dashed, muted, the figure 0 — no gain, no loss", () => {
    const li = mount({ kind: "cap", value: 0, figure: "0", figureLabel: "0 نقطة", title: "تعليق", meta: "الحد: 3 تعليقات لكل جلسة" }).querySelector("li")!;
    expect(li.getAttribute("data-kind")).toBe("cap");
    expect(li.getAttribute("class")).toContain("border-dashed");
    const figure = li.querySelector("[data-slot=figure]")!;
    expect(figure.textContent).toContain("0");
    expect(figure.getAttribute("class")).not.toMatch(/text-accent|text-signal/);
  });

  it("★ the reversal pair is ONE row: the loss, and beneath it the reversed row struck at 70 %", () => {
    const li = mount({
      kind: "reversal",
      value: -50,
      figure: "−50",
      figureLabel: "خُصمت 50 نقطة",
      title: "إلغاء نقاط سابقة",
      meta: "أُلغي تسجيل الحضور · 16 سبتمبر",
      reversed: { figure: "+50", figureLabel: "50 نقطة", title: "حضور جلسة", meta: "ورشة الإضاءة · 15 سبتمبر" },
    }).querySelector("li")!;
    expect(li.parentElement!.children).toHaveLength(1);
    const reversed = li.querySelector("[data-slot=reversed]")!;
    expect(reversed.getAttribute("class")).toContain("opacity-70");
    expect(reversed.querySelector("[data-slot=title]")!.getAttribute("class")).toContain("line-through");
    expect(reversed.querySelector("[data-slot=figure]")!.getAttribute("class")).toContain("text-accent");
    expect(li.querySelector("[data-slot=title]")!.getAttribute("class")).toContain("text-signal");
  });

  it("the notice form draws no figure at all — the absence of a number is the fact", () => {
    const li = mount({ kind: "notice", title: "لم تُحتسب نقاط الحضور", meta: "اليوم الثاني" }).querySelector("li")!;
    expect(li.querySelector("[data-slot=figure]")).toBeNull();
  });

  it("renders as a div when asked, for a list it does not own", () => {
    const { container } = render(<LedgerRow {...ENTRY} as="div" />);
    expect(container.firstElementChild!.tagName).toBe("DIV");
  });

  it("nothing transitions, animates or scales on hover; no hex and no raw palette", () => {
    const source = readFileSync("src/components/ui/ledger-row.tsx", "utf8").replace(/^\s*\/\/.*$/gm, "");
    expect(source).not.toMatch(/animate-|transition|hover:scale|#[0-9a-fA-F]{3,8}\b|\b(?:navy|silver|slate)-\d/);
  });

  it("is axe-clean in every form", async () => {
    const { container } = render(
      <ul>
        <LedgerRow {...ENTRY} />
        <LedgerRow kind="cap" value={0} figure="0" figureLabel="0 نقطة" title="تعليق" meta="الحد" />
        <LedgerRow kind="reversal" value={-50} figure="−50" figureLabel="خُصمت 50" title="إلغاء" reversed={{ figure: "+50", figureLabel: "50", title: "حضور" }} />
        <LedgerRow kind="notice" title="لم تُحتسب" />
      </ul>,
    );
    await expectAccessible(container);
  });
});

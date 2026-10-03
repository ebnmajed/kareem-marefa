// Wave 22's three cells inside the playground's scope (`REQ-UIX-092`). A new file, so
// `data-table-scope.test.tsx` stays a statement about a whole file (DEC-186 §9).
//
// As that file explains, `<PlayScope>` cannot mount under jsdom (`next/font`), and jsdom applies
// no CSS: what is asserted is that each cell draws with names the scope reassigns — `team`,
// `edge-strong`, the button's own variants — and with no colour of its own.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DataTableActionPair, DataTableSwatchCell, DataTableSwitchCell } from "@/components/ui/data-table";

const RAW = /\b(?:bg|text|border)-(?:navy|silver|white|black|gray|slate|red|green|blue|amber|lime|coral)-?\d*\b/;

describe("data-table's cells inside the scope", () => {
  it("the swatch is painted by the scope's `team` token, its outline by `edge-strong`", () => {
    const { container } = render(
      <div className="theme-play">
        <DataTableSwatchCell color="#35d0ff" colorName="سماوي" />
        <DataTableSwatchCell color={null} colorName="بلا لون" />
      </div>,
    );
    const [painted, none] = container.querySelectorAll("[aria-hidden='true']");
    expect(painted.className).toContain("bg-team");
    expect(none.className).toContain("border-edge-strong");
    expect(container.innerHTML).not.toMatch(RAW);
  });

  it("the pair is the house button's variants, and the switch the house switch — no colour of the cell's own", () => {
    const { container } = render(
      <div className="theme-play">
        <DataTableActionPair rowName="تعليق" primary={{ label: "أخفِ", tone: "danger", onAction: () => {} }} secondary={{ label: "تجاهل", onAction: () => {} }} />
        <DataTableSwitchCell checked label="مفعّل" rowName="تسجيل الحضور" announce={{ on: "مفعّل", off: "معطّل", failed: "لم يُحفظ" }} onCheckedChange={async () => true} />
      </div>,
    );
    expect(screen.getByRole("button", { name: "أخفِ — تعليق" })).toBeVisible();
    expect(screen.getByRole("switch", { name: "مفعّل — تسجيل الحضور" })).toBeChecked();
    expect(container.querySelector("[role='group']")!.className).not.toMatch(RAW);
  });
});

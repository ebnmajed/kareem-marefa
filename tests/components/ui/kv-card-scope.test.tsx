// `ui/kv-card` inside the playground's scope — REQ-UIX-085, REQ-UIX-089. `sessions'` primitive; the lead's stub test
// (contract 2), which `sessions` extends to its plan.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { KvCard } from "@/components/ui/kv-card";
import { PlayScope } from "@/components/ui/scope";

const ROWS = [
  { id: "date", label: "الموعد", value: "الخميس 6:30 م", edit: <input aria-label="الموعد" /> },
  { id: "venue", label: "المكان", value: null },
];

describe("ui/kv-card — inside the scope", () => {
  it("renders read mode as a description list inside the scope, empty values as the caller's mark", () => {
    const { container } = render(
      <PlayScope>
        <KvCard label="الجدولة" rows={ROWS} emptyValue="—" />
      </PlayScope>,
    );
    expect(container.querySelector("[data-slot=kv-card]")!.closest(".theme-play")).not.toBeNull();
    expect(container.querySelectorAll("dt")).toHaveLength(2);
    expect(container.textContent).toContain("—");
    expect(container.innerHTML).not.toMatch(/\bpg(?:-dark|-light)?:|\b(?:animate-|transition|duration-\d)/);
  });

  it("renders the edit twin as one group per editable row and no form", () => {
    const { container } = render(<KvCard label="الجدولة" rows={ROWS} emptyValue="—" mode="edit" />);
    expect(container.querySelectorAll('[role="group"]')).toHaveLength(1);
    expect(container.querySelector("form")).toBeNull();
  });
});

describe("ui/kv-card — `sessions'` cases", () => {
  it("names the card by its visible title when it has one, at the level asked", () => {
    render(<KvCard title="الجدولة" headingLevel={3} rows={ROWS} emptyValue="—" />);
    expect(screen.getByRole("region", { name: "الجدولة" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "الجدولة" })).toBeTruthy();
  });

  it("names the card by `label` when it has no title, and draws no heading", () => {
    render(<KvCard label="الجدولة" rows={ROWS} emptyValue="—" />);
    expect(screen.getByRole("region", { name: "الجدولة" })).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("the edit twin names each group by its row, keeps a row with no `edit` read, and keeps the order", () => {
    const { container } = render(<KvCard label="الجدولة" rows={ROWS} emptyValue="—" mode="edit" />);
    expect(screen.getByRole("group", { name: "الموعد" })).toBeTruthy();
    expect(screen.getByRole("textbox", { name: "الموعد" })).toBeTruthy();
    expect(container.textContent!.indexOf("الموعد")).toBeLessThan(container.textContent!.indexOf("المكان"));
    expect(container.textContent).toContain("—");
  });

  it("renders the actions under the rows", () => {
    render(<KvCard label="الجدولة" rows={ROWS} emptyValue="—" actions={<button type="button">عدّل</button>} />);
    expect(screen.getByRole("button", { name: "عدّل" })).toBeTruthy();
  });
});

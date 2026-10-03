// `ui/layer-list` — REQ-DSG-028, REQ-DSG-024, DEC-093 path 2. ▲▼ are the path, named and described by the row; a tap
// selects (additive with shift or `multi`); a locked row is listed and its hide refused; without `onMove` the rows are
// read-only; the grip is an `aria-hidden` enhancement beside ▲▼, and a drop reports the index.
import { createEvent, fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { LayerList } from "@/components/ui/layer-list";

const labels = { forward: "طبقة إلى الأمام", backward: "طبقة إلى الخلف", show: "إظهار", hide: "إخفاء", locked: "مقفلة", hidden: "مخفية", empty: "لا طبقات", handle: "اسحب" };
const items = [
  { id: "a", name: "العنوان", kindLabel: "نص", selected: true },
  { id: "b", name: "الشعار", kindLabel: "صورة", selected: false, locked: true },
  { id: "c", name: "الخط", kindLabel: "شكل", selected: false, hidden: true },
];

function mount(extra: Partial<Parameters<typeof LayerList>[0]> = {}) {
  const handlers = { onSelect: vi.fn(), onMove: vi.fn(), onToggleHidden: vi.fn(), onReorder: vi.fn() };
  const utils = render(
    <main dir="rtl">
      <LayerList label="الطبقات" items={items} labels={labels} {...handlers} {...extra} />
    </main>,
  );
  return { ...utils, handlers };
}

const row = (name: string) => screen.getByText(name).closest("li") as HTMLElement;

describe("ui/layer-list", () => {
  it("▲▼ move a row, are described by its name, and are disabled at the ends", () => {
    const { handlers } = mount();
    const first = within(row("العنوان"));
    expect(first.getByRole("button", { name: "طبقة إلى الأمام" })).toBeDisabled();
    fireEvent.click(first.getByRole("button", { name: "طبقة إلى الخلف" }));
    expect(handlers.onMove).toHaveBeenCalledWith("a", "backward");
    const forward = within(row("الخط")).getByRole("button", { name: "طبقة إلى الأمام" });
    expect(document.getElementById(forward.getAttribute("aria-describedby")!)!.textContent).toBe("الخط");
    expect(within(row("الخط")).getByRole("button", { name: "طبقة إلى الخلف" })).toBeDisabled();
  });

  it("a tap selects; shift or multi make it additive; the selected row is pressed", () => {
    const { handlers, unmount } = mount();
    const select = (name: string) => within(row(name)).getAllByRole("button")[0]!;
    expect(select("العنوان")).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(select("الشعار"));
    expect(handlers.onSelect).toHaveBeenLastCalledWith("b", { additive: false });
    fireEvent.click(select("الشعار"), { shiftKey: true });
    expect(handlers.onSelect).toHaveBeenLastCalledWith("b", { additive: true });
    unmount();
    const multi = mount({ multi: true });
    fireEvent.click(within(row("الخط")).getAllByRole("button")[0]!);
    expect(multi.handlers.onSelect).toHaveBeenLastCalledWith("c", { additive: true });
  });

  it("a locked row is listed with its word and its hide refused; a hidden row offers «إظهار»", () => {
    const { handlers } = mount();
    expect(within(row("الشعار")).getByText("مقفلة")).toBeInTheDocument();
    expect(within(row("الشعار")).getByRole("button", { name: "إخفاء" })).toBeDisabled();
    fireEvent.click(within(row("الخط")).getByRole("button", { name: "إظهار" }));
    expect(handlers.onToggleHidden).toHaveBeenCalledWith("c");
  });

  it("without onMove and onToggleHidden the rows are read-only, and the grip appears only with onReorder", () => {
    const { container } = render(<LayerList label="الطبقات" items={items} labels={labels} onSelect={() => undefined} />);
    expect(screen.queryByRole("button", { name: "طبقة إلى الأمام" })).toBeNull();
    expect(screen.queryByRole("button", { name: "إخفاء" })).toBeNull();
    expect(container.querySelector("[data-layer-grip]")).toBeNull();
  });

  it("the grip is aria-hidden and a drop reports the row and the index — the enhancement beside ▲▼", () => {
    const { container, handlers } = mount();
    const grips = container.querySelectorAll<HTMLElement>("[data-layer-grip]");
    expect(grips[2]).toHaveAttribute("aria-hidden", "true");
    const dataTransfer = { setData: vi.fn(), effectAllowed: "" };
    fireEvent(grips[2]!, Object.assign(createEvent.dragStart(grips[2]!), { dataTransfer }));
    fireEvent.drop(row("العنوان"));
    expect(handlers.onReorder).toHaveBeenCalledWith("c", 0);
  });

  it("says when there are no layers, and is accessible", async () => {
    render(<LayerList label="الطبقات" items={[]} labels={labels} onSelect={() => undefined} />);
    expect(screen.getByText("لا طبقات")).toBeInTheDocument();
    const { container } = mount();
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

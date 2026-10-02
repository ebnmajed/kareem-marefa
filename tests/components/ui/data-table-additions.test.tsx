// Wave 21's two add-only props on `console`'s `data-table` (`DEC-228` §3.9):
// `stickyHeader` and `renderCard`. Both default off, and the existing suite
// (`data-table.test.tsx`, untouched) is the proof that every caller without
// them renders as before; these cases prove what each prop changes and that
// nothing else moves.
import type React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import ar from "@/messages/ar/admin.json";

interface Row {
  id: string;
  title: string;
  seats: string;
}

const ROWS: Row[] = [
  { id: "r1", title: "ورشة الإضاءة للمبتدئين", seats: "25 / 25" },
  { id: "r2", title: "ما تعلّمناه من إطلاق فاشل", seats: "31 / 40" },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { key: "title", header: "العنوان", cell: (r) => r.title, onCard: true },
  { key: "seats", header: "الحجوزات", cell: (r) => r.seats, onCard: true },
];

function Table(props: Partial<React.ComponentProps<typeof DataTable<Row>>>) {
  return (
    <NextIntlClientProvider locale="ar" messages={ar}>
      <main>
        <DataTable<Row> label="الجلسات" columns={COLUMNS} rows={ROWS} rowKey={(r) => r.id} empty={{ title: "لا جلسات بعد." }} {...props} />
      </main>
    </NextIntlClientProvider>
  );
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => v.id)).toEqual([]);
}

describe("data-table — stickyHeader (add-only)", () => {
  it("off by default: the wrapper scrolls, the header does not stick, the borders collapse — as before", () => {
    const { container } = render(<Table />);
    const table = container.querySelector("table")!;
    expect(table.parentElement!.className).toContain("overflow-x-auto");
    expect(table.className).toContain("border-collapse");
    for (const th of container.querySelectorAll("th")) expect(th.className).not.toContain("sticky");
  });

  it("on: the wrapper clips instead of scrolling (no scroll container), and every header cell sticks under the console bar", () => {
    const { container } = render(<Table stickyHeader selection={{ selected: [], onChange: vi.fn(), label: (n) => `${n}`, actions: null }} />);
    const table = container.querySelector("table")!;
    expect(table.parentElement!.className).toContain("overflow-x-clip");
    expect(table.parentElement!.className).not.toContain("overflow-x-auto");
    expect(table.className).toContain("border-separate");
    const ths = container.querySelectorAll("th");
    expect(ths).toHaveLength(3); // the select-all cell too
    for (const th of ths) expect(th.className).toMatch(/sticky top-\[var\(--console-bar,0px\)\]/);
  });
});

describe("data-table — renderCard (add-only)", () => {
  it("off by default: the phone card keeps its «label · value» rows", () => {
    const { container } = render(<Table />);
    const card = container.querySelectorAll("ul > li")[0] as HTMLElement;
    expect(within(card).getByText("الحجوزات")).toBeInTheDocument();
  });

  it("on: the caller draws the card's body, and the primitive's label rows are gone", () => {
    const { container } = render(
      <Table
        renderCard={(r, { titleId }) => (
          <>
            <p id={titleId}>{r.title}</p>
            <p>{r.seats}</p>
          </>
        )}
      />,
    );
    const card = container.querySelectorAll("ul > li")[0] as HTMLElement;
    expect(within(card).getByText("ورشة الإضاءة للمبتدئين")).toBeInTheDocument();
    expect(within(card).getByText("25 / 25")).toBeInTheDocument();
    expect(within(card).queryByText("الحجوزات")).toBeNull();
  });

  it("on, with selection: the card's checkbox is still named by the caller's title, and still toggles the row", async () => {
    const onChange = vi.fn();
    const { container } = render(
      <Table
        selection={{ selected: [], onChange, label: (n) => `${n}`, actions: null }}
        renderCard={(r, { titleId }) => <p id={titleId}>{r.title}</p>}
      />,
    );
    const card = container.querySelectorAll("ul > li")[0] as HTMLElement;
    const box = within(card).getByRole("checkbox");
    expect(box).toHaveAccessibleName(/ورشة الإضاءة للمبتدئين/);
    await userEvent.click(box);
    expect(onChange).toHaveBeenCalledWith(["r1"]);
    await expectAccessible(container);
  });

  it("the desktop table is untouched by renderCard", () => {
    render(<Table renderCard={(r, { titleId }) => <p id={titleId}>{r.title}</p>} />);
    const table = screen.getByRole("table", { hidden: true });
    expect(within(table).getAllByRole("columnheader", { hidden: true }).map((h) => h.textContent)).toEqual(["العنوان", "الحجوزات"]);
  });
});

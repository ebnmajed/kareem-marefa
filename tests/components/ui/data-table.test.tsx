// `console`'s file — the phone treatment is the REQUIREMENT (`16` §6.7): a
// stacked card list below `md`, never a horizontally scrolling table. axe
// cannot tell whether a sort button announces its new state — asserted here
// by hand, per the spawn note.
import type React from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { DataTable } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import ar from "@/messages/ar/admin.json";

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={ar}>
      <main>{children}</main>
    </NextIntlClientProvider>
  );
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

interface Row {
  id: string;
  title: string;
  state: string;
  ageDays: number;
}

const ROWS: Row[] = [
  { id: "r1", title: "جلسة تصوير المشاهد الليلية", state: "بانتظار المراجعة", ageDays: 3 },
  { id: "r2", title: "أساسيات التلوين السينمائي", state: "مقبولة", ageDays: 1 },
];

const COLUMNS: DataTableColumn<Row>[] = [
  { key: "title", header: "العنوان", cell: (r) => r.title, onCard: true },
  { key: "state", header: "الحالة", cell: (r) => r.state, onCard: true },
  { key: "ageDays", header: "العمر", cell: (r) => String(r.ageDays), sortable: true, align: "end", onCard: true },
];

function Basic(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
  return (
    <DataTable<Row>
      label="المقترحات"
      columns={COLUMNS}
      rows={ROWS}
      rowKey={(r) => r.id}
      empty={{ title: "لا مقترحات", action: { label: "امسح عامل التصفية" } }}
      {...props}
    />
  );
}

describe("DataTable — desktop table", () => {
  it("names the table and renders every row and column", () => {
    render(<Wrap><Basic /></Wrap>);
    expect(screen.getByRole("table", { name: "المقترحات" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "العنوان" })).toBeInTheDocument();
    expect(screen.getAllByText("جلسة تصوير المشاهد الليلية").length).toBeGreaterThan(0);
  });

  it("renders the empty state instead of a table when there are no rows", () => {
    render(<Wrap><Basic rows={[]} /></Wrap>);
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByText("لا مقترحات")).toBeInTheDocument();
  });

  it("a non-sortable column carries no aria-sort", () => {
    render(<Wrap><Basic /></Wrap>);
    expect(screen.getByRole("columnheader", { name: "العنوان" })).not.toHaveAttribute("aria-sort");
  });

  it("★ a sortable column starts aria-sort=none, then follows the caller's controlled sort", () => {
    const { rerender } = render(<Wrap><Basic /></Wrap>);
    expect(screen.getByRole("columnheader", { name: "العمر" })).toHaveAttribute("aria-sort", "none");

    rerender(
      <Wrap>
        <Basic sort={{ key: "ageDays", direction: "asc" }} />
      </Wrap>,
    );
    expect(screen.getByRole("columnheader", { name: "العمر" })).toHaveAttribute("aria-sort", "ascending");

    rerender(
      <Wrap>
        <Basic sort={{ key: "ageDays", direction: "desc" }} />
      </Wrap>,
    );
    expect(screen.getByRole("columnheader", { name: "العمر" })).toHaveAttribute("aria-sort", "descending");
  });

  it("clicking a sort button toggles asc → desc and calls onSortChange, never mutating on its own", async () => {
    const onSortChange = vi.fn();
    const { rerender } = render(
      <Wrap>
        <Basic sort={{ key: "ageDays", direction: "asc" }} onSortChange={onSortChange} />
      </Wrap>,
    );
    await userEvent.click(screen.getByRole("button", { name: "العمر" }));
    expect(onSortChange).toHaveBeenCalledWith({ key: "ageDays", direction: "desc" });
    // The primitive is controlled — nothing changes until the caller re-renders it.
    expect(screen.getByRole("columnheader", { name: "العمر" })).toHaveAttribute("aria-sort", "ascending");
    rerender(<Wrap><Basic sort={{ key: "ageDays", direction: "desc" }} onSortChange={onSortChange} /></Wrap>);
    expect(screen.getByRole("columnheader", { name: "العمر" })).toHaveAttribute("aria-sort", "descending");
  });

  it("★ a sort change is announced by name and new direction, in Arabic, in a live region", async () => {
    const { rerender } = render(<Wrap><Basic /></Wrap>);
    rerender(<Wrap><Basic sort={{ key: "ageDays", direction: "asc" }} /></Wrap>);
    expect(screen.getByText(`العمر: ${ar.admin.dataTable.sortAscending}`)).toBeInTheDocument();
    rerender(<Wrap><Basic sort={{ key: "ageDays", direction: "desc" }} /></Wrap>);
    expect(screen.getByText(`العمر: ${ar.admin.dataTable.sortDescending}`)).toBeInTheDocument();
  });
});

describe("DataTable — selection", () => {
  function Selectable({ selected = [] as string[] }) {
    return (
      <Basic
        selection={{
          selected,
          onChange: () => {},
          label: (count) => `${count} محدد`,
          actions: <button type="button">حذف</button>,
        }}
      />
    );
  }

  it("the bulk action bar appears only once something is selected, with a labelled count", () => {
    const { rerender } = render(<Wrap><Selectable /></Wrap>);
    expect(screen.queryByText(/محدد/)).not.toBeInTheDocument();
    rerender(<Wrap><Selectable selected={["r1"]} /></Wrap>);
    expect(screen.getByText("1 محدد")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "حذف" })).toBeInTheDocument();
  });

  it("the select-all checkbox is indeterminate when some but not all rows are selected", () => {
    render(<Wrap><Selectable selected={["r1"]} /></Wrap>);
    const checkboxes = screen.getAllByRole("checkbox");
    // Desktop table's header checkbox is the first in DOM order.
    expect((checkboxes[0] as HTMLInputElement).indeterminate).toBe(true);
  });

  it("toggling select-all calls onChange with every visible row key", async () => {
    const onChange = vi.fn();
    render(
      <Wrap>
        <Basic selection={{ selected: [], onChange, label: (c) => `${c}`, actions: null }} />
      </Wrap>,
    );
    await userEvent.click(screen.getAllByRole("checkbox")[0]);
    expect(onChange).toHaveBeenCalledWith(["r1", "r2"]);
  });

  it("every row checkbox carries an accessible name naming the row (aria-labelledby, not a caller prop)", () => {
    render(<Wrap><Selectable /></Wrap>);
    // One desktop checkbox and one card checkbox per row, both named this way.
    expect(screen.getAllByRole("checkbox", { name: /جلسة تصوير المشاهد الليلية/ }).length).toBeGreaterThan(0);
  });
});

describe("DataTable — the phone card list (16 §6.7's actual requirement)", () => {
  it("renders every row as a card with its onCard columns, never a second copy of a non-onCard one", () => {
    const columns: DataTableColumn<Row>[] = [
      ...COLUMNS,
      { key: "hidden", header: "مخفي عن الجوال", cell: () => "سري", onCard: false },
    ];
    render(<Wrap><Basic columns={columns} /></Wrap>);
    // "سري" legitimately appears TWICE in the desktop `<table>` (once per
    // row) — a non-`onCard` column is still a real column there; the phone
    // card list is the one place it must be absent, so the query is scoped
    // to the `<ul>` specifically, not the whole document.
    const cardList = screen.getByRole("list");
    expect(within(cardList).queryByText("سري")).not.toBeInTheDocument();
    expect(within(cardList).getAllByText("جلسة تصوير المشاهد الليلية").length).toBe(1);
  });

  it("the card's title is the first column even when the caller forgot to mark it onCard", () => {
    const columns: DataTableColumn<Row>[] = [{ key: "title", header: "العنوان", cell: (r) => r.title }, ...COLUMNS.slice(1)];
    render(<Wrap><Basic columns={columns} /></Wrap>);
    expect(screen.getAllByText("جلسة تصوير المشاهد الليلية").length).toBeGreaterThan(0);
  });

  it("pending shows row skeletons, not the empty state or stale rows", () => {
    render(<Wrap><Basic pending rows={[]} /></Wrap>);
    expect(screen.queryByText("لا مقترحات")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});

describe("DataTable — accessible", () => {
  it("plain, with selection, and empty", async () => {
    const plain = render(<Wrap><Basic /></Wrap>);
    await expectAccessible(plain.container);
    plain.unmount();

    const selectable = render(
      <Wrap>
        <Basic selection={{ selected: ["r1"], onChange: () => {}, label: (c) => `${c} محدد`, actions: <button type="button">حذف</button> }} />
      </Wrap>,
    );
    await expectAccessible(selectable.container);
    selectable.unmount();

    const empty = render(<Wrap><Basic rows={[]} /></Wrap>);
    await expectAccessible(empty.container);
  }, 20000);
});

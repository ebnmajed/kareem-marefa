// Wave 22's three cells on `console`'s `data-table` (`REQ-UIX-092`, `DEC-230` §4, `DEC-232` §3.4).
// Add-only: `data-table.test.tsx`, `data-table-additions.test.tsx` and `data-table-scope.test.tsx`
// are untouched and are the proof that nothing else moved. These cases prove what each cell does,
// in the table AND in the phone card — both render `col.cell(row)`.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { DataTable, DataTableActionPair, DataTableSwatchCell, DataTableSwitchCell } from "@/components/ui/data-table";
import type { DataTableColumn } from "@/components/ui";
import ar from "@/messages/ar/admin.json";

interface Row {
  id: string;
  name: string;
  enabled: boolean;
  color: string | null;
  colorName: string;
}

const ROWS: Row[] = [
  { id: "r1", name: "تسجيل الحضور", enabled: true, color: "#35d0ff", colorName: "سماوي" },
  { id: "r2", name: "تقييم الجلسة", enabled: false, color: null, colorName: "بلا لون" },
];

const ANNOUNCE = { on: "مفعّل", off: "معطّل", failed: "لم يُحفظ" };

function Table({ columns }: { columns: DataTableColumn<Row>[] }) {
  return (
    <NextIntlClientProvider locale="ar" messages={ar}>
      <main>
        <DataTable<Row> label="القواعد" columns={columns} rows={ROWS} rowKey={(r) => r.id} empty={{ title: "لا قواعد", action: { label: "أضف" } }} />
      </main>
    </NextIntlClientProvider>
  );
}

const table = () => screen.getByRole("table");
const cards = () => screen.getAllByRole("list").find((l) => l.tagName === "UL")!;

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => v.id)).toEqual([]);
}

describe("DataTableSwitchCell", () => {
  const columns = (onChange: (row: Row, next: boolean) => Promise<boolean>): DataTableColumn<Row>[] => [
    { key: "name", header: "الفعل", onCard: true, cell: (r) => r.name },
    {
      key: "enabled",
      header: "مفعّل",
      onCard: true,
      cell: (r) => <DataTableSwitchCell checked={r.enabled} label="مفعّل" rowName={r.name} announce={ANNOUNCE} onCheckedChange={(next) => onChange(r, next)} />,
    },
  ];

  it("is a real switch named by the column AND the row, in the table and in the card", () => {
    render(<Table columns={columns(async () => true)} />);
    for (const scope of [table(), cards()]) {
      expect(within(scope).getByRole("switch", { name: "مفعّل — تسجيل الحضور" })).toBeChecked();
      expect(within(scope).getByRole("switch", { name: "مفعّل — تقييم الجلسة" })).not.toBeChecked();
    }
  });

  it("calls the row's handler with the next value and announces the answer with the row's name", async () => {
    const onChange = vi.fn(async () => true);
    render(<Table columns={columns(onChange)} />);
    await userEvent.click(within(table()).getByRole("switch", { name: "مفعّل — تقييم الجلسة" }));
    expect(onChange).toHaveBeenCalledWith(ROWS[1], true);
    expect(await within(table()).findByText("تقييم الجلسة: مفعّل")).toBeInTheDocument();
  });

  it("★ never flips itself: a refused change stays at the server's value and says it was not saved", async () => {
    render(<Table columns={columns(async () => false)} />);
    const sw = within(table()).getByRole("switch", { name: "مفعّل — تسجيل الحضور" });
    await userEvent.click(sw);
    expect(await within(table()).findByText("تسجيل الحضور: لم يُحفظ")).toBeInTheDocument();
    expect(sw).toBeChecked();
  });

  it("a handler that throws is a refusal, not a success", async () => {
    render(
      <Table
        columns={columns(async () => {
          throw new Error("boom");
        })}
      />,
    );
    await userEvent.click(within(table()).getByRole("switch", { name: "مفعّل — تسجيل الحضور" }));
    expect(await within(table()).findByText("تسجيل الحضور: لم يُحفظ")).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = render(<Table columns={columns(async () => true)} />);
    await expectAccessible(container);
  });
});

describe("DataTableActionPair", () => {
  const columns = (hide: () => Promise<unknown>, dismiss: () => Promise<unknown>): DataTableColumn<Row>[] => [
    { key: "name", header: "المحتوى", onCard: true, cell: (r) => r.name },
    {
      key: "actions",
      header: "القرار",
      onCard: true,
      cell: (r) => <DataTableActionPair rowName={r.name} primary={{ label: "أخفِ", tone: "danger", onAction: hide }} secondary={{ label: "تجاهل", onAction: dismiss }} />,
    },
  ];

  it("two buttons, each named by its word and the row, grouped under the row's name — in the table and the card", () => {
    render(<Table columns={columns(async () => {}, async () => {})} />);
    for (const scope of [table(), cards()]) {
      const group = within(scope).getByRole("group", { name: "تسجيل الحضور" });
      expect(within(group).getByRole("button", { name: "أخفِ — تسجيل الحضور" })).toBeVisible();
      expect(within(group).getByRole("button", { name: "تجاهل — تسجيل الحضور" })).toBeVisible();
    }
  });

  it("★ one decision at a time: both are disabled while either runs, and free again after", async () => {
    let finish: () => void = () => {};
    const hide = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const dismiss = vi.fn(async () => {});
    render(<Table columns={columns(hide, dismiss)} />);
    const group = within(table()).getByRole("group", { name: "تسجيل الحضور" });
    await userEvent.click(within(group).getByRole("button", { name: "أخفِ — تسجيل الحضور" }));
    expect(within(group).getByRole("button", { name: /تجاهل — تسجيل الحضور/ })).toBeDisabled();
    await userEvent.click(within(group).getByRole("button", { name: /تجاهل — تسجيل الحضور/ }));
    expect(dismiss).not.toHaveBeenCalled();
    finish();
    await vi.waitFor(() => expect(within(group).getByRole("button", { name: "تجاهل — تسجيل الحضور" })).toBeEnabled());
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it("has no axe violations", async () => {
    const { container } = render(<Table columns={columns(async () => {}, async () => {})} />);
    await expectAccessible(container);
  });
});

describe("DataTableSwatchCell", () => {
  const columns: DataTableColumn<Row>[] = [
    { key: "name", header: "الشركة", onCard: true, cell: (r) => <DataTableSwatchCell color={r.color} colorName={r.colorName}><bdi>{r.name}</bdi></DataTableSwatchCell> },
  ];

  it("★ never colour alone: the colour's name is drawn beside the swatch, in the table and the card", () => {
    render(<Table columns={columns} />);
    for (const scope of [table(), cards()]) {
      expect(within(scope).getByText("سماوي")).toBeVisible();
      expect(within(scope).getByText("بلا لون")).toBeVisible();
    }
  });

  it("the colour reaches the swatch as `--team` and nowhere else; none draws the outlined ring with no `--team`", () => {
    const { container } = render(<Table columns={columns} />);
    const swatches = container.querySelectorAll("table [aria-hidden='true'].size-4");
    expect(swatches).toHaveLength(2);
    expect((swatches[0] as HTMLElement).style.getPropertyValue("--team")).toBe("#35d0ff");
    expect(swatches[0].className).toContain("bg-team");
    expect((swatches[1] as HTMLElement).style.getPropertyValue("--team")).toBe("");
    expect(swatches[1].className).toContain("border-edge-strong");
  });

  it("without children it is the colour's name alone", () => {
    render(<DataTableSwatchCell color="#ffd23f" colorName="ذهبي" />);
    expect(screen.getByText("ذهبي")).toBeVisible();
  });
});

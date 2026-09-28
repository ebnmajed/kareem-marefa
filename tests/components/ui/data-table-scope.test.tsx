// `console`'s file — DEC-186 §9: new wave-15 cases live in a file of their
// own, never appended to `data-table.test.tsx`, so "the existing suites are
// untouched" stays a statement about whole files.
//
// This is a token migration, not a behaviour change (DEC-183 §4.17,
// `.claude/agents/console.md`): every class `data-table.tsx` had before this
// wave is still there, unedited (`tests/unit/tokens-only.test.ts` proves the
// mechanism at the file level; this proves the two `pg:` additions render on
// the right element, beside the class that was already there — not in place
// of it).
//
// ★ Not wrapped in `<PlayScope>`: `ui/scope.tsx` imports `next/font/google`
// (`src/lib/fonts.ts`), which `vitest.config.ts`'s `components` project has no
// alias for (`IBM_Plex_Sans is not a function` under jsdom — found writing
// this file, reported to the lead, not fixed here: `vitest.config.ts` is
// lead-only). jsdom applies no CSS regardless, so a real `.theme-play`
// ancestor would change nothing observable here either way — the assertion
// is that the `pg:` class STRING is present on the element, which does not
// need the scope mounted.
import type React from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
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

interface Row {
  id: string;
  title: string;
}

const ROWS: Row[] = [
  { id: "r1", title: "جلسة تصوير المشاهد الليلية" },
  { id: "r2", title: "أساسيات التلوين السينمائي" },
];

const COLUMNS: DataTableColumn<Row>[] = [{ key: "title", header: "العنوان", cell: (r) => r.title, onCard: true }];

function Table(props: Partial<React.ComponentProps<typeof DataTable<Row>>> = {}) {
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

describe("DataTable — the playground's scope, token-only", () => {
  it("the selection banner keeps its resting fill and gains the scope's raised step", () => {
    render(
      <Wrap>
        <Table selection={{ selected: ["r1"], onChange: () => {}, label: (n) => `${n} محدّدة`, actions: null }} />
      </Wrap>,
    );
    const banner = screen.getByText("1 محدّدة").closest("div");
    expect(banner).toHaveClass("bg-silver-100");
    expect(banner).toHaveClass("pg:bg-raised");
  });

  it("a desktop row keeps its resting-state class and gains the scope's hover step", () => {
    render(
      <Wrap>
        <Table />
      </Wrap>,
    );
    const row = screen.getByRole("row", { name: /جلسة تصوير المشاهد الليلية/ });
    expect(row).toHaveClass("hover:bg-silver-100/60");
    expect(row).toHaveClass("pg:hover:bg-hover");
  });
});

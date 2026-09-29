// `console`'s file — DEC-186 §9: new wave-15 cases live in a file of their
// own. Token migration, not a behaviour change: every class `tabs.tsx` had
// before this wave is still there, unedited; this proves the `pg:`
// additions land beside them. Not wrapped in `<PlayScope>` — see
// `data-table-scope.test.tsx`'s header comment (`next/font/google` has no
// jsdom alias in `vitest.config.ts`, a lead-only file).
import { render, screen } from "@testing-library/react";
import { Direction } from "radix-ui";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import { Tabs } from "@/components/ui/tabs";

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={{}}>
      <Direction.Provider dir="rtl">{children}</Direction.Provider>
    </NextIntlClientProvider>
  );
}

describe("Tabs — the playground's scope, token-only", () => {
  it("the count badge keeps its resting fill and gains the scope's raised step", () => {
    render(
      <Wrap>
        <Tabs label="أقسام" defaultValue="pending" items={[{ value: "pending", label: "قيد المراجعة", count: 3 }]}>
          <p>لوحة</p>
        </Tabs>
      </Wrap>,
    );
    const badge = screen.getByText("3");
    expect(badge).toHaveClass("bg-silver-100");
    expect(badge).toHaveClass("pg:bg-raised");
  });

  it("the active tab keeps its underline colour and gains the scope's accent", () => {
    render(
      <Wrap>
        <Tabs label="أقسام" defaultValue="pending" items={[{ value: "pending", label: "قيد المراجعة" }, { value: "approved", label: "مقبولة" }]}>
          <p>لوحة</p>
        </Tabs>
      </Wrap>,
    );
    const active = screen.getByRole("tab", { name: "قيد المراجعة" });
    expect(active).toHaveClass("data-[state=active]:border-[var(--btn-bg)]");
    expect(active).toHaveClass("pg:data-[state=active]:border-accent");
  });
});

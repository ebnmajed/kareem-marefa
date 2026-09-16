// The house tabs over Radix (DEC-019). Two usages: in-page panel switching
// (no `href`) and router-integrated tabs (`href`, Radix's own documented
// `asChild` pattern) — both share one `role="tablist"`.
import type React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Direction } from "radix-ui";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Tabs } from "@/components/ui/tabs";

// `<Link>` (`@/i18n/navigation`) reads the active locale from next-intl's
// context — the same wrapper `tests/components/ui/badge.test.tsx` uses.
function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={{}}>
      <Direction.Provider dir="rtl">{children}</Direction.Provider>
    </NextIntlClientProvider>
  );
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

function StatefulExample() {
  return (
    <Tabs
      label="أقسام لوحة الإدارة"
      defaultValue="pending"
      items={[
        { value: "pending", label: "قيد المراجعة", count: 3 },
        { value: "approved", label: "مقبولة", count: 12 },
      ]}
    >
      <p>لوحة المحتوى</p>
    </Tabs>
  );
}

function LinkExample() {
  return (
    <Tabs
      label="سجل التدقيق"
      value="reports"
      items={[
        { value: "comments", label: "التعليقات", href: "/app/admin/moderation/comments" },
        { value: "reports", label: "البلاغات", href: "/app/admin/moderation/reports" },
      ]}
    />
  );
}

describe("Tabs", () => {
  it("renders a tablist naming the strip, with a selected tab", () => {
    render(<Wrap><StatefulExample /></Wrap>);
    expect(screen.getByRole("tablist", { name: "أقسام لوحة الإدارة" })).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: /قيد المراجعة/ })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: /مقبولة/ })).toHaveAttribute("aria-selected", "false");
  });

  it("formats the count in western digits by default", () => {
    render(<Wrap><StatefulExample /></Wrap>);
    expect(screen.getByRole("tab", { name: /مقبولة/ })).toHaveTextContent("12");
  });

  it("switches the active tab with the keyboard, RTL-aware (Radix's own roving tabindex)", async () => {
    render(<Wrap><StatefulExample /></Wrap>);
    const first = screen.getByRole("tab", { name: /قيد المراجعة/ });
    first.focus();
    // In an RTL tablist Radix's ArrowLeft moves to the NEXT tab in reading
    // order — this is Radix's own direction handling, not something this
    // wrapper implements.
    await userEvent.keyboard("{ArrowLeft}");
    expect(screen.getByRole("tab", { name: /مقبولة/ })).toHaveFocus();
  });

  it("every aria-controls a trigger carries resolves to a rendered element (WCAG 4.1.2)", () => {
    const { container } = render(<Wrap><StatefulExample /></Wrap>);
    for (const tab of screen.getAllByRole("tab")) {
      const controls = tab.getAttribute("aria-controls");
      expect(controls).toBeTruthy();
      expect(container.querySelector(`#${CSS.escape(controls!)}`)).toBeInTheDocument();
    }
  });

  it("a tab with an href is a real link and reflects the caller's current value", () => {
    render(<Wrap><LinkExample /></Wrap>);
    const reportsTab = screen.getByRole("tab", { name: "البلاغات" });
    expect(reportsTab.tagName).toBe("A");
    // `<Link>` prefixes the active locale — `i18n/navigation`'s own contract.
    expect(reportsTab).toHaveAttribute("href", "/ar/app/admin/moderation/reports");
    expect(reportsTab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("tab", { name: "التعليقات" })).toHaveAttribute("aria-selected", "false");
  });

  it("is accessible, stateful and link-based", async () => {
    const stateful = render(<Wrap><StatefulExample /></Wrap>);
    await expectAccessible(stateful.container);
    stateful.unmount();
    const linked = render(<Wrap><LinkExample /></Wrap>);
    await expectAccessible(linked.container);
  }, 20000);
});

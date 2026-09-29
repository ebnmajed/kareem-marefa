// `<EmptyState>` inside the playground's scope — DEC-183, DEC-186 §2, REQ-UIX-030, REQ-UIX-012.
//
// New cases live here, never in `empty-state.test.tsx`, which is evidence (DEC-186 §9).
import type React from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { EmptyState } from "@/components/ui/empty-state";
import ar from "@/messages/ar/browse.json";

function Wrap({ scope, children }: { scope?: boolean; children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={ar}>
      <div className={scope ? "theme-play" : undefined}>{children}</div>
    </NextIntlClientProvider>
  );
}

function classes(el: Element | null): string[] {
  return (el?.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

// The class strings as they stood at `886260a`, before wave 15.
const BEFORE_BOX = "flex flex-col items-center gap-3 rounded-card border border-edge px-6 text-center py-14".split(" ");
const BEFORE_TITLE = "font-medium text-fg-heading text-h3".split(" ");

function expectAdded(el: Element | null, before: string[], added: string[]) {
  const got = classes(el);
  for (const cls of before) expect(got, cls).toContain(cls);
  expect(got.filter((c) => !before.includes(c)).sort()).toEqual([...added].sort());
}

describe("EmptyState — the scope adds, it never replaces", () => {
  it("the box keeps every class and adds the panel radius", () => {
    const { container } = render(
      <Wrap>
        <EmptyState title="لا جلسات بعد" action={{ label: "اقترح جلسة", href: "/app/propose" }} />
      </Wrap>,
    );
    // The first child is `Wrap`'s own `<div>`; the component's box is inside it.
    expectAdded(container.firstElementChild!.firstElementChild, BEFORE_BOX, ["pg:rounded-panel"]);
  });

  it("the title keeps every class and adds the display face at 700", () => {
    render(
      <Wrap>
        <EmptyState title="لا جلسات بعد" action={{ label: "اقترح جلسة", href: "/app/propose" }} />
      </Wrap>,
    );
    expectAdded(screen.getByText("لا جلسات بعد"), BEFORE_TITLE, ["pg:font-display", "pg:font-bold"]);
  });

  it("still names what to do next inside the scope — never a dead end (REQ-UIX-012)", () => {
    render(
      <Wrap scope>
        <EmptyState
          title="لا نتائج لهذا البحث"
          description="جرّب كلمة أخرى، أو امسح عامل التصفية."
          action={{ label: "امسح الكل", href: "/app/sessions" }}
          clearFilter={{ label: "امسح عامل التصفية: فني", href: "/app/sessions" }}
        />
      </Wrap>,
    );
    expect(screen.getByRole("link", { name: "امسح الكل" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /امسح عامل التصفية/ })).toBeInTheDocument();
  });

  it("is accessible inside the scope, both sizes", async () => {
    const { container } = render(
      <Wrap scope>
        <EmptyState title="لا مواد بعد" action={{ label: "أضف مادة", onClick: () => {} }} size="sm" />
        <EmptyState title="لا جلسات بعد" description="اقترح أول جلسة لفريقك." action={{ label: "اقترح جلسة", href: "/app/propose" }} />
      </Wrap>,
    );
    await expectAccessible(container);
  });
});

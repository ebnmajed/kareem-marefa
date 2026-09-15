// `<EmptyState>` — `16` §4.2 Status, principle 5 "never a dead end",
// REQ-UIX-012. `action` is required in the type: every empty state names
// what to do next and links to it.
import type React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { EmptyState } from "@/components/ui/empty-state";
import ar from "@/messages/ar/browse.json";

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider locale="ar" messages={ar}>
      {children}
    </NextIntlClientProvider>
  );
}

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

describe("EmptyState", () => {
  it("renders the title and description", () => {
    render(
      <Wrap>
        <EmptyState title="لا جلسات تطابق بحثك" description="جرّب كلمات أخرى أو عدّل عامل التصفية." action={{ label: "اقترح موضوعًا", href: "/app/propose" }} />
      </Wrap>,
    );
    expect(screen.getByText("لا جلسات تطابق بحثك")).toBeInTheDocument();
    expect(screen.getByText("جرّب كلمات أخرى أو عدّل عامل التصفية.")).toBeInTheDocument();
  });

  it("renders the required action as a link when href is given", () => {
    render(
      <Wrap>
        <EmptyState title="لا جلسات" action={{ label: "اقترح موضوعًا", href: "/app/propose" }} />
      </Wrap>,
    );
    expect(screen.getByRole("link", { name: "اقترح موضوعًا" })).toHaveAttribute("href", expect.stringContaining("/app/propose"));
  });

  it("renders the required action as a button and calls onClick when there is no href", async () => {
    const onClick = vi.fn();
    render(<EmptyState title="لا جلسات" action={{ label: "أعد المحاولة", onClick }} />);
    await userEvent.click(screen.getByRole("button", { name: "أعد المحاولة" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("offers clearFilter BESIDE the primary action, never instead of it", () => {
    render(
      <Wrap>
        <EmptyState
          title="لا جلسات تطابق «فني»"
          action={{ label: "امسح كل عوامل التصفية", href: "/app/sessions" }}
          clearFilter={{ label: "امسح عامل التصفية: فني", href: "/app/sessions?level=advanced" }}
        />
      </Wrap>,
    );
    expect(screen.getByRole("link", { name: "امسح كل عوامل التصفية" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "امسح عامل التصفية: فني" })).toBeInTheDocument();
  });

  it("is accessible with every optional part present", async () => {
    const { container } = render(
      <Wrap>
        <EmptyState
          title="لا جلسات تطابق «فني»"
          description="جرّب كلمة أخرى."
          action={{ label: "امسح كل عوامل التصفية", href: "/app/sessions" }}
          clearFilter={{ label: "امسح عامل التصفية: فني", href: "/app/sessions?level=advanced" }}
        />
      </Wrap>,
    );
    await expectAccessible(container);
  });
});

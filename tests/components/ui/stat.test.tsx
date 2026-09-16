// `<Stat>` — `16` §4.2 Type. One number and what it means. `value` arrives
// pre-formatted by the caller ("numerals follow the ORG setting",
// REQ-INT-006) — this component never formats a number itself.
import type React from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Stat } from "@/components/ui/stat";
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

describe("Stat", () => {
  it("renders the label, the value wrapped in <bdi>, and the hint", () => {
    const { container } = render(<Stat label="الحضور" value="٤٢" hint="من أصل ٥٠" />);
    expect(screen.getByText("الحضور")).toBeInTheDocument();
    expect(screen.getByText("من أصل ٥٠")).toBeInTheDocument();
    const bdi = container.querySelector("bdi");
    expect(bdi).toHaveTextContent("٤٢");
  });

  it("renders as a plain block with no href", () => {
    const { container } = render(<Stat label="النقاط" value="١٢٠" />);
    expect(container.querySelector("a")).not.toBeInTheDocument();
  });

  it("renders as a link when href is given", () => {
    render(
      <Wrap>
        <Stat label="النقاط" value="١٢٠" href="/app/me/points" />
      </Wrap>,
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", expect.stringContaining("/app/me/points"));
  });

  it.each([
    ["success", "text-success"],
    ["live", "text-live"],
    ["ended", "text-ended"],
    ["error", "text-error"],
  ] as const)("tone=%s colours the value %s", (tone, cls) => {
    const { container } = render(<Stat label="حالة" value="٣" tone={tone} />);
    expect(container.querySelector("strong")).toHaveClass(cls);
  });

  it("is accessible", async () => {
    const { container } = render(<Stat label="الحضور" value="٤٢" hint="من أصل ٥٠" />);
    await expectAccessible(container);
  });
});

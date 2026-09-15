// `<TagChip>` — `16` §4.2 Status, §9.4 (ask 11, tags).
import type React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { TagChip } from "@/components/ui/tag-chip";
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

describe("TagChip", () => {
  it("renders the label as plain text with no href", () => {
    render(<TagChip label="تقارير" />);
    expect(screen.getByText("تقارير")).toBeInTheDocument();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });

  it("renders as a link to a filtered browse when href is given", () => {
    render(
      <Wrap>
        <TagChip label="تقارير" href="/app/sessions?tag=reports" />
      </Wrap>,
    );
    expect(screen.getByRole("link")).toHaveAttribute("href", expect.stringContaining("tag=reports"));
  });

  it("shows a facet count beside the label", () => {
    render(<TagChip label="تقارير" count={12} />);
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("★ never glues the count onto the label — 390 px review found «أمنة12» with no separator", () => {
    // Regression for a real gallery finding: jsdom cannot see the visual
    // gap, but it can prove the label and the count are never the SAME
    // text node (which is what "glued" actually was) and that the count is
    // parenthesised and separately bidi-isolated.
    const { container } = render(<TagChip label="أمنة" count={12} />);
    const labelNode = screen.getByText("أمنة");
    const countNode = screen.getByText("12");
    expect(labelNode).not.toBe(countNode);
    expect(labelNode.textContent).toBe("أمنة");
    expect(countNode.tagName).toBe("BDI");
    expect(countNode.parentElement?.textContent).toBe("(12)");
    // The flex row carrying both provides the gap `getByText` cannot see.
    expect(container.querySelector(".gap-1")).toBeInTheDocument();
  });

  it("shows no count when omitted", () => {
    render(<TagChip label="تقارير" />);
    expect(screen.queryByText(/^\d+$/)).not.toBeInTheDocument();
  });

  it("the remove control carries its own accessible name and calls onRemove once", async () => {
    const onRemove = vi.fn();
    render(<TagChip label="تقارير" onRemove={onRemove} removeLabel="أزل الوسم: تقارير" />);
    await userEvent.click(screen.getByRole("button", { name: "أزل الوسم: تقارير" }));
    expect(onRemove).toHaveBeenCalledTimes(1);
  });

  it("falls back to the tag's own label as the remove control's name", () => {
    render(<TagChip label="تقارير" onRemove={() => {}} />);
    expect(screen.getByRole("button", { name: "تقارير" })).toBeInTheDocument();
  });

  it("shows no remove control when onRemove is omitted", () => {
    render(<TagChip label="تقارير" />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("is accessible with a count and a remove control together", async () => {
    const { container } = render(<TagChip label="تقارير" count={3} onRemove={() => {}} removeLabel="أزل الوسم: تقارير" />);
    await expectAccessible(container);
  });
});

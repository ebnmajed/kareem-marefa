// The hub's strip — the lead's since wave 20 (REQ-UIX-070, STORY-UIX-059). It carries the three cases of the
// deleted `tests/components/me/tab-strip.test.tsx` (the kept-behaviour table, docs/plan/notes/wave-20-lead.md F1):
// one current link, the landmark's name, axe-clean — and the one the rebuild adds: it scrolls inside itself.
import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ar/app/me/points",
}));

const { HubStripNav } = await import("@/components/shell/hub-strip-nav");

const ITEMS = [
  { href: "/app/me", label: "ملفي" },
  { href: "/app/me/points", label: "نقاطي" },
  { href: "/app/me/certificates", label: "شهاداتي" },
];

function renderStrip() {
  return render(
    <NextIntlClientProvider locale="ar" messages={{}}>
      <HubStripNav label="صفحاتي" items={ITEMS} />
    </NextIntlClientProvider>,
  );
}

describe("HubStripNav", () => {
  it("marks only the route matching the current path as the current page", () => {
    renderStrip();
    expect(screen.getByRole("link", { name: "نقاطي" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "ملفي" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "شهاداتي" })).not.toHaveAttribute("aria-current");
  });

  it("names its own nav landmark", () => {
    renderStrip();
    expect(screen.getByRole("navigation", { name: "صفحاتي" })).toBeInTheDocument();
  });

  it("scrolls inside itself, in one row", () => {
    renderStrip();
    const nav = screen.getByRole("navigation", { name: "صفحاتي" });
    expect(nav.className).toContain("overflow-x-auto");
    expect(nav.querySelector("ul")?.className).toContain("w-max");
  });

  it("is axe-clean", async () => {
    const { container } = renderStrip();
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});

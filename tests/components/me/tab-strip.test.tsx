// The hub's tab strip — content's own, not `ui/tabs` (see tab-strip.tsx's
// header for why: seven items need to scroll in one row at 390 px, and
// `ui/tabs`' `RadixTabs.List` hard-codes `flex-wrap` with no override hook).
// Asserts the current route reads `aria-current="page"` and nothing else
// does, and that the strip is axe-clean.
import { NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";

vi.mock("next/navigation", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/navigation")>()),
  usePathname: () => "/ar/app/me/points",
}));

const { MeTabStrip } = await import("@/components/me/tab-strip");

const ITEMS = [
  { href: "/app/me", label: "ملفي" },
  { href: "/app/me/points", label: "نقاطي" },
  { href: "/app/me/certificates", label: "شهاداتي" },
];

function renderStrip() {
  return render(
    <NextIntlClientProvider locale="ar" messages={{}}>
      <MeTabStrip label="صفحاتي" items={ITEMS} />
    </NextIntlClientProvider>,
  );
}

describe("MeTabStrip", () => {
  it("marks only the route matching the current path as current", () => {
    renderStrip();
    expect(screen.getByRole("link", { name: "نقاطي" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "ملفي" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "شهاداتي" })).not.toHaveAttribute("aria-current");
  });

  it("names the strip's own nav landmark", () => {
    renderStrip();
    expect(screen.getByRole("navigation", { name: "صفحاتي" })).toBeInTheDocument();
  });

  it("is axe-clean", async () => {
    const { container } = renderStrip();
    const results = await axe.run(container);
    expect(results.violations).toEqual([]);
  });
});

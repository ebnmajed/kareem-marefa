// REQ-UIX-027 (DEC-180): inside the platform the wordmark leads to `/app`;
// everywhere else it leads to `/`, exactly as before. The prop is additive, so
// the public routes' header renders byte-identically (`qa:contract` and
// `visual` unmoved, not re-baselined).
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { Wordmark } = await import("@/components/wordmark");

const inAr = (ui: ReactNode) => render(<NextIntlClientProvider locale="ar" messages={{}}>{ui}</NextIntlClientProvider>);

describe("Wordmark", () => {
  it("leads to / by default — every caller that passes nothing is unchanged", () => {
    inAr(<Wordmark />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/");
  });

  it("the app shell's /app is honoured", () => {
    inAr(<Wordmark href="/app" />);
    expect(screen.getByRole("link")).toHaveAttribute("href", "/app");
  });

  it("the footer variant is still not a link", () => {
    inAr(<Wordmark variant="footer" />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

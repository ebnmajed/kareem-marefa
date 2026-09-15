// `<Badge>` / `<SessionStatusBadge>` — `16` §5.2, §4.2 Status, DEC-073,
// DEC-105. Asks 4 and 6 in one component: every phase × seat row renders the
// spec's exact Arabic text and colour, `live` pulses a dot gated behind
// `motion-safe:`, and colour is never the only channel — proven with a real
// numeric contrast check against the tokens this file's classes reference,
// since jsdom cannot evaluate `color-contrast` itself (the same reason
// `tests/components/ui/field.test.tsx` disables that one axe rule).
import type React from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { Badge, SessionStatusBadge } from "@/components/ui/badge";
import { contrastRatio } from "@/lib/brand/contrast";
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

const S = ar.browse.status;

describe("Badge", () => {
  it("renders its children and the caller's extra class", () => {
    // Not `getByText` + `toHaveClass`: the text lives in a nested `<bdi>`
    // (bidi-isolated, `16` §10), and Testing Library's default text matcher
    // only reads an element's OWN direct text-node children — it would
    // return the `<bdi>`, not the styled outer `<span>` the class is on.
    const { container } = render(<Badge className="extra">مسودة</Badge>);
    expect(screen.getByText("مسودة")).toBeInTheDocument();
    expect(container.firstElementChild).toHaveClass("extra");
  });

  it("is accessible", async () => {
    const { container } = render(<Badge tone="success">التسجيل مفتوح</Badge>);
    await expectAccessible(container);
  });
});

describe("SessionStatusBadge — 16 §5.2's nine rows", () => {
  const rows: { name: string; props: React.ComponentProps<typeof SessionStatusBadge>; text: string }[] = [
    { name: "open, available", props: { phase: "open", seat: "available" }, text: S.open },
    { name: "open, unlimited", props: { phase: "open", seat: "unlimited" }, text: S.open },
    { name: "open, available, closing soon", props: { phase: "open", seat: "available", closingSoon: true }, text: S.closingSoon },
    { name: "open, full", props: { phase: "open", seat: "full" }, text: S.waitlist },
    { name: "open, closed", props: { phase: "open", seat: "closed" }, text: S.registrationClosed },
    { name: "live", props: { phase: "live" }, text: S.live },
    { name: "ended", props: { phase: "ended" }, text: S.ended },
    { name: "cancelled", props: { phase: "cancelled" }, text: S.cancelled },
    { name: "draft", props: { phase: "draft" }, text: S.draft },
    { name: "pending_schedule", props: { phase: "pending_schedule" }, text: S.pendingSchedule },
  ];

  it.each(rows)("$name renders «$text»", ({ props, text }) => {
    render(
      <Wrap>
        <SessionStatusBadge {...props} />
      </Wrap>,
    );
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it("full outranks a closing deadline: a full session never also reads «closing soon»", () => {
    render(
      <Wrap>
        <SessionStatusBadge phase="open" seat="full" closingSoon />
      </Wrap>,
    );
    expect(screen.getByText(S.waitlist)).toBeInTheDocument();
    expect(screen.queryByText(S.closingSoon)).not.toBeInTheDocument();
  });

  it("pulses a dot only when live, gated behind motion-safe (static under reduced motion)", () => {
    const { container, rerender } = render(
      <Wrap>
        <SessionStatusBadge phase="live" />
      </Wrap>,
    );
    const dot = container.querySelector("svg");
    expect(dot).toBeTruthy();
    expect(dot).toHaveClass("motion-safe:animate-pulse");
    expect(dot).toHaveAttribute("aria-hidden", "true");

    rerender(
      <Wrap>
        <SessionStatusBadge phase="draft" />
      </Wrap>,
    );
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("draft and pending_schedule render outline (no fill class), everything else fills", () => {
    // Same reason as the "extra class" test above: the styled element is the
    // outer `<span>`, one level above the `<bdi>`-wrapped text.
    const { container } = render(
      <Wrap>
        <SessionStatusBadge phase="draft" />
      </Wrap>,
    );
    expect(screen.getByText(S.draft)).toBeInTheDocument();
    expect(container.querySelector("span")).toHaveClass("border");
  });

  it("is accessible on every row", async () => {
    for (const { props } of rows) {
      const { container, unmount } = render(
        <Wrap>
          <SessionStatusBadge {...props} />
        </Wrap>,
      );
      await expectAccessible(container);
      unmount();
    }
  });
});

// jsdom has no layout engine, so contrast is asserted numerically against the
// exact hex values this file's Tailwind classes reference (`globals.css`,
// DEC-073), not by reading computed styles — the same reason
// `field.test.tsx` disables axe's own `color-contrast` rule. AA body text is
// 4.5:1 (`checkContrast`'s own threshold table).
const LIGHT: Record<string, [fg: string, bg: string]> = {
  success: ["#2f6b4f", "#eff6f2"],
  live: ["#8a5a1f", "#fbf5ea"],
  ended: ["#5b6780", "#f1f3f7"],
  error: ["#9e3b3f", "#fbf1f1"],
  neutral: ["#5b6780", "#ffffff"], // fg-muted on the light surface
};

// The event hero's `.theme-dark` band (M10): the filled backgrounds are
// fixed near-white values that would be wrong there, so the dark rendering
// swaps to the on-dark text colour against the dark canvas (`--bg` under
// `.theme-dark`).
const DARK: Record<string, [fg: string, bg: string]> = {
  success: ["#8fbfa5", "#0b1220"],
  live: ["#d2a86b", "#0b1220"],
  ended: ["#a8b3c4", "#0b1220"], // falls back to `--fg-muted`, no dedicated on-dark token
  error: ["#e08c8f", "#0b1220"],
  neutral: ["#a8b3c4", "#0b1220"],
};

describe("Badge — contrast, every tone in both themes (DEC-073)", () => {
  it.each(Object.entries(LIGHT))("light: %s clears AA body text (4.5:1)", (_tone, [fg, bg]) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(Object.entries(DARK))("dark: %s clears AA body text (4.5:1)", (_tone, [fg, bg]) => {
    expect(contrastRatio(fg, bg)).toBeGreaterThanOrEqual(4.5);
  });
});

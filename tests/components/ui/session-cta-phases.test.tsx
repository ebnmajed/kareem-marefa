// `ui/session-cta` — wave 18's three additions, add-only (REQ-UIX-057, DEC-207 §2):
// the `rate` state, `size` and `width`, and `booked` with no `cancel`. The existing
// suites (`session-cta.test.tsx`, `session-cta-between.test.tsx`) pass untouched.
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import type { SessionCtaProps } from "@/components/ui";
import { SessionCta } from "@/components/ui/session-cta";

function draw(props: SessionCtaProps) {
  return render(
    <NextIntlClientProvider locale="ar" messages={{}}>
      <SessionCta {...props} />
    </NextIntlClientProvider>,
  );
}

const RATE = "/app/sessions/s1/rate";

describe("SessionCta — wave 18's phases", () => {
  it("★ rate: a link to SCR-015, the accent face, the window's end in the chip and in the name", () => {
    draw({ state: { kind: "rate", act: { href: RATE } }, label: "قيّم الجلسة", chip: "حتى 13 أكتوبر" });
    const link = screen.getByRole("link", { name: /قيّم الجلسة.*حتى 13 أكتوبر/ });
    expect(link.getAttribute("href")).toMatch(/\/app\/sessions\/s1\/rate$/);
    expect(link.querySelector('[data-part="chip"]')).toHaveClass("bg-on-accent", "text-accent");
  });

  it("rate is drawn exactly as reserve is — only the kind differs", () => {
    const rate = draw({ state: { kind: "rate", act: { href: RATE } }, label: "قيّم", chip: "x" }).container.innerHTML;
    const reserve = draw({ state: { kind: "reserve", act: { href: RATE } }, label: "قيّم", chip: "x" }).container.innerHTML;
    expect(rate).toBe(reserve);
  });

  it("★ size md and width auto: the desktop post's compact action, not a full-width one", () => {
    draw({ state: { kind: "reserve", act: { href: "/app/sessions/s1" } }, label: "احجز مقعدك", size: "md", width: "auto" });
    const link = screen.getByRole("link", { name: "احجز مقعدك" });
    expect(link).not.toHaveClass("w-full");
    expect(link.className).toMatch(/(?:^|\s)h-11(?:\s|$)/);
  });

  it("the defaults are today's: lg and full width", () => {
    draw({ state: { kind: "reserve", act: { href: "/app/sessions/s1" } }, label: "احجز مقعدك" });
    const link = screen.getByRole("link", { name: "احجز مقعدك" });
    expect(link).toHaveClass("w-full");
    expect(link.className).toMatch(/(?:^|\s)h-12(?:\s|$)/);
  });

  it("★ booked with no cancel: the fact alone — no control at all (the feed, DEC-206 §4.57)", () => {
    const { container } = draw({ state: { kind: "booked" }, label: "مقعدك محجوز", chip: "الخميس" });
    expect(screen.getByText("مقعدك محجوز")).toBeInTheDocument();
    expect(container.querySelectorAll("button, a[href], input, [tabindex]")).toHaveLength(0);
  });

  it("booked on the waitlist with no cancel says so, still with no control", () => {
    const { container } = draw({ state: { kind: "booked", hold: "waitlist" }, label: "في قائمة الانتظار", chip: "ترتيبك 3" });
    expect(screen.getByText("في قائمة الانتظار")).toBeInTheDocument();
    expect(container.querySelectorAll("button, a[href]")).toHaveLength(0);
  });

  it("is accessible in each new form", async () => {
    const { container } = render(
      <NextIntlClientProvider locale="ar" messages={{}}>
        <div className="theme-play">
          <SessionCta state={{ kind: "rate", act: { href: RATE } }} label="قيّم الجلسة" chip="حتى 13 أكتوبر" />
          <SessionCta state={{ kind: "checkIn", act: { href: "/app/sessions/s1/check-in" } }} label="سجّل حضورك" chip="مقعدك محجوز" size="md" width="auto" />
          <SessionCta state={{ kind: "booked" }} label="مقعدك محجوز" />
        </div>
      </NextIntlClientProvider>,
    );
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

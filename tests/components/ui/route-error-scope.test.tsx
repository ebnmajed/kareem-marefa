// `ui/route-error` inside the playground's scope — DEC-199 §3, §5.26, REQ-UIX-050, REQ-UIX-016.
//
// A failure never animates (DEC-183 §2). Its heading is a heading: the display
// face inside the scope, as `ui/page-header` sets it.
import { render, screen } from "@testing-library/react";
import axe from "axe-core";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { RouteError } from "@/components/ui/route-error";
import { PlayScope } from "@/components/ui/scope";

const tokens = (s: string | null | undefined) => (s ?? "").split(/\s+/).filter(Boolean);
const scoped = (c: string) => /^pg(?:-dark|-light)?:/.test(c);
/** What is left when every class the scope added is taken away — the string `main` rendered. */
const outside = (el: Element | null) => tokens(el?.getAttribute("class")).filter((c) => !scoped(c)).join(" ");
const inside = (el: Element | null) => tokens(el?.getAttribute("class")).filter(scoped);

function mount() {
  return render(
    <PlayScope>
      <RouteError title="تعذّر تحميل الصفحة" description="حاول مرة أخرى بعد قليل." retryLabel="أعد المحاولة" reset={() => {}} backLabel="عُد إلى الرئيسية" backHref="/ar/app" digest="a1b2c3" />
    </PlayScope>,
  );
}

describe("ui/route-error — inside the scope", () => {
  it("the heading keeps what it had and takes the display face at display-sm", () => {
    mount();
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.closest(".theme-play")).not.toBeNull();
    expect(outside(h1)).toBe("text-h2 text-fg-heading");
    expect(inside(h1)).toEqual(["pg:font-display", "pg:font-extrabold", "pg:text-play-sm"]);
  });

  it("the retry is the accent with ink on it, the way back an outline — both pills", () => {
    mount();
    expect(inside(screen.getByRole("button", { name: "أعد المحاولة" }))).toEqual(["pg:rounded-pill", "pg:bg-accent", "pg:text-on-accent", "pg:hover:bg-accent"]);
    expect(inside(screen.getByRole("link", { name: "عُد إلى الرئيسية" }))).toEqual(["pg:rounded-pill", "pg:hover:bg-hover"]);
  });

  it("the warning wears the error constant's on-dark form on the dark ground (DEC-073)", () => {
    const { container } = mount();
    expect(inside(container.querySelector("p.text-error"))).toEqual(["pg-dark:text-error-on-dark"]);
  });

  it("a failure never animates", () => {
    const { container } = mount();
    expect(container.innerHTML).not.toMatch(/animate-|transition|duration-/);
  });

  it("is an alert, isolates the digest, and is accessible", async () => {
    const { container } = mount();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText("a1b2c3").tagName).toBe("BDI");
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

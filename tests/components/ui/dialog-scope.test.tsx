// `ui/dialog` inside the playground's scope — DEC-199 §3, REQ-UIX-050, DEC-188.
//
// `scope-portal.test.tsx` holds WHERE a dialog lands. Wave 15 gave the frame its
// scope classes and no test that says what they are; this is that test.
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { Dialog, DialogContent } from "@/components/ui/dialog";
import { PlayScope } from "@/components/ui/scope";

const tokens = (s: string | null | undefined) => (s ?? "").split(/\s+/).filter(Boolean);
const scoped = (c: string) => /^pg(?:-dark|-light)?:/.test(c);
/** What is left when every class the scope added is taken away — the string `main` rendered. */
const outside = (el: Element | null) => tokens(el?.getAttribute("class")).filter((c) => !scoped(c)).join(" ");
const inside = (el: Element | null) => tokens(el?.getAttribute("class")).filter(scoped);

function mount(size?: "default" | "media") {
  render(
    <PlayScope>
      <Dialog defaultOpen>
        <DialogContent title="تأكيد الحجز" description="لا يمكن التراجع." closeLabel="إغلاق" size={size}>
          <p>المحتوى</p>
        </DialogContent>
      </Dialog>
    </PlayScope>,
  );
  return screen.getByRole("dialog", { name: "تأكيد الحجز" });
}

describe("ui/dialog — inside the scope", () => {
  it("opens inside the scope's element, through its landing place", () => {
    const dialog = mount();
    expect(dialog.closest(".theme-play")).not.toBeNull();
    expect(dialog.closest("[data-play-portal]")).not.toBeNull();
  });

  it("the frame keeps every class it had; the scope adds a panel with a boundary, the surface and no shadow", () => {
    const dialog = mount();
    expect(outside(dialog)).toContain("rounded-field bg-[var(--color-canvas)] p-6 text-[var(--fg-body)] shadow-xl");
    expect(inside(dialog)).toEqual(["pg:rounded-panel", "pg:border", "pg:border-edge-strong", "pg:bg-surface", "pg:shadow-none"]);
  });

  it("the scrim is the scope's, added after the old overlay", () => {
    mount();
    const overlay = document.querySelector("[data-play-portal] > div.fixed.inset-0")!;
    expect(inside(overlay)).toEqual(["pg:bg-scrim"]);
  });

  it("the close control is a pill and keeps its name", () => {
    mount();
    expect(inside(screen.getByRole("button", { name: "إغلاق" }))).toEqual(["pg:rounded-pill"]);
  });

  it("the media frame is the scope's ground on the dark scope, and crops nothing", () => {
    const dialog = mount("media");
    expect(inside(dialog)).toEqual(["pg-dark:bg-canvas"]);
    expect(dialog.getAttribute("class")).not.toMatch(/overflow-hidden|object-cover/);
  });
});

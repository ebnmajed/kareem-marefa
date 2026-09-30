// `ui/toast` inside the playground's scope — DEC-199 §1.3.6, §3, REQ-UIX-050, DEC-188 §6.
//
// Wave 15 gave the toast its scope classes and no test that says so. And
// DEC-188 §6 left its REGION outside the scope «until the shell enters it»: from
// wave 17 the shell's layout is the scope, so a toast is drawn inside it.
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import type { ToastOptions } from "@/components/ui";
import { PlayScope } from "@/components/ui/scope";
import { ToastProvider, useToast } from "@/components/ui/toast";

const tokens = (s: string | null | undefined) => (s ?? "").split(/\s+/).filter(Boolean);
const scoped = (c: string) => /^pg(?:-dark|-light)?:/.test(c);
/** What is left when every class the scope added is taken away — the string `main` rendered. */
const outside = (el: Element | null) => tokens(el?.getAttribute("class")).filter((c) => !scoped(c)).join(" ");
const inside = (el: Element | null) => tokens(el?.getAttribute("class")).filter(scoped);

function Trigger({ options }: { options: ToastOptions }) {
  const toast = useToast();
  return (
    <button type="button" onClick={() => toast.show(options)}>
      أظهر
    </button>
  );
}

// The provider stands INSIDE the scope, as it does in the shell's layout.
async function show(options: ToastOptions) {
  render(
    <PlayScope>
      <ToastProvider closeLabel="إغلاق الإشعار" label="إشعار">
        <Trigger options={options} />
      </ToastProvider>
    </PlayScope>,
  );
  await act(async () => screen.getByRole("button", { name: "أظهر" }).click());
  return (await screen.findByText(options.title as string)).closest("li")!;
}

const BEFORE = "pointer-events-auto flex w-full items-start gap-3 rounded-card border bg-canvas p-4 shadow-[var(--shadow-card)]";

describe("ui/toast — inside the scope", () => {
  it("a toast and its region are drawn inside the scope's element", async () => {
    const toast = await show({ title: "حُفظ التغيير" });
    expect(toast.closest(".theme-play")).not.toBeNull();
    expect(screen.getByRole("region").closest(".theme-play")).not.toBeNull();
  });

  it("the whisper: every class it had, then the raised tile with no shadow", async () => {
    const toast = await show({ title: "حُفظ التغيير" });
    expect(outside(toast)).toBe(`${BEFORE} border-edge-strong text-fg-heading`);
    expect(inside(toast)).toEqual(["pg:rounded-tile", "pg:bg-raised", "pg:shadow-none"]);
  });

  it.each([
    ["success", "border-success text-success", ["pg-dark:border-success-on-dark", "pg-dark:text-success-on-dark"]],
    ["error", "border-error-border text-error", ["pg-dark:border-error-on-dark", "pg-dark:text-error-on-dark"]],
  ] as const)("%s wears the status constant's on-dark form on the dark ground (DEC-073)", async (tone, before, added) => {
    const toast = await show({ title: "رسالة", tone });
    expect(outside(toast)).toBe(`${BEFORE} ${before}`);
    expect(inside(toast)).toEqual(["pg:rounded-tile", "pg:bg-raised", "pg:shadow-none", ...added]);
  });

  it("the close control is a pill with the scope's hover, and keeps its name", async () => {
    const toast = await show({ title: "حُفظ التغيير" });
    const close = toast.querySelector("button[aria-label='إغلاق الإشعار']")!;
    expect(inside(close)).toEqual(["pg:rounded-pill", "pg:hover:bg-hover"]);
  });

  it("a toast does not animate in: no keyframe, no scale", async () => {
    const toast = await show({ title: "حُفظ التغيير" });
    expect(toast.getAttribute("class")).not.toMatch(/animate-|scale-/);
  });
});

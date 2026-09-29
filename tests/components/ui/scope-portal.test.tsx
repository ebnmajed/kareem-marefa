// Where a scoped primitive's portal lands — DEC-188, REQ-UIX-028, REQ-UIX-030.
//
// A dialog renders through a portal into `<body>`, and `<body>` is outside the
// playground's scope. Opened from a scoped screen it would wear none of the
// scope. This holds the repair: inside a scope the portal lands inside the
// scope's element; outside one it lands where it always has.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

// `next/font` is compiled by Next, not by vitest: the scope reads one class name from it.
vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));

import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { PlayScope } from "@/components/ui/scope";
import { PlayPortalProvider, usePlayPortal } from "@/components/ui/scope-portal";

function Example() {
  return (
    <Dialog>
      <DialogTrigger>افتح</DialogTrigger>
      <DialogContent title="تأكيد الحجز" closeLabel="إغلاق">
        <p>المحتوى</p>
      </DialogContent>
    </Dialog>
  );
}

describe("the scope", () => {
  it("is one element carrying the scope's class and the display face's variable", () => {
    const { container } = render(<PlayScope>نص</PlayScope>);
    const scope = container.firstElementChild!;
    expect(scope).toHaveClass("theme-play", "font-baloo-variable");
    expect(scope).not.toHaveClass("theme-play-light");
  });

  it("the light variant carries both classes, so the light values come last and win", () => {
    const { container } = render(<PlayScope light>نص</PlayScope>);
    expect(container.firstElementChild).toHaveClass("theme-play", "theme-play-light");
  });

  it("holds a landing place for portals, inside itself, that takes no room", () => {
    const { container } = render(<PlayScope>نص</PlayScope>);
    const landing = container.querySelector("[data-play-portal]")!;
    expect(landing).not.toBeNull();
    expect(landing.closest(".theme-play")).toBe(container.firstElementChild);
    expect(landing).toHaveClass("contents");
  });
});

describe("a dialog's portal", () => {
  it("★ inside the scope it lands INSIDE the scope's element, so the dialog wears the scope", async () => {
    const { container } = render(
      <PlayScope>
        <Example />
      </PlayScope>,
    );
    await userEvent.click(screen.getByRole("button", { name: "افتح" }));
    const dialog = screen.getByRole("dialog", { name: "تأكيد الحجز" });
    expect(dialog.closest(".theme-play")).toBe(container.firstElementChild);
    expect(dialog.closest("[data-play-portal]")).not.toBeNull();
  });

  it("★ outside a scope it lands in <body>, exactly as before the wave", async () => {
    const { container } = render(<Example />);
    await userEvent.click(screen.getByRole("button", { name: "افتح" }));
    const dialog = screen.getByRole("dialog", { name: "تأكيد الحجز" });
    expect(dialog.closest(".theme-play")).toBeNull();
    expect(dialog.closest("[data-play-portal]")).toBeNull();
    expect(container.contains(dialog)).toBe(false);
    expect(document.body.contains(dialog)).toBe(true);
  });

  it("still closes from Escape and returns focus to its trigger, inside the scope", async () => {
    render(
      <PlayScope>
        <Example />
      </PlayScope>,
    );
    const trigger = screen.getByRole("button", { name: "افتح" });
    await userEvent.click(trigger);
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
});

describe("the hook", () => {
  function Probe() {
    const landing = usePlayPortal();
    return <output>{landing === undefined ? "body" : "scope"}</output>;
  }

  it("answers undefined outside a scope — Radix's own default", () => {
    render(<Probe />);
    expect(screen.getByRole("status")).toHaveTextContent("body");
  });

  it("answers the landing place inside one, once it exists", async () => {
    render(
      <PlayPortalProvider>
        <Probe />
      </PlayPortalProvider>,
    );
    expect(await screen.findByText("scope")).toBeInTheDocument();
  });
});

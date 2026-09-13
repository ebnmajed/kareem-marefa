// The house button — the primitive DEC-019 names as proving the house style.
// This is also the proof that the component stack works: React under jsdom,
// Testing Library queries by accessible role, user-event for interaction, and
// an Arabic RTL document by default (vitest.config.ts).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "@/components/ui/button";

describe("Button", () => {
  it("renders inside an Arabic RTL document by default", () => {
    render(<Button>سجّل اهتمامك</Button>);
    expect(document.documentElement).toHaveAttribute("dir", "rtl");
    expect(document.documentElement).toHaveAttribute("lang", "ar");
  });

  it("is a real button with its Arabic label as the accessible name", () => {
    render(<Button>سجّل اهتمامك</Button>);
    expect(screen.getByRole("button", { name: "سجّل اهتمامك" })).toBeInTheDocument();
  });

  it("calls onClick once per click", async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>أرسل</Button>);
    await userEvent.click(screen.getByRole("button", { name: "أرسل" }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("does not fire when disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        أرسل
      </Button>,
    );
    const button = screen.getByRole("button", { name: "أرسل" });
    expect(button).toBeDisabled();
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  it("keeps the secondary variant's border and the caller's extra classes", () => {
    render(
      <Button variant="secondary" className="w-full">
        تعرّف على المبادرة
      </Button>,
    );
    const button = screen.getByRole("button");
    expect(button).toHaveClass("border", "w-full");
  });
});

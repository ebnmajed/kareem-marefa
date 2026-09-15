// `ui/switch` — `16` §4.2, REQ-UIX-009, `10` §2.3.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { Switch } from "@/components/ui/switch";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

describe("Switch", () => {
  it("is a switch by role, named by its label", () => {
    render(<Switch name="allowDownload" label="السماح بالتنزيل" />);
    const control = screen.getByRole("switch", { name: "السماح بالتنزيل" });
    expect(control).not.toBeChecked();
  });

  it("toggles by click and by keyboard, and reports the new state", async () => {
    const onCheckedChange = vi.fn();
    render(<Switch name="allowDownload" label="السماح بالتنزيل" onCheckedChange={onCheckedChange} />);
    const control = screen.getByRole("switch");
    await userEvent.click(control);
    expect(control).toBeChecked();
    expect(onCheckedChange).toHaveBeenLastCalledWith(true);
    control.focus();
    await userEvent.keyboard(" ");
    expect(control).not.toBeChecked();
    expect(onCheckedChange).toHaveBeenLastCalledWith(false);
  });

  it("works as a controlled switch — nothing moves until the owner says so", async () => {
    const onCheckedChange = vi.fn();
    const { rerender } = render(<Switch name="allowDownload" label="السماح بالتنزيل" checked={false} onCheckedChange={onCheckedChange} />);
    await userEvent.click(screen.getByRole("switch"));
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(screen.getByRole("switch")).not.toBeChecked();
    rerender(<Switch name="allowDownload" label="السماح بالتنزيل" checked onCheckedChange={onCheckedChange} />);
    expect(screen.getByRole("switch")).toBeChecked();
  });

  it("carries its description into the accessible description", () => {
    render(<Switch name="allowDownload" label="السماح بالتنزيل" description="يظهر زر تنزيل للمواد بعد الجلسة" />);
    expect(screen.getByRole("switch")).toHaveAccessibleDescription("يظهر زر تنزيل للمواد بعد الجلسة");
  });

  it("★★ the thumb moves along the INLINE axis, never by a physical translate", () => {
    const { container } = render(<Switch name="allowDownload" label="السماح بالتنزيل" />);
    const track = container.querySelector("[aria-hidden]")!;
    // `translate-x-5` moves the thumb RIGHT in both directions, so an Arabic
    // member would watch the switch turn on by sliding backwards. `10` §2.3:
    // pairing `rtl:` with a physical utility would not have rescued it, because
    // the variant adds no specificity and the physical utility wins.
    expect(track.className).not.toMatch(/translate-x/);
    expect(track.className).toContain("justify-start");
    expect(track.className).toContain("peer-checked:justify-end");
  });

  it("keeps the real control focusable — the track is decoration that follows it", async () => {
    const { container } = render(<Switch name="allowDownload" label="السماح بالتنزيل" />);
    const control = screen.getByRole("switch");
    // `sr-only`, not `hidden`: it is still in the tab order and still posts.
    expect(control.className).toContain("sr-only");
    expect(container.querySelector("[aria-hidden]")).toBeInTheDocument();
    await userEvent.tab();
    expect(document.activeElement).toBe(control);
  });

  it("posts a value under its name only when it is on", async () => {
    render(
      <form>
        <Switch name="allowDownload" label="السماح بالتنزيل" />
      </form>,
    );
    const form = document.querySelector("form")!;
    expect(new FormData(form).get("allowDownload")).toBeNull();
    await userEvent.click(screen.getByRole("switch"));
    expect(new FormData(form).get("allowDownload")).toBe("on");
  });

  it("does not toggle when disabled", async () => {
    render(<Switch name="allowDownload" label="السماح بالتنزيل" disabled />);
    const control = screen.getByRole("switch");
    await userEvent.click(control);
    expect(control).not.toBeChecked();
  });

  it("is 44 px tall, which is the touch floor", () => {
    render(<Switch name="allowDownload" label="السماح بالتنزيل" />);
    expect(screen.getByRole("switch").closest("label")?.className).toContain("min-h-11");
  });

  it("is accessible, described and plain", async () => {
    const { container } = render(
      <>
        <Switch name="a" label="السماح بالتنزيل" />
        <Switch name="b" label="إظهار الحضور" description="يظهر اسمك في قائمة الحاضرين" defaultChecked />
      </>,
    );
    await expectAccessible(container);
  });
});

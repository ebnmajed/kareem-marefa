// `ui/checkbox` — `16` §4.2, REQ-UIX-009, REQ-NFR-007.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import { Checkbox } from "@/components/ui/checkbox";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

describe("Checkbox", () => {
  it("is named by its own label — there is no second one to get wrong", () => {
    render(<Checkbox name="coPresenters" value="m1" label="زميلة الاختبار" />);
    expect(screen.getByRole("checkbox", { name: "زميلة الاختبار" })).toBeInTheDocument();
  });

  it("★ the whole row is the target, not the 20 px square", async () => {
    render(<Checkbox name="coPresenters" value="m1" label="زميلة الاختبار" />);
    const box = screen.getByRole("checkbox");
    // The label is the wrapper, so a click on the NAME toggles the box. That is
    // what makes it hittable on a phone, and `min-h-11` is the 44 px floor.
    await userEvent.click(screen.getByText("زميلة الاختبار"));
    expect(box).toBeChecked();
    expect(box.closest("label")?.className).toContain("min-h-11");
  });

  it("takes rich label content, so a name and a job title read as one row", () => {
    render(
      <Checkbox
        name="coPresenters"
        value="m1"
        label={
          <span>
            <bdi>زميلة الاختبار</bdi> · <bdi>مهندسة</bdi>
          </span>
        }
      />,
    );
    // ★ `<bdi>` around each interpolated value — a Latin job title beside an
    // Arabic name reorders the whole row without it.
    expect(screen.getByRole("checkbox", { name: "زميلة الاختبار · مهندسة" })).toBeInTheDocument();
    expect(document.querySelectorAll("bdi")).toHaveLength(2);
  });

  it("starts checked when told to, and reports its changes", async () => {
    const onChange = vi.fn();
    render(<Checkbox name="coPresenters" value="m1" label="زميلة" defaultChecked onChange={onChange} />);
    const box = screen.getByRole("checkbox");
    expect(box).toBeChecked();
    await userEvent.click(box);
    expect(box).not.toBeChecked();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("does not toggle when disabled, and says so visually", async () => {
    render(<Checkbox name="coPresenters" value="m1" label="زميلة" disabled />);
    const box = screen.getByRole("checkbox");
    await userEvent.click(box);
    expect(box).not.toBeChecked();
    expect(box.closest("label")?.className).toContain("cursor-not-allowed");
  });

  it("posts its value under its name", async () => {
    render(
      <form>
        <Checkbox name="coPresenters" value="m1" label="زميلة" defaultChecked />
        <Checkbox name="coPresenters" value="m2" label="زميل" />
      </form>,
    );
    const form = document.querySelector("form")!;
    expect(new FormData(form).getAll("coPresenters")).toEqual(["m1"]);
    await userEvent.click(screen.getByRole("checkbox", { name: "زميل" }));
    expect(new FormData(form).getAll("coPresenters")).toEqual(["m1", "m2"]);
  });

  it("is accessible, alone and in a named group", async () => {
    const { container } = render(
      <fieldset>
        <legend>مقدّمون مشاركون</legend>
        <Checkbox name="coPresenters" value="m1" label="زميلة الاختبار" />
        <Checkbox name="coPresenters" value="m2" label="زميل الاختبار" />
      </fieldset>,
    );
    await expectAccessible(container);
  });
});

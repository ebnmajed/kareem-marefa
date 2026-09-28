// `ui/code-input` — REQ-UIX-035, REQ-CHK-002, REQ-CHK-003, DEC-186 §4, §6.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { CodeInput } from "@/components/ui/code-input";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

const POSITIONS = [1, 2, 3, 4, 5, 6].map((n) => `الخانة ${n} من 6`);
// The migration's alphabet (`0010_m2_schema.sql:210`) — never the prototype's «M7K2QX», which holds a 2.
const CODE = "M7K3QX";

function Code(props: Partial<Parameters<typeof CodeInput>[0]>) {
  return <CodeInput name="code" id="code" label="رمز الحضور" positionLabels={POSITIONS} {...props} />;
}

function boxes() {
  return within(screen.getByRole("group", { name: "رمز الحضور" })).getAllByRole("textbox");
}

function posted(container: HTMLElement) {
  return (container.querySelector('input[type="hidden"][name="code"]') as HTMLInputElement).value;
}

function paste(target: HTMLElement, text: string) {
  fireEvent.paste(target, { clipboardData: { getData: () => text } });
}

describe("CodeInput — one named group, six positioned boxes", () => {
  it("★ names the group once, and each box by its position", () => {
    render(<Code />);
    const group = screen.getByRole("group", { name: "رمز الحضور" });
    expect(group).toHaveAttribute("dir", "ltr");
    expect(boxes()).toHaveLength(6);
    POSITIONS.forEach((name, i) => expect(boxes()[i]).toHaveAccessibleName(name));
  });

  it("lands a tap on the label in the first box, and gives the first box the id a link can target", async () => {
    const user = userEvent.setup();
    render(<Code />);
    await user.click(screen.getByText("رمز الحضور"));
    expect(boxes()[0]).toHaveFocus();
    expect(boxes()[0]).toHaveAttribute("id", "code");
    expect(boxes()[1]).toHaveAttribute("id", "code-2");
  });

  it("turns autocorrect, autocapitalise and spellcheck off, with a text keyboard — the alphabet has letters", () => {
    render(<Code />);
    for (const box of boxes()) {
      expect(box).toHaveAttribute("inputmode", "text");
      expect(box).toHaveAttribute("autocorrect", "off");
      expect(box).toHaveAttribute("autocapitalize", "off");
      expect(box).toHaveAttribute("autocomplete", "off");
      expect(box).toHaveAttribute("spellcheck", "false");
    }
  });
});

describe("CodeInput — typing, pasting, moving", () => {
  it("advances as each character lands, upper-cases it, and posts one field", async () => {
    const user = userEvent.setup();
    const { container } = render(<Code />);
    await user.click(boxes()[0]);
    await user.keyboard("m7k3qx");
    expect(boxes().map((b) => (b as HTMLInputElement).value).join("")).toBe(CODE);
    expect(posted(container)).toBe(CODE);
  });

  it("★ does not filter as the member types: a character outside the alphabet still appears", async () => {
    const user = userEvent.setup();
    const { container } = render(<Code />);
    await user.click(boxes()[0]);
    await user.keyboard("o0"); // neither is in the alphabet; the server says so, not a silent box
    expect(posted(container)).toBe("O0");
  });

  it("★ a pasted whole code fills every box from the first, wherever it lands, and drops its separators", () => {
    const { container } = render(<Code />);
    paste(boxes()[3], "m7k-3qx ");
    expect(posted(container)).toBe(CODE);
    expect(boxes()[5]).toHaveFocus();
  });

  it("a pasted fragment fills from the box it lands in", () => {
    const { container } = render(<Code defaultValue="M7" />);
    paste(boxes()[2], "k3");
    expect(posted(container)).toBe("M7K3");
    expect(boxes()[4]).toHaveFocus();
  });

  it("a multi-character change — a suggestion, an autofill — is treated as a paste", () => {
    const { container } = render(<Code />);
    fireEvent.change(boxes()[0], { target: { value: "m7k3qx" } });
    expect(posted(container)).toBe(CODE);
  });

  it("goes back on Backspace from an empty box, and the arrows move the way they point in the LTR group", async () => {
    const user = userEvent.setup();
    render(<Code defaultValue="M7" />);
    await user.click(boxes()[2]);
    await user.keyboard("{Backspace}");
    expect(boxes()[1]).toHaveFocus();
    await user.keyboard("{ArrowRight}");
    expect(boxes()[2]).toHaveFocus();
    await user.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(boxes()[0]).toHaveFocus();
    await user.keyboard("{End}");
    expect(boxes()[5]).toHaveFocus();
    await user.keyboard("{Home}");
    expect(boxes()[0]).toHaveFocus();
  });

  it("typing into a filled box replaces its character", async () => {
    const user = userEvent.setup();
    const { container } = render(<Code defaultValue={CODE} />);
    await user.click(boxes()[2]);
    await user.keyboard("A");
    expect(posted(container)).toBe("M7A3QX");
  });

  it("shows the code a refused submission carried back", () => {
    const { container } = render(<Code defaultValue="m7k3" />);
    expect(posted(container)).toBe("M7K3");
    expect((boxes()[3] as HTMLInputElement).value).toBe("3");
  });

  it("★★ what is on show survives React's form reset (DEC-149 §1)", async () => {
    const user = userEvent.setup();
    const { container, rerender } = render(
      <form>
        <Code />
      </form>,
    );
    await user.click(boxes()[0]);
    await user.keyboard(CODE);
    act(() => (container.querySelector("form") as HTMLFormElement).reset());
    // Straight after the reset, before any commit: React keeps each box's value attribute in step.
    expect(boxes().map((b) => (b as HTMLInputElement).value).join("")).toBe(CODE);
    rerender(
      <form>
        <Code />
      </form>,
    );
    expect(boxes().map((b) => (b as HTMLInputElement).value).join("")).toBe(CODE);
    expect(boxes().map((b) => (b as HTMLInputElement).defaultValue).join("")).toBe(CODE);
  });
});

describe("CodeInput — invalid, disabled, complete", () => {
  it("★ ties the error to the GROUP, merged with the caller's own description", () => {
    render(
      <>
        <p id="banner">تعذّر تسجيل الحضور</p>
        <Code error="الرمز غير صحيح — تأكد من الرمز المعروض الآن" aria-describedby="banner" />
      </>,
    );
    const group = screen.getByRole("group", { name: "رمز الحضور" });
    expect(group).toHaveAttribute("aria-describedby", "code-error banner");
    expect(group).toHaveAccessibleDescription("الرمز غير صحيح — تأكد من الرمز المعروض الآن تعذّر تسجيل الحضور");
    for (const box of boxes()) expect(box).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("الرمز غير صحيح — تأكد من الرمز المعروض الآن").closest("p")).not.toHaveAttribute("role");
  });

  it("is invalid with the message elsewhere when the caller says so", () => {
    render(<Code invalid aria-describedby="banner" />);
    expect(screen.getByRole("group")).toHaveAttribute("aria-describedby", "banner");
    for (const box of boxes()) expect(box).toHaveAttribute("aria-invalid", "true");
  });

  it("★ a wrong code does not animate — no animation, transition or keyframe anywhere in the file", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/ui/code-input.tsx"), "utf8").replace(/\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");
    expect(source).not.toMatch(/\banimate-|\btransition\b|\btransition-|\.animate\(|@keyframes|\bduration-/);
  });

  it("disables every box and posts nothing when disabled", () => {
    const { container } = render(<Code disabled defaultValue={CODE} />);
    for (const box of boxes()) expect(box).toBeDisabled();
    expect(container.querySelector('input[type="hidden"]')).toBeDisabled();
  });

  it("marks the group complete once every box holds a character, and draws it only inside the scope", async () => {
    const user = userEvent.setup();
    render(<Code defaultValue="M7K3Q" />);
    const group = screen.getByRole("group");
    expect(group).not.toHaveAttribute("data-complete");
    await user.click(boxes()[5]);
    await user.keyboard("X");
    expect(group).toHaveAttribute("data-complete", "true");
    for (const box of boxes()) {
      expect(box.className).toContain("border-edge-strong");
      expect(box.className).toContain("pg:border-accent");
    }
  });
});

describe("CodeInput — tokens only, and the scope", () => {
  it("holds no hex, no literal duration and no raw palette name", () => {
    const source = readFileSync(resolve(process.cwd(), "src/components/ui/code-input.tsx"), "utf8");
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(source).not.toMatch(/\bduration-\d|\d+ms\b/);
    expect(source).not.toMatch(/\b(?:navy|silver|slate)-\d|\bplay-(?:ink|surface|line|bone|muted|lime|coral|paper|edge)\b/);
  });

  it("takes the input's corner, the raised face, 48 × 60 and the display face inside the scope — and 44 px or more everywhere", () => {
    render(<Code />);
    for (const box of boxes()) {
      for (const cls of ["h-14", "min-w-11", "pg:h-15", "pg:w-12", "pg:rounded-input", "pg:bg-raised", "pg:font-display"]) {
        expect(box.className, cls).toContain(cls);
      }
    }
  });

  it("renders inside the scope, right to left around a left-to-right group, and is accessible in every state", async () => {
    const { container } = render(
      <div className="theme-play" dir="rtl">
        <Code id="a" />
        <Code id="b" defaultValue={CODE} />
        <Code id="c" defaultValue="M7K" error="الرمز غير صحيح — تأكد من الرمز المعروض الآن" />
        <Code id="d" disabled />
      </div>,
    );
    for (const group of screen.getAllByRole("group")) expect(group).toHaveAttribute("dir", "ltr");
    await expectAccessible(container);
  });
});

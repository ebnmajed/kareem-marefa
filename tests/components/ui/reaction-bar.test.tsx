// `<ReactionBar>` — REQ-UIX-034, REQ-EVT-004, DEC-183, DEC-186 §4 – §5. The set arrives as props;
// the acknowledgement is the pressed state; nothing moves; nothing reads as an achievement.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import axe from "axe-core";
import type { ReactionBarItem } from "@/components/ui";
import { ReactionBar } from "@/components/ui/reaction-bar";
import { BoltIcon, FlameIcon, HeartIcon, StarIcon } from "@/components/ui/icons";

async function expectAccessible(container: HTMLElement) {
  const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
  expect(violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`)).toEqual([]);
}

function items(pressed: Partial<Record<string, boolean>> = {}, counts: Partial<Record<string, number>> = {}): ReactionBarItem[] {
  return [
    { kind: "like", label: "إعجاب", count: counts.like ?? 12, pressed: !!pressed.like, icon: <HeartIcon filled={!!pressed.like} /> },
    { kind: "fire", label: "نار", count: counts.fire ?? 3, pressed: !!pressed.fire, icon: <FlameIcon filled={!!pressed.fire} /> },
    { kind: "star", label: "نجمة", count: counts.star ?? 0, pressed: !!pressed.star, icon: <StarIcon filled={!!pressed.star} /> },
    { kind: "bolt", label: "برق", count: counts.bolt ?? 1250, pressed: !!pressed.bolt, icon: <BoltIcon filled={!!pressed.bolt} /> },
  ];
}

describe("ReactionBar — a group of named toggles", () => {
  it("is a group named by its label, one button per reaction in the caller's order", () => {
    render(<ReactionBar label="التفاعلات" items={items()} onToggle={() => {}} />);
    const group = screen.getByRole("group", { name: "التفاعلات" });
    const buttons = within(group).getAllByRole("button");
    expect(buttons.map((b) => b.getAttribute("data-kind"))).toEqual(["like", "fire", "star", "bolt"]);
  });

  it("names each button by its word and its count, the count in Western digits inside <bdi>", () => {
    render(<ReactionBar label="التفاعلات" items={items()} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: "إعجاب 12" })).toBeInTheDocument();
    const bolt = screen.getByRole("button", { name: "برق 1,250" });
    expect(bolt.querySelector("bdi")).toHaveTextContent("1,250");
    expect(bolt.textContent).not.toMatch(/[٠-٩]/);
  });

  it("a zero count shows no number, and the button is still named", () => {
    render(<ReactionBar label="التفاعلات" items={items()} onToggle={() => {}} />);
    const star = screen.getByRole("button", { name: "نجمة" });
    expect(star.querySelector('[data-slot="count"]')).not.toBeInTheDocument();
  });

  it("carries the pressed state as aria-pressed", () => {
    render(<ReactionBar label="التفاعلات" items={items({ like: true })} onToggle={() => {}} />);
    expect(screen.getByRole("button", { name: /إعجاب/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: /نار/ })).toHaveAttribute("aria-pressed", "false");
  });

  it("★ pressed is never colour alone: the filled glyph and a stronger border", () => {
    render(<ReactionBar label="التفاعلات" items={items({ like: true })} onToggle={() => {}} />);
    const like = screen.getByRole("button", { name: /إعجاب/ });
    const fire = screen.getByRole("button", { name: /نار/ });
    expect(like.querySelector("path")).toHaveAttribute("fill", "currentColor");
    expect(fire.querySelector("path")).toHaveAttribute("fill", "none");
    expect(like).toHaveClass("border-fg-heading");
    expect(fire).toHaveClass("border-edge");
  });

  it("hands the kind to onToggle, and decides nothing itself", async () => {
    const onToggle = vi.fn();
    const { rerender } = render(<ReactionBar label="التفاعلات" items={items()} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole("button", { name: /نار/ }));
    expect(onToggle).toHaveBeenCalledWith("fire");
    // It stays unpressed until the caller says otherwise.
    expect(screen.getByRole("button", { name: /نار/ })).toHaveAttribute("aria-pressed", "false");
    rerender(<ReactionBar label="التفاعلات" items={items({ fire: true }, { fire: 4 })} onToggle={onToggle} />);
    expect(screen.getByRole("button", { name: "نار 4" })).toHaveAttribute("aria-pressed", "true");
  });

  it("every pill is at least 44 px", () => {
    render(<ReactionBar label="التفاعلات" items={items()} onToggle={() => {}} />);
    for (const b of screen.getAllByRole("button")) expect(b).toHaveClass("min-h-11", "min-w-11");
  });
});

describe("ReactionBar — nothing moves, nothing celebrates (DEC-186 §4)", () => {
  it("no pop, no pulse, no transition — on any state", () => {
    const { container } = render(<ReactionBar label="التفاعلات" items={items({ like: true, bolt: true })} onToggle={() => {}} />);
    expect(container.innerHTML).not.toMatch(/animate-|transition|duration|scale-|reaction-ignite|reaction-ring/);
  });

  it("pending keeps every label and marks the group busy", () => {
    render(<ReactionBar label="التفاعلات" items={items({ like: true })} onToggle={() => {}} pending />);
    expect(screen.getByRole("group")).toHaveAttribute("aria-busy", "true");
    expect(screen.getByRole("button", { name: "إعجاب 12" })).toBeInTheDocument();
  });
});

describe("ReactionBar — read-only", () => {
  it("offers nothing to press and shows only the reactions that have a count", () => {
    const { container } = render(<ReactionBar label="التفاعلات" items={items()} readOnly />);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect([...container.querySelectorAll("[data-kind]")].map((e) => e.getAttribute("data-kind"))).toEqual(["like", "fire", "bolt"]);
    expect(container.querySelector('[data-kind="star"]')).not.toBeInTheDocument();
    expect(container.querySelector('[data-kind="like"]')).toHaveTextContent("إعجاب 12");
  });
});

describe("ReactionBar — accessible", () => {
  it("is accessible, interactive and read-only, inside the scope", async () => {
    const { container } = render(
      <div className="theme-play">
        <ReactionBar label="التفاعلات" items={items({ like: true })} onToggle={() => {}} />
        <ReactionBar label="تفاعلات مجمّدة" items={items()} readOnly />
      </div>,
    );
    await expectAccessible(container);
  });
});

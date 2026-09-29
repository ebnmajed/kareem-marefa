// wave 16, R1 (DEC-197): the ticket can be drawn without its «محجوز», so the stamp over it says the word — and a
// waitlisted ticket never says the wrong one.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TicketObject } from "@/components/ui/objects/ticket";

const ink = (c: HTMLElement) => c.querySelectorAll('path[fill="#0B0C12"]');

describe("TicketObject — the word", () => {
  it("carries «محجوز» by default, as the master does", () => {
    const { container } = render(<TicketObject />);
    expect(ink(container)).toHaveLength(1);
  });

  it("word={false} draws the ticket without it, and nothing else changes", () => {
    const withWord = render(<TicketObject />).container;
    const without = render(<TicketObject word={false} />).container;
    expect(ink(without)).toHaveLength(0);
    expect(without.querySelectorAll("rect")).toHaveLength(withWord.querySelectorAll("rect").length);
    expect(without.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
  });
});

// `<AttendeeStack>` — REQ-UIX-057, DEC-206 §4.56, §4.78, A33 rule 3. It draws who it is given, rings each face,
// always says the count in words, and is a named group. RTL document.
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AttendeeStack } from "@/components/ui/attendee-stack";

const PEOPLE = ["أ", "ب", "ج", "د", "هـ", "و"].map((n, i) => ({ memberId: `m${i}`, displayName: `عضو ${n}`, teamColor: i === 5 ? null : "#35D0FF" }));

describe("AttendeeStack", () => {
  it("is a group named by its label, and the count is always text", () => {
    render(<AttendeeStack label="من يحضر" people={PEOPLE.slice(0, 2)} countLabel="12 محجوزًا" />);
    const group = screen.getByRole("group", { name: "من يحضر" });
    expect(group).toHaveTextContent("12 محجوزًا");
  });

  it("with nobody given — a plain member's view — the count stands alone and no face is drawn", () => {
    const { container } = render(<AttendeeStack label="من يحضر" people={[]} countLabel="23 من 40 حاضرًا الآن" />);
    expect(container.querySelector('[data-slot="faces"]')).toBeNull();
    expect(container.querySelector('[data-slot="count"]')).toHaveTextContent("23 من 40 حاضرًا الآن");
  });

  it("draws at most `max` faces (default 4), and names exactly those it draws", () => {
    const { container, rerender } = render(<AttendeeStack label="من يحضر" people={PEOPLE} countLabel="40 محجوزًا" />);
    expect(container.querySelectorAll('[data-slot="faces"] [aria-hidden="true"]').length).toBeGreaterThanOrEqual(4);
    expect(within(container.querySelector("ul")!).getAllByRole("listitem")).toHaveLength(4);
    rerender(<AttendeeStack label="من يحضر" people={PEOPLE} max={2} countLabel="40 محجوزًا" />);
    expect(within(container.querySelector("ul")!).getAllByRole("listitem")).toHaveLength(2);
  });

  it("rings every face: a colour is the team ring, a company with none the neutral ring — never no ring", () => {
    const { container } = render(<AttendeeStack label="من يحضر" people={[PEOPLE[0]!, PEOPLE[5]!]} countLabel="2" />);
    const faces = container.querySelectorAll('[data-slot="faces"] > span > span');
    expect(faces[0]).toHaveClass("border-team");
    expect((faces[0] as HTMLElement).style.getPropertyValue("--team")).toBe("#35D0FF");
    expect(faces[1]).toHaveClass("border-team-neutral");
  });

  it("overlaps by a logical margin, never a physical one", () => {
    const { container } = render(<AttendeeStack label="من يحضر" people={PEOPLE.slice(0, 3)} countLabel="3" />);
    const faces = container.querySelector('[data-slot="faces"]')!;
    expect(faces.className).toContain("-ms-2");
    expect(faces.className).not.toMatch(/-ml-|-mr-|space-x/);
  });
});

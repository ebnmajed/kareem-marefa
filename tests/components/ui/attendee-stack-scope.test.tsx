// `<AttendeeStack>` inside the playground's scope — REQ-UIX-057. Born inside it: semantic names only.
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { AttendeeStack } from "@/components/ui/attendee-stack";

const PEOPLE = [
  { memberId: "a", displayName: "سارة القحطاني", teamColor: "#35D0FF" },
  { memberId: "b", displayName: "نورة العتيبي", teamColor: null },
];

describe("AttendeeStack inside the scope", () => {
  it("the faces are circles, separated by the ground's own colour", () => {
    const { container } = render(
      <div className="theme-play">
        <AttendeeStack label="من يحضر" people={PEOPLE} countLabel="12 محجوزًا" />
      </div>,
    );
    for (const wrap of container.querySelectorAll('[data-slot="faces"] > span')) expect(wrap).toHaveClass("rounded-pill", "ring-canvas");
    expect(container.querySelector('[data-slot="faces"] [aria-hidden="true"]')).toHaveClass("pg:rounded-pill");
  });

  it("is accessible inside the scope, with faces and without", async () => {
    const { container } = render(
      <div className="theme-play">
        <AttendeeStack label="من يحضر" people={PEOPLE} countLabel="12 محجوزًا" />
        <AttendeeStack label="الحضور" people={[]} countLabel="23 من 40 حاضرًا الآن" />
      </div>,
    );
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });
});

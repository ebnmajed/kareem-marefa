// SCR-012's sub-nav, rebuilt in wave 18 (REQ-UIX-017, REQ-UIX-061) — only the sections that render, a count
// where the slot has one, a scroll-spy that marks a location, never a tab.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { EventSubnav } from "@/components/sessions/event-subnav";

describe("EventSubnav", () => {
  it("lists the sections as same-page links, the count part of the name, the first one current", async () => {
    const { container } = render(
      <EventSubnav
        label="أقسام الجلسة"
        items={[
          { id: "photos", label: "الصور", count: "2" },
          { id: "discussion", label: "النقاش", count: "5" },
          { id: "about", label: "نبذة", lgHidden: true },
        ]}
      />,
    );
    const nav = screen.getByRole("navigation", { name: "أقسام الجلسة" });
    expect(nav).toHaveAttribute("data-event-subnav", "");
    const links = screen.getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#photos", "#discussion", "#about"]);
    expect(screen.getByRole("link", { name: "النقاش 5" })).toBeInTheDocument();
    expect(links[0]).toHaveAttribute("aria-current", "true");
    expect(screen.queryByRole("tab")).toBeNull();
    // «نبذة» is not drawn from `lg`, where the abstract is in the hero.
    expect(links[2].closest("li")).toHaveClass("lg:hidden");
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  it("scrolls, never clips", () => {
    render(<EventSubnav label="أقسام الجلسة" items={[{ id: "about", label: "نبذة" }, { id: "materials", label: "المواد" }]} />);
    expect(screen.getByRole("list")).toHaveClass("overflow-x-auto");
  });

  it("draws nothing under two items — one chip is not a navigation", () => {
    const { container } = render(<EventSubnav label="أقسام الجلسة" items={[{ id: "about", label: "نبذة" }]} />);
    expect(container).toBeEmptyDOMElement();
  });
});

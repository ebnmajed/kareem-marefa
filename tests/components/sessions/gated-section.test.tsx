// The event page's section gate — `16` §5.4.1a(b), REQ-UIX-015, DEC-130.
//
// REQ-UIX-015's acceptance is "an empty slot renders no heading, proven by one
// component test per slot". This is the page's half: whatever a slot's summary
// says, the section, its heading and its landmark follow it. Each slot's owner
// proves the other half — `visible === false` exactly when the slot renders
// nothing.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import axe from "axe-core";
import { GatedSection } from "@/components/sessions/gated-section";
import { EVENT_SECTION_IDS, SLOT_NAMES, isSectionShown, type SlotSummary } from "@/components/sessions/slots";

const shown: SlotSummary = { visible: true, count: 3, outstanding: null };
const empty: SlotSummary = { visible: false, count: 0, outstanding: null };

async function mount(props: Parameters<typeof GatedSection>[0]) {
  const element = await GatedSection(props);
  return render(<>{element}</>);
}

describe("GatedSection", () => {
  it("renders the section, labelled by its own h2, when the summary says there is something to show", async () => {
    const { container } = await mount({ id: "materials", title: "المواد", summary: shown, children: <p>شرائح المقدمة</p> });
    const region = screen.getByRole("region", { name: "المواد" });
    expect(region).toHaveAttribute("id", "materials");
    // The exact name other tracks' specs select on — no count inside the heading.
    expect(screen.getByRole("heading", { level: 2, name: "المواد" })).toHaveAttribute("id", "materials-heading");
    expect(region).toContainElement(screen.getByText("شرائح المقدمة"));
    const { violations } = await axe.run(container, { rules: { "color-contrast": { enabled: false } } });
    expect(violations.map((v) => v.id)).toEqual([]);
  });

  it("★ renders NO heading and NO landmark when the slot has nothing for this viewer", async () => {
    const { container } = await mount({ id: "tasks", title: "مهام ما قبل الجلسة", summary: empty, children: <p>لا يجب أن يظهر</p> });
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByRole("region")).toBeNull();
    expect(container).toBeEmptyDOMElement();
  });

  it("★ renders nothing when the page's own gate is closed, and never waits on the summary", async () => {
    // A summary that never settles: awaiting it would hang this test.
    const never = new Promise<SlotSummary>(() => {});
    const { container } = await mount({ id: "tasks", title: "مهام ما قبل الجلسة", gate: false, summary: never, children: <p>مهمة</p> });
    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByRole("heading")).toBeNull();
  });

  it("takes a summary that is still streaming", async () => {
    await mount({ id: "photos", title: "الصور", summary: Promise.resolve(shown), children: <p>صورة</p> });
    expect(screen.getByRole("region", { name: "الصور" })).toBeInTheDocument();
  });

  it("renders a section the page fills itself when there is no summary to consult", async () => {
    await mount({ id: "about", title: "نبذة", children: <p>قضينا سنة كاملة</p> });
    expect(screen.getByRole("heading", { level: 2, name: "نبذة" })).toBeInTheDocument();
  });
});

describe("the contract", () => {
  it("the section and its sub-nav entry are decided by the same rule", () => {
    expect(isSectionShown(true, shown)).toBe(true);
    expect(isSectionShown(true, empty)).toBe(false);
    expect(isSectionShown(false, shown)).toBe(false);
    expect(isSectionShown(true)).toBe(true);
    expect(isSectionShown(true, null)).toBe(true);
  });

  it("keeps the published section order and ids — `objectives` stays reserved, not rendered", () => {
    expect(EVENT_SECTION_IDS).toEqual(["attend", "about", "presenters", "tasks", "materials", "photos", "discussion", "rating"]);
    expect(EVENT_SECTION_IDS).not.toContain("objectives");
  });

  it("names every slot the page renders", () => {
    expect(SLOT_NAMES).toEqual(["RsvpPanel", "AttendanceOutcome", "AddToCalendar", "Tasks", "Materials", "Photos", "Comments", "Ratings"]);
  });
});

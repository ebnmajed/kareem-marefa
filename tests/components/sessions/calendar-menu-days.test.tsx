// «أضِف إلى تقويمك» over a session's days — `notify`'s request
// (`notify.md` §W11.2), `REQ-SES-015`, `REQ-CAL-001`, `REQ-CAL-002`.
//
// ★ THE FIRST CASE IS THE CONTRACT: a one-day menu is today's menu, three
// items, whether the caller passes no groups or one. Everything else is the
// multi-day shape `notify` asked for.
//
// A NEW file (wave-9 rule 4).
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarMenu, type CalendarMenuProps } from "@/components/sessions/calendar-menu";

const LINKS = { google: "https://calendar.google.com/one", outlook: "https://outlook.com/one", ics: "/api/sessions/x/ics" };
const LABELS = { google: "تقويم Google", outlook: "تقويم Outlook", apple: "تقويم Apple" };

const GROUPS = [
  { label: "اليوم الأول", links: { google: "https://calendar.google.com/d1", outlook: "https://outlook.com/d1" } },
  { label: "اليوم الثاني", links: { google: "https://calendar.google.com/d2", outlook: "https://outlook.com/d2" } },
  { label: "اليوم الثالث", links: { google: "https://calendar.google.com/d3", outlook: "https://outlook.com/d3" } },
];

function mount(over: Partial<CalendarMenuProps> = {}) {
  return render(<CalendarMenu label="أضِف إلى تقويمك" links={LINKS} labels={LABELS} placement="inline" {...over} />);
}

async function open() {
  await userEvent.click(screen.getByRole("button", { name: "أضِف إلى تقويمك" }));
  return screen.findAllByRole("menuitem");
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("★ a one-day menu is unchanged, and two readings of «one day» agree", () => {
  it("renders three items with no groups at all", async () => {
    mount();
    const items = await open();
    expect(items.map((i) => i.textContent)).toEqual([LABELS.google, LABELS.outlook, LABELS.apple]);
  });

  it("renders the SAME three items when one group is passed — flat, no day prefix", async () => {
    mount({ groups: [GROUPS[0]] });
    const items = await open();
    expect(items.map((i) => i.textContent)).toEqual([LABELS.google, LABELS.outlook, LABELS.apple]);
    expect(screen.queryByText(/اليوم الأول/)).toBeNull();
  });
});

describe("★ a workshop offers each day", () => {
  it("lists Google and Outlook per day, each named by contract 7's label, with one ICS at the end", async () => {
    mount({ groups: GROUPS });
    const items = await open();
    expect(items.map((i) => i.textContent)).toEqual([
      `اليوم الأول · ${LABELS.google}`,
      `اليوم الأول · ${LABELS.outlook}`,
      `اليوم الثاني · ${LABELS.google}`,
      `اليوم الثاني · ${LABELS.outlook}`,
      `اليوم الثالث · ${LABELS.google}`,
      `اليوم الثالث · ${LABELS.outlook}`,
      // ★ ONE file for every day (contract 8), never one per day.
      LABELS.apple,
    ]);
  });

  it("★ opens the DAY's link, not the session's, and in a new tab", async () => {
    const open_ = vi.spyOn(window, "open").mockImplementation(() => null);
    mount({ groups: GROUPS });
    const items = await open();
    await userEvent.click(items[4]);
    expect(open_).toHaveBeenCalledWith(GROUPS[2].links.google, "_blank", "noopener,noreferrer");
  });

  it("never names a day itself — every label it shows came in as a prop", async () => {
    mount({ groups: [{ label: "اليوم الحادي عشر", links: GROUPS[0].links }, GROUPS[1]] });
    const items = await open();
    expect(items[0].textContent).toBe(`اليوم الحادي عشر · ${LABELS.google}`);
  });
});

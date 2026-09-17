// SCR-043's day list — `REQ-SES-016`, `REQ-SES-015`, DEC-119, DEC-121, DEC-151.
//
// Rendered against the REAL `ar/` catalogues through `NextIntlClientProvider`,
// the pattern `tests/components/checkin/schedule-form.test.tsx` set: a renamed
// key fails here rather than in production. `sessions.json` is in the messages
// because the day heading is contract 7's formatter, which lives there and is
// read by four tracks — `schedule.json` deliberately has no second «اليوم
// الثاني» of its own.
//
// A NEW file (wave-9 rule 4). The one-day case below is the DOM half of the
// wave's second demonstrable; `tests/unit/schedule-days.test.ts` is the seam half.
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import adminAr from "@/messages/ar/admin.json";
import scheduleAr from "@/messages/ar/schedule.json";
import sessionsAr from "@/messages/ar/sessions.json";
import uiAr from "@/messages/ar/ui.json";
import { ScheduleForm, type SavedDay, type ScheduleInitial, type ScheduleVenue } from "@/app/[locale]/app/admin/sessions/[id]/schedule/schedule-form";
import type { ScheduleState } from "@/app/[locale]/app/admin/sessions/[id]/schedule/state";

// `admin.json` because `ui/date-time` reads `admin.dateTime` for the picker's
// own words — «لم يُحدَّد بعد» among them, which is what this file now asserts
// a day's trigger never says.
const MESSAGES = { ...adminAr, ...scheduleAr, ...sessionsAr, ...uiAr };
const EMPTY = adminAr.admin.dateTime.empty;
const DAYS = scheduleAr.schedule.days;

const HALL = "00000000-0000-4000-8000-0000000000a1";
const ANNEX = "00000000-0000-4000-8000-0000000000a2";
const VENUES: ScheduleVenue[] = [
  { id: HALL, name: "القاعة الكبرى", address: "المبنى أ", capacity: 40 },
  { id: ANNEX, name: "قاعة الملحق", address: "المبنى ب", capacity: 20 },
];

/** Wednesday 30 September 2026 and the two evenings after it, 6–7 p.m. */
const WED = "2026-09-30T18:00";
const THU = "2026-10-01T18:00";

function savedDay(id: string, startsAt: string, over: Partial<SavedDay> = {}): SavedDay {
  return {
    id,
    startsAt,
    endsAt: "",
    venueId: HALL,
    customVenueName: "",
    customVenueAddress: "",
    customVenueMapUrl: "",
    hasAttendance: false,
    contentCount: 0,
    ...over,
  };
}

const BASE: ScheduleInitial = {
  startsAt: WED,
  durationMinutes: "60",
  endsAt: "",
  venueId: HALL,
  customVenueName: "",
  customVenueAddress: "",
  customVenueMapUrl: "",
  capacity: "40",
  rsvpDeadlineAt: "",
  cancellationCutoffAt: "",
  certificateMode: "off",
  language: "ar",
  allowWalkIns: false,
};

async function noopAction(prev: ScheduleState) {
  return prev;
}

function mount(initial: ScheduleInitial) {
  return render(
    <NextIntlClientProvider locale="ar" messages={MESSAGES}>
      <ScheduleForm action={noopAction} venues={VENUES} locale="ar" timeZone="Asia/Riyadh" published={false} proposalDurationMinutes={null} initial={initial} />
    </NextIntlClientProvider>,
  );
}

/** The hidden field that carries the day set, if the form posts one at all. */
function daysField(container: HTMLElement): HTMLInputElement | null {
  return container.querySelector<HTMLInputElement>('input[name="days"]');
}

describe("★ one day costs nothing — the DOM half of the wave's second demonstrable", () => {
  it("posts NO `days` field, and shows no day list, for a session with one day", () => {
    const { container } = mount({ ...BASE, days: [savedDay("d1", WED)] });
    expect(daysField(container)).toBeNull();
    expect(screen.queryByText(DAYS.legend)).toBeNull();
    expect(screen.queryByRole("button", { name: DAYS.add })).toBeNull();
    // REQ-SES-017's control is inside the affordance: at one day it is not a
    // question, so it is not asked.
    expect(container.querySelector('input[name="requireAllDays"]')).toBeNull();
  });

  it("offers «جلسة متعدّدة الأيام» as an explicit affordance, switched off", () => {
    mount({ ...BASE, days: [savedDay("d1", WED)] });
    expect(screen.getByRole("switch", { name: DAYS.switch })).not.toBeChecked();
  });

  it("★ posts a `days` field the moment a second day is added, and never before", async () => {
    const user = userEvent.setup();
    const { container } = mount({ ...BASE, days: [savedDay("d1", WED)] });
    await user.click(screen.getByRole("switch", { name: DAYS.switch }));
    // The affordance alone is not a day set: one day is still main's call.
    expect(daysField(container)).toBeNull();

    await user.click(screen.getByRole("button", { name: DAYS.add }));
    const field = daysField(container);
    expect(field).not.toBeNull();
    const posted = JSON.parse(field!.value) as { id: string | null; startsAt: string; venueChoice: string }[];
    expect(posted).toHaveLength(2);
    // ★ Day one travels with its STORED id, so a save moves the day rather
    // than replacing the one attendance and day-scoped files hang off.
    expect(posted[0].id).toBe("d1");
    expect(posted[1].id).toBeNull();
  });
});

describe("★ the day list", () => {
  it("opens already on for a session that has more than one day", () => {
    mount({ ...BASE, days: [savedDay("d1", WED), savedDay("d2", THU)] });
    expect(screen.getByRole("switch", { name: DAYS.switch })).toBeChecked();
  });

  it("heads each day with contract 7's label, in the session's own words", () => {
    mount({ ...BASE, days: [savedDay("d1", WED), savedDay("d2", THU)] });
    // 1 October 2026 is a Thursday; the ordinal is a word, the weekday is the
    // session's zone's. `sessions.days.label`, not a second copy in schedule.json.
    expect(screen.getByRole("heading", { level: 3, name: "اليوم الثاني · الخميس" })).toBeInTheDocument();
  });

  it("★ a new day takes the previous day's clock and place — «one tap»", async () => {
    const user = userEvent.setup();
    const { container } = mount({ ...BASE, days: [savedDay("d1", WED), savedDay("d2", THU, { venueId: ANNEX })] });
    await user.click(screen.getByRole("button", { name: DAYS.add }));

    const posted = JSON.parse(daysField(container)!.value) as { startsAt: string; venueChoice: string }[];
    expect(posted).toHaveLength(3);
    // The next calendar day, the same wall clock, the same room as day two.
    expect(posted[2].startsAt).toBe("2026-10-02T18:00");
    expect(posted[2].venueChoice).toBe(ANNEX);
  });

  it("★ says an overlap AT THE FIELD, the moment the day set says so", () => {
    // Day two on day one's date and time: the two windows are the same hour.
    mount({ ...BASE, days: [savedDay("d1", WED), savedDay("d2", WED)] });
    expect(screen.getByText(scheduleAr.schedule.errors.daysOverlap)).toBeInTheDocument();
  });

  it("★ has no reorder control at all — a day is moved by changing its date", () => {
    mount({ ...BASE, days: [savedDay("d1", WED), savedDay("d2", THU)] });
    for (const name of [/لأعلى/, /لأسفل/, /رتّب/, /اسحب/]) {
      expect(screen.queryByRole("button", { name })).toBeNull();
    }
  });
});

describe("★ removing a day asks, and names it (DEC-121)", () => {
  it("names the day and says its content moves to the session rather than being deleted", async () => {
    const user = userEvent.setup();
    mount({ ...BASE, days: [savedDay("d1", WED), savedDay("d2", THU, { contentCount: 3 })] });
    await user.click(screen.getByRole("button", { name: DAYS.remove }));

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/اليوم الثاني · الخميس/)).toBeInTheDocument();
    expect(within(dialog).getByText(/إلى الجلسة كاملة/)).toBeInTheDocument();
    expect(within(dialog).getByText(/ولن تُحذف/)).toBeInTheDocument();
  });

  it("removes the day only after the confirm, and the day set shrinks with it", async () => {
    const user = userEvent.setup();
    const { container } = mount({ ...BASE, days: [savedDay("d1", WED), savedDay("d2", THU)] });
    await user.click(screen.getByRole("button", { name: DAYS.remove }));
    await user.click(screen.getByRole("button", { name: DAYS.confirm.keep }));
    expect(JSON.parse(daysField(container)!.value)).toHaveLength(2);

    await user.click(screen.getByRole("button", { name: DAYS.remove }));
    await user.click(screen.getByRole("button", { name: DAYS.confirm.remove }));
    // ★ Still posted, with ONE entry: the stored day two must be told to go.
    // A form that fell silent here would leave it exactly where it was.
    expect(JSON.parse(daysField(container)!.value)).toHaveLength(1);
  });

  it("★ offers no removal for a day that holds attendance, and says why", () => {
    mount({ ...BASE, days: [savedDay("d1", WED), savedDay("d2", THU, { hasAttendance: true })] });
    expect(screen.getByRole("button", { name: DAYS.remove })).toBeDisabled();
    expect(screen.getByText(DAYS.locked)).toBeInTheDocument();
  });
});

describe("★ REQ-SES-017's switch", () => {
  it("appears only inside the affordance, and posts an explicit value once it does", async () => {
    const user = userEvent.setup();
    const { container } = mount({ ...BASE, days: [savedDay("d1", WED), savedDay("d2", THU)], requireAllDays: true });
    const hidden = container.querySelector<HTMLInputElement>('input[name="requireAllDays"]');
    expect(hidden?.value).toBe("true");

    await user.click(screen.getByRole("switch", { name: scheduleAr.schedule.requireAllDays.label }));
    // ★ "false", not absent: a rendered switch that is off is a DECISION, and
    // only an absent field means «the form never asked».
    expect(container.querySelector<HTMLInputElement>('input[name="requireAllDays"]')?.value).toBe("false");
  });
});

describe("★ an added day's start reads as a date, not «لم يُحدَّد بعد»", () => {
  it("★ shows the inherited date on the trigger — the defect the demonstrable's capture found", async () => {
    const user = userEvent.setup();
    mount({ ...BASE, days: [savedDay("d1", WED)] });
    await user.click(screen.getByRole("switch", { name: DAYS.switch }));
    await user.click(screen.getByRole("button", { name: DAYS.add }));

    // `ui/date-time` names its trigger «{label}: {value}». The value must be
    // the date the new day inherited — the next one after day one — and never
    // the picker's empty label on a day whose heading already names its weekday.
    const trigger = screen.getByRole("button", { name: /^بداية اليوم الثاني · / });
    const name = trigger.getAttribute("aria-label") ?? trigger.textContent ?? "";
    expect(name).not.toContain(EMPTY);
    expect(name).toMatch(/2026/);
  });

  it("★ «غيّر الوقت» shows the date AND the clock it inherited, not midnight", async () => {
    const user = userEvent.setup();
    mount({ ...BASE, days: [savedDay("d1", WED)] });
    await user.click(screen.getByRole("switch", { name: DAYS.switch }));
    await user.click(screen.getByRole("button", { name: DAYS.add }));
    await user.click(screen.getByRole("button", { name: DAYS.changeTime }));

    const trigger = screen.getByRole("button", { name: /^بداية اليوم الثاني · / });
    const name = trigger.getAttribute("aria-label") ?? trigger.textContent ?? "";
    expect(name).not.toContain(EMPTY);
    // Day one is 6 p.m.; the day after it inherits 6 p.m., not 12:00 ص.
    expect(name).toMatch(/6:00/);
  });

  it("the day set it posts carries a whole wall clock, which is what the RPC needs", async () => {
    const user = userEvent.setup();
    const { container } = mount({ ...BASE, days: [savedDay("d1", WED)] });
    await user.click(screen.getByRole("switch", { name: DAYS.switch }));
    await user.click(screen.getByRole("button", { name: DAYS.add }));

    const posted = JSON.parse(daysField(container)!.value) as { startsAt: string }[];
    expect(posted[1].startsAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(posted[1].startsAt.endsWith("T18:00")).toBe(true);
  });

  it("★ and KEEPS the clock through a date-only pick — the half that failed silently", async () => {
    const user = userEvent.setup();
    const { container } = mount({ ...BASE, days: [savedDay("d1", WED)] });
    await user.click(screen.getByRole("switch", { name: DAYS.switch }));
    await user.click(screen.getByRole("button", { name: DAYS.add }));

    // Drive the real picker in DATE mode, which is what an admin meets: open
    // it, take a day of the month, confirm. It returns «YYYY-MM-DD», and
    // before the fix that went straight into the state — where the end
    // sentence, the overlap check and the save all quietly stopped working.
    await user.click(screen.getByRole("button", { name: /^بداية اليوم الثاني · / }));
    const picker = screen.getByRole("dialog", { name: /^بداية اليوم الثاني · / });
    await user.click(within(picker).getByRole("button", { name: /^20 / }));
    await user.click(within(picker).getByRole("button", { name: adminAr.admin.dateTime.done }));

    const posted = JSON.parse(daysField(container)!.value) as { startsAt: string; endsAt: string }[];
    expect(posted[1].startsAt).toMatch(/^\d{4}-\d{2}-20T18:00$/);
  });
});

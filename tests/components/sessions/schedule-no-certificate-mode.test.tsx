// SCR-043 without the certificate mode — REQ-SES-020, DEC-178 contract 2.
// SCR-045 is the mode's one writer; the schedule form neither shows nor posts
// it, and REQ-SES-017's «every day» moved beside walk-ins.
//
// A NEW file (wave-13 rule 7).
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import adminAr from "@/messages/ar/admin.json";
import scheduleAr from "@/messages/ar/schedule.json";
import sessionsAr from "@/messages/ar/sessions.json";
import uiAr from "@/messages/ar/ui.json";
import { ScheduleForm, type ScheduleInitial } from "@/app/[locale]/app/admin/sessions/[id]/schedule/schedule-form";
import type { ScheduleState } from "@/app/[locale]/app/admin/sessions/[id]/schedule/state";

const MESSAGES = { ...adminAr, ...scheduleAr, ...sessionsAr, ...uiAr };
const HALL = "00000000-0000-4000-8000-0000000000a1";

const BASE: ScheduleInitial = {
  startsAt: "2026-09-30T18:00",
  durationMinutes: "60",
  endsAt: "",
  venueId: HALL,
  customVenueName: "",
  customVenueAddress: "",
  customVenueMapUrl: "",
  capacity: "40",
  rsvpDeadlineAt: "",
  cancellationCutoffAt: "",
  language: "ar",
  allowWalkIns: false,
  days: [{ id: "d1", startsAt: "2026-09-30T18:00", endsAt: "", venueId: HALL, customVenueName: "", customVenueAddress: "", customVenueMapUrl: "", hasAttendance: false, contentCount: 0 }],
};

async function noopAction(prev: ScheduleState) {
  return prev;
}

function mount() {
  return render(
    <NextIntlClientProvider locale="ar" messages={MESSAGES}>
      <ScheduleForm
        action={noopAction}
        venues={[{ id: HALL, name: "القاعة الكبرى", address: "المبنى أ", capacity: 40 }]}
        locale="ar"
        timeZone="Asia/Riyadh"
        published={false}
        proposalDurationMinutes={null}
        initial={BASE}
      />
    </NextIntlClientProvider>,
  );
}

describe("SCR-043 no longer writes the certificate mode", () => {
  it("renders no mode control and posts no mode", () => {
    const { container } = mount();
    expect(container.querySelector('[name="certificateMode"]')).toBeNull();
    for (const label of ["لا شهادات لهذه الجلسة", "تُصدَر تلقائيًا لكل من سجّل حضوره", "تُراجَع ثم تُصدَر"]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.queryByRole("heading", { name: "الشهادة واللغة" })).toBeNull();
    // wave 21 (ledger L21-S1): the form's sections are the read card's rows now — «اللغة» is a group, not a heading.
    expect(screen.getByRole("group", { name: "اللغة" })).toBeInTheDocument();
  });

  it("puts REQ-SES-017's «every day» beside walk-ins, in the attendance section", async () => {
    const user = userEvent.setup();
    mount();
    await user.click(screen.getByRole("switch", { name: scheduleAr.schedule.days.switch }));
    // wave 21 (ledger L21-S2): the attendance section is the card's «تسجيل الحضور» row — a group; the expectation stands.
    const attendance = screen.getByRole("group", { name: scheduleAr.schedule.read.rows.checkIn });
    expect(within(attendance).getByRole("switch", { name: scheduleAr.schedule.requireAllDays.label })).toBeInTheDocument();
    expect(within(attendance).getByRole("switch", { name: scheduleAr.schedule.walkIns.label })).toBeInTheDocument();
  });
});

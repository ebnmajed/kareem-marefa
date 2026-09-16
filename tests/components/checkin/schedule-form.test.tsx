// `<ScheduleForm>`'s walk-in checkbox — checkin's one feature-only field on
// SCR-043's form (DEC-117, DEC-118, ★ transferred by DEC-137). Renders
// against the REAL `ar/admin.json` and `ar/checkin.json` catalogues through
// `NextIntlClientProvider`, the pattern `tests/components/ui/field.test.tsx`
// set — a renamed key fails here, not in production.
//
// This does not re-test the rest of the form (venue picker, date pickers,
// certificate mode) — that's `sessions`'/`console`'s surface. It proves one
// thing the walk-in hazard (docs/plan/notes/checkin.md, closed at `343991d`
// + `3c140bf`, cleaned up here) makes worth pinning: the stored
// `allow_walk_ins` value actually reaches the control, both ways.
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import ar from "@/messages/ar/admin.json";
import checkinAr from "@/messages/ar/checkin.json";
import { ScheduleForm, type ScheduleVenue } from "@/app/[locale]/app/admin/sessions/[id]/schedule/schedule-form";

const MESSAGES = { ...ar, ...checkinAr };

const VENUES: ScheduleVenue[] = [];

const BASE_INITIAL = {
  startsAt: "",
  durationMinutes: "60",
  endsAt: "",
  venueId: "",
  customVenueName: "",
  customVenueAddress: "",
  customVenueMapUrl: "",
  capacity: "",
  rsvpDeadlineAt: "",
  cancellationCutoffAt: "",
  certificateMode: "off",
  language: "ar",
};

async function noopAction(prev: { error: string | null; saved: boolean; published: boolean }) {
  return prev;
}

function renderForm(allowWalkIns: boolean) {
  return render(
    <NextIntlClientProvider locale="ar" messages={MESSAGES}>
      <ScheduleForm action={noopAction} venues={VENUES} locale="ar" initial={{ ...BASE_INITIAL, allowWalkIns }} />
    </NextIntlClientProvider>,
  );
}

describe("ScheduleForm — the walk-in checkbox reflects the session's real stored value", () => {
  it("renders checked when initial.allowWalkIns is true — the stored value reaches the control", () => {
    renderForm(true);
    expect(screen.getByRole("checkbox", { name: checkinAr.checkin.schedule.allowWalkIns.label })).toBeChecked();
  });

  it("renders unchecked when initial.allowWalkIns is false", () => {
    renderForm(false);
    expect(screen.getByRole("checkbox", { name: checkinAr.checkin.schedule.allowWalkIns.label })).not.toBeChecked();
  });
});

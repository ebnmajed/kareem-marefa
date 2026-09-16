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
import adminAr from "@/messages/ar/admin.json";
import scheduleAr from "@/messages/ar/schedule.json";
import uiAr from "@/messages/ar/ui.json";
import { ScheduleForm, type ScheduleInitial, type ScheduleVenue } from "@/app/[locale]/app/admin/sessions/[id]/schedule/schedule-form";
import type { ScheduleState } from "@/app/[locale]/app/admin/sessions/[id]/schedule/state";

// Wave 8 (`DEC-147`): the lead rebuilt SCR-043 and the field is now a
// `ui/switch` whose strings moved with the screen into `schedule.json`. The
// hazard it pins is unchanged.
const MESSAGES = { ...adminAr, ...scheduleAr, ...uiAr };

const VENUES: ScheduleVenue[] = [];

const BASE_INITIAL: Omit<ScheduleInitial, "allowWalkIns"> = {
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

async function noopAction(prev: ScheduleState) {
  return prev;
}

function renderForm(allowWalkIns: boolean) {
  return render(
    <NextIntlClientProvider locale="ar" messages={MESSAGES}>
      <ScheduleForm
        action={noopAction}
        venues={VENUES}
        locale="ar"
        timeZone="Asia/Riyadh"
        published={false}
        proposalDurationMinutes={null}
        initial={{ ...BASE_INITIAL, allowWalkIns }}
      />
    </NextIntlClientProvider>,
  );
}

describe("ScheduleForm — the walk-in checkbox reflects the session's real stored value", () => {
  it("renders checked when initial.allowWalkIns is true — the stored value reaches the control", () => {
    renderForm(true);
    expect(screen.getByRole("switch", { name: scheduleAr.schedule.walkIns.label })).toBeChecked();
  });

  it("renders unchecked when initial.allowWalkIns is false", () => {
    renderForm(false);
    expect(screen.getByRole("switch", { name: scheduleAr.schedule.walkIns.label })).not.toBeChecked();
  });
});

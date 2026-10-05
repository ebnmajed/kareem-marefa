// SCR-043's «الشهادة» row carries the certificate mode — DEC-256 (wave 27), amending DEC-178's «SCR-045 only».
//
// ★ ONE WRITER, TWO PLACES. The row renders SCR-045's own control — offered where 045 offers it (every state but
// `cancelled`), its sentence otherwise — and the two saves never move each other:
//   · inside the schedule form's edit mode, pressing the mode's save calls `saveCertificateMode()` and submits NOTHING;
//   · submitting the schedule form sends `certificateMode: null` to `schedule_session()` whatever the radios say, so the
//     stored mode stands (0154).
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import adminAr from "@/messages/ar/admin.json";
import certificatesAr from "@/messages/ar/certificates.json";
import scheduleAr from "@/messages/ar/schedule.json";
import sessionsAr from "@/messages/ar/sessions.json";
import uiAr from "@/messages/ar/ui.json";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next-intl/server", () => ({ getTranslations: async () => (k: string) => k }));

const saveCertificateMode = vi.fn(async () => ({ status: "ok" as const }));
vi.mock("@/app/[locale]/app/admin/sessions/[id]/certificates/actions", () => ({ saveCertificateMode }));

const scheduled: unknown[] = [];
vi.mock("@/lib/dal/sessions", () => ({
  // The real schema is not what is under test — what `saveSchedule()` HANDS it is.
  scheduleInput: { safeParse: (v: unknown) => ({ success: true, data: v }) },
  scheduleSession: async (_l: string, _id: string, input: unknown) => {
    scheduled.push(input);
  },
  publishSession: async () => {},
  addSessionPresenter: async () => ({}),
  removeSessionPresenter: async () => ({}),
}));

const { ScheduleCertificateMode } = await import("@/components/sessions/schedule-certificate");
const { ScheduleForm } = await import("@/app/[locale]/app/admin/sessions/[id]/schedule/schedule-form");
const { saveSchedule } = await import("@/app/[locale]/app/admin/sessions/[id]/schedule/actions");
import type { ScheduleInitial } from "@/app/[locale]/app/admin/sessions/[id]/schedule/schedule-form";
import type { ScheduleState } from "@/app/[locale]/app/admin/sessions/[id]/schedule/state";

const MESSAGES = { ...adminAr, ...certificatesAr, ...scheduleAr, ...sessionsAr, ...uiAr };
const M = certificatesAr.certificates.session.modeControl;
const SESSION = "00000000-0000-4000-8000-0000000000cc";
const HALL = "00000000-0000-4000-8000-0000000000a1";
const PREFLIGHT = { fontsLoaded: true, designs: [{ kind: "attendance" as const, saved: true }], eligible: 0, serial: null };
const SENTENCE = scheduleAr.schedule.read.certificateMode.off;

function row(state: Parameters<typeof ScheduleCertificateMode>[0]["state"], preflight: typeof PREFLIGHT | null = PREFLIGHT) {
  return <ScheduleCertificateMode locale="ar" sessionId={SESSION} state={state} mode="off" sentence={SENTENCE} preflight={preflight} />;
}

function mount(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="ar" messages={MESSAGES}>
      {node}
    </NextIntlClientProvider>,
  );
}

const INITIAL: ScheduleInitial = {
  startsAt: "2026-11-30T18:00",
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
};

beforeEach(() => {
  saveCertificateMode.mockClear();
  scheduled.length = 0;
});

describe("where the row offers the control (DEC-256)", () => {
  for (const state of ["draft", "approved", "published", "in_progress", "completed", "archived"] as const) {
    it(`${state}: the three named modes`, () => {
      mount(row(state));
      expect(screen.getByRole("radiogroup", { name: M.legend })).toBeInTheDocument();
      expect(screen.getByRole("radio", { name: new RegExp(M.options.review.label) })).toBeInTheDocument();
      expect(screen.queryByText(SENTENCE)).toBeNull();
    });
  }

  it("cancelled: the sentence, no control", () => {
    mount(row("cancelled"));
    expect(screen.getByText(SENTENCE)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("button", { name: M.save })).toBeNull();
  });

  it("SCR-045's reads failed: the sentence — the row reads, it does not offer", () => {
    mount(row("draft", null));
    expect(screen.getByText(SENTENCE)).toBeInTheDocument();
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });
});

describe("★ inside the schedule form, the two saves never move each other", () => {
  it("pressing the mode's save — through its preflight — calls saveCertificateMode and submits no schedule", async () => {
    const user = userEvent.setup();
    const schedule = vi.fn(async (prev: ScheduleState) => prev);
    const submits = vi.fn();
    const { container } = mount(
      <ScheduleForm
        action={schedule}
        venues={[{ id: HALL, name: "القاعة الكبرى", address: "المبنى أ", capacity: 40 }]}
        locale="ar"
        timeZone="Asia/Riyadh"
        published={false}
        proposalDurationMinutes={null}
        initial={INITIAL}
        readRows={{ presenters: null, certificate: row("draft") }}
      />,
    );
    container.querySelector("form")!.addEventListener("submit", submits);
    await user.click(screen.getByRole("radio", { name: new RegExp(M.options.review.label) }));
    await user.click(screen.getByRole("button", { name: M.save }));
    await user.click(await screen.findByRole("button", { name: M.confirm }));
    await waitFor(() => expect(saveCertificateMode).toHaveBeenCalledWith("ar", SESSION, "review"));
    expect(submits).not.toHaveBeenCalled();
    expect(schedule).not.toHaveBeenCalled();
  });

  it("submitting the schedule form sends certificateMode: null, whatever the radios say", async () => {
    const form = new FormData();
    form.set("intent", "save");
    form.set("startsAt", "2026-11-30T18:00");
    form.set("durationMinutes", "60");
    form.set("venueChoice", HALL);
    form.set("capacity", "40");
    form.set("language", "ar");
    form.set("certificateMode", "review");
    const prev = { values: {}, errors: {}, formError: null, saved: false, published: false } as unknown as ScheduleState;
    await saveSchedule("ar", SESSION, "Asia/Riyadh", prev, form);
    expect(scheduled).toHaveLength(1);
    expect((scheduled[0] as { certificateMode: unknown }).certificateMode).toBeNull();
    expect(saveCertificateMode).not.toHaveBeenCalled();
  });
});

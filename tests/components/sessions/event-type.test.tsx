// «نوع الفعالية» — REQ-SES-022 (0213, DEC-267). A new file.
//
// Three places the event type is chosen or shown:
//   · the proposal form sends `eventType` with the rest — a talk unless the proposer picked another;
//   · الجدولة's edit-mode control saves a new type through its own action, and nothing else;
//   · the event page's hero names the type as a chip.
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import adminAr from "@/messages/ar/admin.json";
import designerAr from "@/messages/ar/designer.json";
import proposalsAr from "@/messages/ar/proposals.json";
import scheduleAr from "@/messages/ar/schedule.json";
import sessionsAr from "@/messages/ar/sessions.json";
import uiAr from "@/messages/ar/ui.json";
import type { EventSession } from "@/lib/dal/sessions";
import type { ProposalField, ProposeState } from "@/app/[locale]/app/propose/state";

vi.mock("server-only", () => ({}));

const messages = { ...proposalsAr, ...uiAr, ...sessionsAr, ...scheduleAr, ...designerAr, admin: { combobox: adminAr.admin.combobox } };
const TYPES = sessionsAr.sessions.eventType;

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as never }),
}));
vi.mock("@/lib/dal/posters", () => ({ getSessionPoster: vi.fn(async () => null) }));

const saveEventType = vi.fn(async (..._args: unknown[]) => ({ ok: true as const }));
vi.mock("@/app/[locale]/app/admin/sessions/[id]/schedule/actions", () => ({ saveEventType }));

const { ProposalForm } = await import("@/app/[locale]/app/propose/proposal-form");
const { PROPOSAL_VALUE_FIELDS } = await import("@/app/[locale]/app/propose/state");
const { formStateFrom } = await import("@/lib/form-state");
const { EventTypeControl } = await import("@/app/[locale]/app/admin/sessions/[id]/schedule/event-type-control");
const { EventHero } = await import("@/components/sessions/event-hero");

const CATEGORY = "4f2c9b1e-7d3a-4c8e-9b2f-1a6d5e8c3b70";
const SESSION_ID = "00000000-0000-4000-8000-0000000000e1";

function wrap(node: React.ReactNode) {
  return render(
    <NextIntlClientProvider locale="ar" messages={messages}>
      {node}
    </NextIntlClientProvider>,
  );
}

describe("the proposal form", () => {
  function mountForm() {
    const sent: FormData[] = [];
    const action = async (prev: ProposeState, formData: FormData): Promise<ProposeState> => {
      sent.push(formData);
      return formStateFrom<ProposalField>(formData, { fields: PROPOSAL_VALUE_FIELDS, lists: ["coPresenters"], previous: prev });
    };
    wrap(<ProposalForm mode="create" action={action} categories={[{ id: CATEGORY, name: "فني" }]} members={[]} maxCoPresenters={4} maxCoPresentersLabel="4" />);
    return sent;
  }
  const submit = async () => {
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: proposalsAr.proposals.propose.form.submit }));
    });
  };

  it("offers the four types under «نوع الفعالية», a talk by default, and sends it", async () => {
    const sent = mountForm();
    const group = screen.getByRole("radiogroup", { name: TYPES.label });
    expect(group).toBeInTheDocument();
    for (const type of ["talk", "workshop", "panel", "meetup"] as const) expect(screen.getByRole("radio", { name: TYPES[type] })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: TYPES.talk })).toBeChecked();
    await submit();
    expect(sent[0]?.get("eventType")).toBe("talk");
  });

  it("sends the type the proposer picked", async () => {
    const sent = mountForm();
    fireEvent.click(screen.getByRole("radio", { name: TYPES.workshop }));
    await submit();
    expect(sent[0]?.get("eventType")).toBe("workshop");
  });
});

describe("الجدولة's event type control", () => {
  it("saves a new type through its own action, and only once something changed", async () => {
    saveEventType.mockClear();
    wrap(<EventTypeControl locale="ar" sessionId={SESSION_ID} eventType="talk" />);
    const save = screen.getByRole("button", { name: scheduleAr.schedule.eventType.save });
    expect(save).toBeDisabled();
    await userEvent.click(screen.getByRole("radio", { name: TYPES.panel }));
    expect(save).toBeEnabled();
    await userEvent.click(save);
    await waitFor(() => expect(saveEventType).toHaveBeenCalledWith("ar", SESSION_ID, "panel"));
    await waitFor(() => expect(save).toBeDisabled());
  });
});

describe("the event page's hero", () => {
  it("names the event type as a chip", async () => {
    const session = {
      id: SESSION_ID,
      title: "ورشة تحليل البيانات",
      abstract: "نبذة",
      state: "published",
      level: "introductory",
      language: "ar",
      eventType: "meetup",
      categoryId: null,
      categoryName: null,
      durationMinutes: 60,
      tags: [],
      startsAt: "2026-10-17T07:42:00.000Z",
      endsAt: "2026-10-17T08:42:00.000Z",
      timeZone: "Asia/Riyadh",
      venue: null,
      capacity: 40,
      rsvpDeadlineAt: null,
      cancellationCutoffAt: null,
      cancellationReason: null,
      presenters: [],
      viewerIsPresenter: false,
      viewerIsStaff: false,
      viewerRelation: "none",
      allowWalkIns: false,
      checkInOpen: false,
      rsvpStatus: null,
      checkedIn: false,
    } as unknown as EventSession;
    const element = await EventHero({ session, phase: "open", seat: "available", closingSoon: false, dayCount: 1, points: null, locale: "ar" });
    wrap(element);
    expect(screen.getByText(TYPES.meetup)).toBeInTheDocument();
  });
});

// The RsvpPanel slot (REQ-RSV-001, REQ-RSV-005, REQ-RSV-006, REQ-RSV-010).
// Renders against the REAL ar/rsvp.json catalogue through next-intl's
// createTranslator, so a broken ICU plural or a renamed key fails here —
// getRsvpPanelData is the only thing mocked, since it's the DAL boundary
// (server-only, real Supabase calls).
import { createTranslator } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/rsvp.json";
import type { RsvpPanelData } from "@/lib/dal/rsvp";

vi.mock("@/lib/dal/rsvp", () => ({ getRsvpPanelData: vi.fn() }));
// The panel formats its counts with the org's numerals (REQ-INT-006, DEC-056).
vi.mock("@/lib/dal/designer", () => ({ getOrgNumerals: vi.fn(async () => "western") }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "rsvp" }),
}));

const { getRsvpPanelData } = await import("@/lib/dal/rsvp");
const { RsvpPanel } = await import("@/components/checkin/rsvp-panel");

const base: RsvpPanelData = {
  sessionId: "11111111-1111-1111-1111-111111111111",
  state: "published",
  capacity: 30,
  confirmedCount: 27,
  waitlistCount: 0,
  deadlinePassed: false,
  cutoffPassed: false,
  myRsvp: null,
  isPresenter: false,
};

describe("RsvpPanel", () => {
  it("offers a seat with the remaining count, in Arabic, when the member has not reserved", async () => {
    vi.mocked(getRsvpPanelData).mockResolvedValue({ ...base });
    render(await RsvpPanel({ sessionId: base.sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByText("يتبقى 3 مقاعد")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "احجز مقعدك" })).toBeInTheDocument();
  });

  it("hides the reserve button and explains once the deadline has passed", async () => {
    vi.mocked(getRsvpPanelData).mockResolvedValue({ ...base, deadlinePassed: true });
    render(await RsvpPanel({ sessionId: base.sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByText("انتهى وقت الحجز لهذه الجلسة")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "احجز مقعدك" })).not.toBeInTheDocument();
  });

  it("shows the waitlist position, bidi-isolated, and a leave-waitlist action", async () => {
    vi.mocked(getRsvpPanelData).mockResolvedValue({ ...base, confirmedCount: 30, waitlistCount: 2, myRsvp: { status: "waitlisted", waitlistPosition: 2 } });
    render(await RsvpPanel({ sessionId: base.sessionId, memberId: "m1", locale: "ar" }));
    const bdi = screen.getByText(/ترتيبك رقم/).closest("bdi");
    expect(bdi).not.toBeNull();
    expect(screen.getByRole("button", { name: "غادر قائمة الانتظار" })).toBeInTheDocument();
  });

  it("shows the confirmed state with a plain cancel action before the cutoff", async () => {
    vi.mocked(getRsvpPanelData).mockResolvedValue({ ...base, myRsvp: { status: "confirmed", waitlistPosition: null } });
    render(await RsvpPanel({ sessionId: base.sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByText("تم تأكيد حجزك")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إلغاء الحجز" })).toBeInTheDocument();
  });

  it("warns before a late cancellation once the cutoff has passed", async () => {
    vi.mocked(getRsvpPanelData).mockResolvedValue({ ...base, cutoffPassed: true, myRsvp: { status: "confirmed", waitlistPosition: null } });
    render(await RsvpPanel({ sessionId: base.sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByText(/سيُسجَّل هذا كإلغاء متأخر/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "إلغاء الحجز (سيُسجَّل كإلغاء متأخر)" })).toBeInTheDocument();
  });

  it("renders nothing for the session's own presenter", async () => {
    vi.mocked(getRsvpPanelData).mockResolvedValue({ ...base, isPresenter: true });
    const { container } = render(await RsvpPanel({ sessionId: base.sessionId, memberId: "m1", locale: "ar" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the session isn't visible (deleted, wrong org)", async () => {
    vi.mocked(getRsvpPanelData).mockResolvedValue(null);
    const { container } = render(await RsvpPanel({ sessionId: base.sessionId, memberId: "m1", locale: "ar" }));
    expect(container).toBeEmptyDOMElement();
  });
});

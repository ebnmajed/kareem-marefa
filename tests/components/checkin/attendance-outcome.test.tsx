// AttendanceOutcome — `16` §5.3's ★ ask-4 cells (REQ-UIX-015, DEC-090,
// DEC-045). Same harness shape as rsvp-panel.test.tsx: renders against the
// REAL ar/rsvp.json catalogue, only getRsvpPanelData is mocked.
import { createTranslator } from "next-intl";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/rsvp.json";
import type { RsvpPanelData } from "@/lib/dal/rsvp";

vi.mock("@/lib/dal/rsvp", () => ({ getRsvpPanelData: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as "rsvp" }),
}));

const { getRsvpPanelData } = await import("@/lib/dal/rsvp");
const { AttendanceOutcome } = await import("@/components/checkin/attendance-outcome");

const base: RsvpPanelData = {
  sessionId: "11111111-1111-1111-1111-111111111111",
  phase: "ended",
  relation: "attended",
  seat: "closed",
  capacity: 30,
  confirmedCount: 27,
  waitlistCount: 0,
  cutoffPassed: true,
  myRsvp: { status: "confirmed", waitlistPosition: null },
  canReserve: false,
  canCancel: false,
};

describe("AttendanceOutcome", () => {
  it("says «حضرت» for a checked-in attendee, with no heading of its own (16 §5.4.1a(b))", async () => {
    vi.mocked(getRsvpPanelData).mockResolvedValue({ ...base });
    const { container } = render(await AttendanceOutcome({ sessionId: base.sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByRole("status")).toHaveTextContent("حضرت");
    expect(container.querySelector("h1, h2, h3")).toBeNull();
  });

  it("says «لم تُسجّل حضورك» for a member who held a seat but never checked in", async () => {
    vi.mocked(getRsvpPanelData).mockResolvedValue({ ...base, relation: "absent" });
    render(await AttendanceOutcome({ sessionId: base.sessionId, memberId: "m1", locale: "ar" }));
    expect(screen.getByRole("status")).toHaveTextContent("لم تُسجّل حضورك");
  });

  it("renders nothing before the session has ended — the outcome isn't a fact yet", async () => {
    vi.mocked(getRsvpPanelData).mockResolvedValue({ ...base, phase: "live", relation: "confirmed" });
    const { container } = render(await AttendanceOutcome({ sessionId: base.sessionId, memberId: "m1", locale: "ar" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for a viewer with no outcome to show (never reserved, ended)", async () => {
    vi.mocked(getRsvpPanelData).mockResolvedValue({ ...base, relation: "none" });
    const { container } = render(await AttendanceOutcome({ sessionId: base.sessionId, memberId: "m1", locale: "ar" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing for the session's own presenter or staff on an ended session", async () => {
    vi.mocked(getRsvpPanelData).mockResolvedValue({ ...base, relation: "presenter" });
    const { container } = render(await AttendanceOutcome({ sessionId: base.sessionId, memberId: "m1", locale: "ar" }));
    expect(container).toBeEmptyDOMElement();
  });

  it("renders nothing when the session isn't visible", async () => {
    vi.mocked(getRsvpPanelData).mockResolvedValue(null);
    const { container } = render(await AttendanceOutcome({ sessionId: base.sessionId, memberId: "m1", locale: "ar" }));
    expect(container).toBeEmptyDOMElement();
  });
});

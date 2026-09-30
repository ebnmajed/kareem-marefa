// SCR-014's earn panel — REQ-UIX-062 («the amount is the rule's and arrives at completion»),
// REQ-CHK-018, DEC-206 §4.45 / §4.49. The figure is read, never a literal; a `+0` is never drawn; it
// speaks only while the award state has nothing to say; it is not the award's named region.
import type { ReactElement } from "react";
import { createTranslator } from "next-intl";
import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import checkin from "@/messages/ar/checkin.json";
import type { SessionAwardState } from "@/lib/dal/points";

vi.mock("@/lib/dal/search", () => ({ getAttendanceRulePoints: vi.fn() }));
vi.mock("@/components/checkin/award-state", () => ({ readAward: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: checkin, namespace: namespace as "checkin" }),
}));

const { getAttendanceRulePoints } = await import("@/lib/dal/search");
const { readAward } = await import("@/components/checkin/award-state");
const { EarnPanel } = await import("@/components/checkin/earn-panel");

const SESSION = "11111111-1111-4111-8111-111111111111";

async function show(points: number | null, award: SessionAwardState | null, allDays = false) {
  vi.mocked(getAttendanceRulePoints).mockResolvedValue(points);
  vi.mocked(readAward).mockResolvedValue(award);
  const tree = (await EarnPanel({ sessionId: SESSION, locale: "ar", allDays })) as ReactElement | null;
  return render(<>{tree}</>);
}

beforeEach(() => vi.clearAllMocks());

describe("EarnPanel", () => {
  it("draws the rule's amount, in Western digits, and that it arrives when the session ends", async () => {
    await show(20, { state: "none" });
    expect(screen.getByText("+20")).toBeInTheDocument();
    expect(screen.getByText("تُضاف إلى رصيدك عند انتهاء الجلسة.")).toBeInTheDocument();
  });

  it("a multi-day session that needs every day says so", async () => {
    await show(20, { state: "none" }, true);
    expect(screen.getByText(/إن حضرت كل أيامها/)).toBeInTheDocument();
  });

  it("★ never a +0: the rule off or zero draws nothing", async () => {
    const off = await show(null, { state: "none" });
    expect(off.container).toBeEmptyDOMElement();
    off.unmount();
    const zero = await show(0, { state: "none" });
    expect(zero.container).toBeEmptyDOMElement();
  });

  it("★ silent once the award state speaks — pending on day 2 of 3 is the award's to say", async () => {
    const { container } = await show(20, { state: "pending", points: 20, daysAttended: 1, daysRequired: 3, dayCount: 3 });
    expect(container).toBeEmptyDOMElement();
  });

  it("a failed award read still lets the rule's amount stand", async () => {
    await show(20, null);
    expect(screen.getByText("+20")).toBeInTheDocument();
  });

  it("is not the region «نقاط هذه الجلسة», and carries no streak line", async () => {
    await show(20, { state: "none" });
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByText(/سلسلت/)).toBeNull();
  });
});

// SCR-012's outcome once a session has ended (REQ-UIX-061, REQ-CHK-018, REQ-PTS-015, DEC-209 §2): the amount
// is scoring's, never a literal; the paid figure goes through scoring's moment 3; a presenter's award is drawn
// only where one exists.
import { render, screen } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ar from "@/messages/ar/sessions.json";
import type { EventSession } from "@/lib/dal/sessions";

vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages: ar, namespace: namespace as never }),
}));
vi.mock("@/components/checkin/attendance-outcome", () => ({ AttendanceOutcome: () => <p>حضرت</p> }));
vi.mock("@/components/checkin/award-state", () => ({ readAward: vi.fn(), AwardState: () => <p data-testid="award">award</p> }));
vi.mock("@/lib/dal/points", () => ({ getSessionCompletion: vi.fn(), getPresenterAward: vi.fn() }));
vi.mock("@/lib/dal/certificates", () => ({ listMyCertificates: vi.fn(async () => ({ certificates: [] })) }));
vi.mock("@/components/scoring/completion-moment", () => ({ CompletionMoment: ({ children }: { children: React.ReactNode }) => <div data-testid="moment">{children}</div> }));
vi.mock("@/components/scoring/moment-completion", () => ({ CompletionFigure: ({ text }: { text: string }) => <span data-testid="figure">{text}</span> }));

const { readAward } = await import("@/components/checkin/award-state");
const { getSessionCompletion, getPresenterAward } = await import("@/lib/dal/points");
const { OutcomeCard } = await import("@/components/sessions/outcome-card");

const base = { id: "s1", timeZone: "Asia/Riyadh", checkedInAt: "2026-09-30T15:41:00Z" } as unknown as EventSession;
const slot = { sessionId: "s1", memberId: "m1", locale: "ar" };

async function mount(relation: EventSession["viewerRelation"]) {
  const element = await OutcomeCard({ session: { ...base, viewerRelation: relation }, slot });
  return render(<NextIntlClientProvider locale="ar" messages={ar}>{element}</NextIntlClientProvider>);
}

beforeEach(() => {
  vi.mocked(getSessionCompletion).mockResolvedValue(null);
  vi.mocked(getPresenterAward).mockResolvedValue(null);
});

describe("OutcomeCard", () => {
  it("★ paid: the coin is the award's amount, counted by scoring's moment 3, with when it was paid", async () => {
    vi.mocked(readAward).mockResolvedValue({ state: "paid", points: 35 });
    vi.mocked(getSessionCompletion).mockResolvedValue({ award: { state: "paid", points: 35, occurrenceId: "completion:e1", paidAt: "2026-09-30T17:02:00Z" }, mark: {}, needsMark: true } as never);
    await mount("attended");
    expect(screen.getByTestId("moment")).toBeInTheDocument();
    expect(screen.getByTestId("figure")).toHaveTextContent("+35");
    expect(screen.getByText(/سجّلت حضورك/)).toBeInTheDocument();
    expect(screen.getByText(/في سجلك منذ/)).toBeInTheDocument();
    expect(screen.getByTestId("award")).toBeInTheDocument();
  });

  it("pending: the amount without a moment — nothing is paid yet", async () => {
    vi.mocked(readAward).mockResolvedValue({ state: "pending", points: 20, daysAttended: 1, daysRequired: 1, dayCount: 1 });
    const { container } = await mount("attended");
    expect(screen.queryByTestId("moment")).toBeNull();
    expect(container).toHaveTextContent("+20");
  });

  it("★ no award, no coin — a «+0» is never drawn", async () => {
    vi.mocked(readAward).mockResolvedValue({ state: "none" });
    const { container } = await mount("absent");
    expect(container.textContent).not.toMatch(/\+\d/);
  });

  it("a presenter: «قدّمت هذه الجلسة», with scoring's award where one exists and none otherwise", async () => {
    const without = await mount("presenter");
    expect(screen.getByText("قدّمت هذه الجلسة")).toBeInTheDocument();
    expect(without.container.textContent).not.toMatch(/\+\d/);
    without.unmount();
    vi.mocked(getPresenterAward).mockResolvedValue({ points: 100, paidAt: "2026-09-30T17:02:00Z" });
    const withAward = await mount("presenter");
    expect(withAward.container).toHaveTextContent("+100");
  });

  it("anyone else sees no outcome", async () => {
    vi.mocked(readAward).mockResolvedValue({ state: "none" });
    const { container } = await mount("staff");
    expect(container).toBeEmptyDOMElement();
  });
});

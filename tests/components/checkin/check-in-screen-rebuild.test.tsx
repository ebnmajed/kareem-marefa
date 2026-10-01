// SCR-014, rebuilt from `CheckIn.dc.html` — wave 18, PR B (REQ-UIX-062, STORY-UIX-049, DEC-208,
// DEC-209). New cases for the rebuilt regions; `check-in-screen.test.tsx` keeps what wave 16 pinned.
import type { ReactElement, ReactNode } from "react";
import { createTranslator } from "next-intl";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import checkin from "@/messages/ar/checkin.json";
import sessions from "@/messages/ar/sessions.json";
import type { CheckInScreenData } from "@/lib/dal/checkin";

const messages = { ...checkin, ...sessions };

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));
vi.mock("@/lib/dal/session", () => ({ requireSession: async () => ({}) }));
vi.mock("@/lib/dal/checkin", () => ({ getCheckInScreenData: vi.fn(), getConflictTitle: vi.fn(async () => null) }));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "checkin" }),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
  useRouter: () => ({ push: () => {} }),
}));
vi.mock("@/components/checkin/award-state", () => ({ AwardState: () => <section data-testid="award-section" /> }));
vi.mock("@/components/checkin/moment-check-in-rest", () => ({ CheckInRest: () => <div data-testid="static-state" /> }));
// ★ Wave 18 (REQ-UIX-062): the rebuilt screen's mini-row and earn panel read the poster and the
// scoring rule; each has its own suite, and here they are stubbed like the award section.
vi.mock("@/components/checkin/check-in-session-row", () => ({ CheckInSessionRow: () => <div data-testid="session-row" /> }));
vi.mock("@/components/checkin/earn-panel", () => ({ EarnPanel: () => <div data-testid="earn-panel" /> }));
vi.mock("@/app/[locale]/app/sessions/[id]/check-in/actions", () => ({
  submitCheckInForm: Object.assign(async () => {}, { bind: () => async () => {} }),
  checkInForMoment: Object.assign(async () => ({ checkInId: "x" }), { bind: () => async () => ({ checkInId: "x" }) }),
}));

const { getCheckInScreenData, getConflictTitle } = await import("@/lib/dal/checkin");
const { default: CheckInPage } = await import("@/app/[locale]/app/sessions/[id]/check-in/page");

const SESSION = "11111111-1111-4111-8111-111111111111";

const data = (over: Partial<CheckInScreenData> = {}): CheckInScreenData => ({
  sessionId: SESSION,
  title: "جلسة اختبار",
  phase: "live",
  relation: "confirmed",
  allowWalkIns: false,
  canAttemptCheckIn: true,
  ineligibleReason: null,
  day: null,
  dayCount: 1,
  timeZone: "Asia/Riyadh",
  checkedInToday: false,
  arrivedAt: null,
  teamColor: null,
  rotationSeconds: 600,
  venueName: null,
  startsAt: null,
  requireAllDays: true,
  ...over,
});

async function show(screenData: CheckInScreenData, search: Record<string, string> = {}) {
  vi.mocked(getCheckInScreenData).mockResolvedValue(screenData);
  const tree = (await CheckInPage({ params: Promise.resolve({ locale: "ar", id: SESSION }), searchParams: Promise.resolve(search) })) as ReactElement;
  return render(tree);
}

beforeEach(() => {
  vi.mocked(getCheckInScreenData).mockReset();
  vi.mocked(getConflictTitle).mockReset();
  vi.mocked(getConflictTitle).mockResolvedValue(null);
});

describe("★ the rebuilt regions (CheckIn.dc.html, REQ-UIX-062)", () => {
  it("the close control leads back to the event page, named", async () => {
    await show(data());
    expect(screen.getByRole("link", { name: "إغلاق" })).toHaveAttribute("href", `/app/sessions/${SESSION}`);
  });

  it("the rules line says the org's rotation — never «10» by default — and «no reservation» only when walk-ins are allowed", async () => {
    const { container, unmount } = await show(data({ rotationSeconds: 300, allowWalkIns: false }));
    expect(container).toHaveTextContent("الرمز يتغيّر كل 5 دقائق، ويُقبل أثناء الجلسة فقط.");
    expect(container).not.toHaveTextContent("لا حاجة لحجز مسبق");
    unmount();
    const open = await show(data({ rotationSeconds: 600, allowWalkIns: true }));
    expect(open.container).toHaveTextContent("كل 10 دقائق");
    expect(open.container).toHaveTextContent("لا حاجة لحجز مسبق.");
  });

  it("a rotation that is not whole minutes is said in seconds", async () => {
    const { container } = await show(data({ rotationSeconds: 90 }));
    expect(container).toHaveTextContent("الرمز يتغيّر كل 90 ثانية");
  });

  it("the one submit sits in the bottom bar, inside the form, with the room's note", async () => {
    await show(data());
    const bar = screen.getByRole("group", { name: "إرسال رمز الحضور" });
    expect(within(bar).getByRole("button", { name: "تسجيل الحضور" })).toBeInTheDocument();
    expect(bar.closest("form")).not.toBeNull();
    expect(bar).toHaveTextContent("لم تلتقط الرمز؟");
  });

  it("the earn panel stands after the form's rules, before the award", async () => {
    await show(data());
    const earn = screen.getByTestId("earn-panel");
    const award = screen.getByTestId("award-section");
    expect(earn.compareDocumentPosition(award) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

describe("★ a refused code does not move (REQ-UIX-046, DEC-206 §4.75)", () => {
  it("the border, the glyph and the sentence, under the boxes — and no animation anywhere", async () => {
    const { container } = await show(data(), { error: "invalid_code", code: "ZZZZZZ" });
    const alert = screen.getByRole("alert");
    const group = screen.getByRole("group", { name: "أدخل رمز الحضور الذي أعلنه المُقدِّم" });
    expect(group.compareDocumentPosition(alert) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(alert.querySelector("svg")).not.toBeNull();
    expect(container.innerHTML).not.toMatch(/animate-|animation:|shake/);
  });

  it("rate-limited states no wait it cannot know (DEC-209 D1)", async () => {
    await show(data(), { error: "rate_limited", code: "ZZZZZZ" });
    expect(screen.getByRole("alert")).toHaveTextContent("محاولات كثيرة");
    expect(screen.getAllByRole("textbox").every((b) => !(b as HTMLInputElement).disabled)).toBe(true);
  });
});

describe("★ REQ-CHK-013 — the refusal names the conflicting session", () => {
  it("names it, isolated, as a link to it", async () => {
    const OTHER = "22222222-2222-4222-8222-222222222222";
    vi.mocked(getConflictTitle).mockResolvedValue("ورشة التفاوض");
    await show(data(), { error: "overlap", code: "M7K3QX", conflict: OTHER });
    const alert = screen.getByRole("alert");
    const link = within(alert).getByRole("link", { name: "ورشة التفاوض" });
    expect(link).toHaveAttribute("href", `/app/sessions/${OTHER}`);
    expect(link.querySelector("bdi")).not.toBeNull();
    expect(getConflictTitle).toHaveBeenCalledWith("ar", OTHER);
  });

  it("a session this member may not see falls back to the sentence that names none", async () => {
    await show(data(), { error: "overlap", code: "M7K3QX", conflict: "22222222-2222-4222-8222-222222222222" });
    expect(screen.getByRole("alert")).toHaveTextContent("أنت مسجَّل في جلسة أخرى في نفس الوقت");
  });
});

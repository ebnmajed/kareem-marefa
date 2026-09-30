// SCR-014 as the page composes it — wave 16 (REQ-UIX-035, REQ-UIX-046, DEC-195 §2.4, DEC-197 §4).
//
// The page is rendered against the REAL ar catalogue with its DAL read mocked.
// The static state and the award section are stubbed here (they have their own
// suites); what is pinned is the screen's composition:
//   · ★ `code-input` adopted: the group is named by its VISIBLE label, each box
//     by its position, the refusal is tied to the boxes, and one hidden `code`
//     field posts — the field the Server Action has always read;
//   · a member checked in to today gets the static state, never the form;
//   · ★ `reservation_required` reads its own sentence, never «حدث خطأ»;
//   · everything sits inside the playground's scope.
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
vi.mock("@/lib/dal/checkin", () => ({ getCheckInScreenData: vi.fn() }));
vi.mock("next-intl/server", () => ({
  setRequestLocale: () => {},
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "checkin" }),
}));
vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("notFound"); } }));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children }: { href: string; children: ReactNode }) => <a href={href}>{children}</a>,
  useRouter: () => ({ push: () => {} }),
}));
vi.mock("@/components/checkin/award-state", () => ({ AwardState: () => <section data-testid="award-section" /> }));
vi.mock("@/components/checkin/moment-check-in-rest", () => ({ CheckInRest: () => <div data-testid="static-state" /> }));
vi.mock("@/app/[locale]/app/sessions/[id]/check-in/actions", () => ({
  submitCheckInForm: Object.assign(async () => {}, { bind: () => async () => {} }),
  checkInForMoment: Object.assign(async () => ({ checkInId: "x" }), { bind: () => async () => ({ checkInId: "x" }) }),
}));

const { getCheckInScreenData } = await import("@/lib/dal/checkin");
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
  ...over,
});

async function show(screenData: CheckInScreenData, search: Record<string, string> = {}) {
  vi.mocked(getCheckInScreenData).mockResolvedValue(screenData);
  const tree = (await CheckInPage({ params: Promise.resolve({ locale: "ar", id: SESSION }), searchParams: Promise.resolve(search) })) as ReactElement;
  return render(tree);
}

beforeEach(() => vi.mocked(getCheckInScreenData).mockReset());

describe("★ code-input adopted (REQ-UIX-035)", () => {
  it("names the group by its visible label and each box by its position; one hidden `code` field posts", async () => {
    const { container } = await show(data());
    const group = screen.getByRole("group", { name: "رمز الحضور" });
    const boxes = within(group).getAllByRole("textbox");
    expect(boxes).toHaveLength(6);
    expect(boxes[0]).toHaveAccessibleName("الخانة 1 من 6");
    expect(boxes[5]).toHaveAccessibleName("الخانة 6 من 6");
    expect(boxes[0]).toHaveAttribute("id", "code-0");
    const hidden = container.querySelectorAll('input[type="hidden"][name="code"]');
    expect(hidden).toHaveLength(1);
    expect(boxes.every((b) => !b.hasAttribute("name"))).toBe(true);
  });

  it("★ a refusal is tied to the boxes, said once by the alert, and the code comes back", async () => {
    await show(data(), { error: "invalid_code", code: "ZZZZZZ" });
    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent("الرمز غير صحيح");
    const group = screen.getByRole("group", { name: "رمز الحضور" });
    expect(group).toHaveAttribute("aria-describedby", alert.id);
    expect(within(group).getAllByRole("textbox")[0]).toHaveAttribute("aria-invalid", "true");
    expect(within(group).getAllByRole("textbox").map((b) => (b as HTMLInputElement).value).join("")).toBe("ZZZZZZ");
  });

  it("★ reservation_required reads its own sentence, never «حدث خطأ» (DEC-197 §4)", async () => {
    await show(data(), { error: "reservation_required", code: "M7K3QX" });
    expect(screen.getByRole("alert")).toHaveTextContent("هذه الجلسة لأصحاب الحجز المؤكد فقط");
    expect(screen.getByRole("alert")).not.toHaveTextContent("حدث خطأ");
  });

  it("an untouched form is not invalid and describes nothing", async () => {
    await show(data());
    const group = screen.getByRole("group", { name: "رمز الحضور" });
    expect(group).not.toHaveAttribute("aria-describedby");
    expect(within(group).getAllByRole("textbox")[0]).not.toHaveAttribute("aria-invalid");
  });
});

describe("the static state replaces the form once checked in to today (REQ-UIX-046)", () => {
  it("before the check-in: the form, then the award section", async () => {
    await show(data());
    expect(screen.getByRole("button", { name: "تسجيل الحضور" })).toBeInTheDocument();
    expect(screen.queryByTestId("static-state")).toBeNull();
    expect(screen.getByTestId("award-section")).toBeInTheDocument();
  });

  it("checked in to today: the static state, no form, no second award section", async () => {
    await show(data({ checkedInToday: true, arrivedAt: "2026-09-29T15:41:00Z" }));
    expect(screen.getByTestId("static-state")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تسجيل الحضور" })).toBeNull();
    expect(screen.queryByTestId("award-section")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("`?already=1` keeps its own status beside the static state", async () => {
    await show(data({ checkedInToday: true }), { already: "1" });
    expect(screen.getByRole("status")).toHaveTextContent("أنت مسجَّل بالفعل");
    expect(screen.getByTestId("static-state")).toBeInTheDocument();
  });

  it("a refusal reason still leads, with the award after it — the window closed is the truth", async () => {
    await show(data({ checkedInToday: true, canAttemptCheckIn: false, ineligibleReason: "session_ended" }));
    expect(screen.getByRole("status")).toHaveTextContent("انتهت هذه الجلسة");
    expect(screen.queryByTestId("static-state")).toBeNull();
    expect(screen.getByTestId("award-section")).toBeInTheDocument();
  });
});

describe("the scope (wave 17, DEC-199 §1.3.4)", () => {
  // Wave 16 wrapped this screen in its own scope (contract 3 of that wave). From wave 17 the
  // shell's layout is the scope and scopes do not nest, so the content's root is a plain element
  // — still never transformed, because the moment moves elements inside it.
  it("the content's root is a plain element: the layout's scope is the screen's, and it is never transformed", async () => {
    const { container } = await show(data());
    const root = container.firstElementChild as HTMLElement;
    expect(root).not.toHaveClass("theme-play");
    expect(container.querySelector(".theme-play")).toBeNull();
    expect(root.getAttribute("style") ?? "").not.toMatch(/transform|filter/);
    expect(within(root).getByRole("heading", { level: 1 })).toHaveTextContent("تسجيل الحضور");
  });
});

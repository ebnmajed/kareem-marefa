// AwardState — REQ-CHK-018, DEC-172, DEC-174 (contract 1). Renders against the
// REAL ar/checkin.json and ar/sessions.json catalogues; only `scoring`'s
// `getSessionAwardState()` is mocked, with fixture DTOs of its published type.
//
// What is pinned: the four states and nothing else decide what renders; `none`
// is silence; the days line follows `daysRequired`, never `dayCount`; every
// number is Western and isolated; the block is never a live region (SCR-014's
// status line is asserted as the page's ONLY status by two e2e specs); and a
// failed read is silence plus a server log, never a broken screen.
import type { ReactElement } from "react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import checkin from "@/messages/ar/checkin.json";
import sessions from "@/messages/ar/sessions.json";
import type { SessionAwardState } from "@/lib/dal/points";

const messages = { ...checkin, ...sessions };

vi.mock("@/lib/dal/points", () => ({ getSessionAwardState: vi.fn() }));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace: string) => createTranslator({ locale: "ar", messages, namespace: namespace as "checkin" }),
}));

const { getSessionAwardState } = await import("@/lib/dal/points");
const { AwardState } = await import("@/components/checkin/award-state");

const SESSION = "11111111-1111-4111-8111-111111111111";
// Eastern Arabic-Indic digits, as a code-point range so this file holds none (DEC-124).
const EASTERN = /[\u0660-\u0669]/;

async function show(award: SessionAwardState | null | Error, variant: "section" | "inline" = "section") {
  if (award instanceof Error) vi.mocked(getSessionAwardState).mockRejectedValue(award);
  else vi.mocked(getSessionAwardState).mockResolvedValue(award);
  const tree = (await AwardState({ sessionId: SESSION, locale: "ar", variant })) as ReactElement | null;
  return render(
    <NextIntlClientProvider locale="ar" messages={{}}>
      {tree}
    </NextIntlClientProvider>,
  );
}

const pending = (over: Partial<Extract<SessionAwardState, { state: "pending" }>> = {}): SessionAwardState => ({
  state: "pending",
  points: 10,
  daysAttended: 1,
  daysRequired: 1,
  dayCount: 1,
  ...over,
});

afterEach(() => vi.restoreAllMocks());

describe("AwardState — the four states", () => {
  it("says nothing at all for `none` — a disabled rule is not a message", async () => {
    const { container } = await show({ state: "none" });
    expect(container).toBeEmptyDOMElement();
  });

  it("says nothing when the session is not visible (null)", async () => {
    const { container } = await show(null);
    expect(container).toBeEmptyDOMElement();
  });

  it("pending at one day: the amount and that it arrives at the end, with no days line", async () => {
    const { container } = await show(pending());
    const section = screen.getByRole("region", { name: "نقاط هذه الجلسة" });
    expect(section).toHaveTextContent("10 نقاط بانتظارك");
    expect(section).toHaveTextContent("تُضاف إلى رصيدك عند انتهاء الجلسة.");
    expect(section).not.toHaveTextContent("حضرت");
    expect(container.querySelector("bdi")).toHaveTextContent("10");
    expect(container.querySelector("[data-award-state]")).toHaveAttribute("data-award-state", "pending");
  });

  it("pending on day one of three, all required: days attended of days required, and «if you attend the rest»", async () => {
    await show(pending({ daysAttended: 1, daysRequired: 3, dayCount: 3 }));
    const section = screen.getByRole("region", { name: "نقاط هذه الجلسة" });
    expect(section).toHaveTextContent("حضرت 1 من 3 أيام");
    expect(section).toHaveTextContent("إن حضرت بقية الأيام");
  });

  it("pending with every required day attended says only «when the session ends»", async () => {
    await show(pending({ daysAttended: 3, daysRequired: 3, dayCount: 3 }));
    const section = screen.getByRole("region", { name: "نقاط هذه الجلسة" });
    expect(section).toHaveTextContent("حضرت 3 من 3 أيام");
    expect(section).not.toHaveTextContent("بقية الأيام");
  });

  it("★ a relaxed workshop (one day required of three) reads like a talk — the line follows daysRequired, not dayCount", async () => {
    await show(pending({ daysAttended: 1, daysRequired: 1, dayCount: 3 }));
    const section = screen.getByRole("region", { name: "نقاط هذه الجلسة" });
    expect(section).not.toHaveTextContent("حضرت");
    expect(section).toHaveTextContent("تُضاف إلى رصيدك عند انتهاء الجلسة.");
  });

  it("paid: what was added, and a way to the points history", async () => {
    await show({ state: "paid", points: 10 });
    const section = screen.getByRole("region", { name: "نقاط هذه الجلسة" });
    expect(section).toHaveTextContent("أُضيفت 10 نقاط إلى رصيدك");
    expect(screen.getByRole("link", { name: "سجلّ نقاطك" })).toHaveAttribute("href", expect.stringMatching(/\/app\/me\/points$/));
  });

  it("incomplete names the missed day in contract 7's words, and the rule", async () => {
    await show({ state: "incomplete", missedDays: [{ position: 2, startsAt: "2026-09-24T07:00:00Z" }], daysAttended: 1, daysRequired: 3, dayCount: 3 });
    const section = screen.getByRole("region", { name: "نقاط هذه الجلسة" });
    expect(section).toHaveTextContent("لن تُحتسب نقاط الحضور لهذه الجلسة");
    expect(section).toHaveTextContent("فاتك اليوم الثاني");
    expect(section).toHaveTextContent("نقاط الحضور تتطلّب حضور جميع أيام الجلسة.");
  });

  it("incomplete with two missed days names both, in order, in the plural", async () => {
    await show({
      state: "incomplete",
      missedDays: [
        { position: 1, startsAt: "2026-09-23T07:00:00Z" },
        { position: 3, startsAt: "2026-09-25T07:00:00Z" },
      ],
      daysAttended: 1,
      daysRequired: 3,
      dayCount: 3,
    });
    expect(screen.getByRole("region", { name: "نقاط هذه الجلسة" })).toHaveTextContent("فاتك اليوم الأول، اليوم الثالث");
  });
});

describe("AwardState — the plural forms, and the numerals", () => {
  it.each([
    [1, "نقطة واحدة بانتظارك"],
    [2, "نقطتان بانتظارك"],
    [3, "3 نقاط بانتظارك"],
    [11, "11 نقطة بانتظارك"],
    [100, "100 نقطة بانتظارك"],
  ])("pending %i reads «%s»", async (points, text) => {
    await show(pending({ points }));
    expect(screen.getByRole("region", { name: "نقاط هذه الجلسة" })).toHaveTextContent(text);
  });

  it.each([
    [2, "حضرت 1 من يومين"],
    [11, "حضرت 1 من 11 يومًا"],
  ])("days required %i reads «%s»", async (daysRequired, text) => {
    await show(pending({ daysAttended: 1, daysRequired, dayCount: daysRequired }));
    expect(screen.getByRole("region", { name: "نقاط هذه الجلسة" })).toHaveTextContent(text);
  });

  it("never renders an Eastern Arabic-Indic digit, in any state (DEC-124)", async () => {
    const awards: SessionAwardState[] = [
      pending({ points: 1250, daysAttended: 2, daysRequired: 12, dayCount: 12 }),
      { state: "paid", points: 1250 },
      { state: "incomplete", missedDays: [{ position: 12, startsAt: "2026-10-01T07:00:00Z" }], daysAttended: 11, daysRequired: 12, dayCount: 12 },
    ];
    for (const award of awards) {
      const { container, unmount } = await show(award);
      expect(container.textContent).not.toMatch(EASTERN);
      unmount();
    }
  });
});

describe("AwardState — what it is not", () => {
  it("★ is never a live region: no status, no alert — SCR-014's status line stays the page's only one", async () => {
    const awards: SessionAwardState[] = [pending(), { state: "paid", points: 10 }];
    for (const award of awards) {
      for (const variant of ["section", "inline"] as const) {
        const { unmount } = await show(award, variant);
        expect(screen.queryByRole("status")).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
        unmount();
      }
    }
  });

  it("the inline variant (the event page's card) has no heading and no region of its own (16 §5.4.1a(b))", async () => {
    const { container } = await show(pending(), "inline");
    expect(container.querySelector("h1, h2, h3, section")).toBeNull();
    expect(container).toHaveTextContent("10 نقاط بانتظارك");
  });

  it("★ a failed read renders nothing and logs the session id — the check-in screen never breaks on a points read (DEC-174 Q4)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = await show(new Error("session_award_state: boom"));
    expect(container).toBeEmptyDOMElement();
    expect(log).toHaveBeenCalledTimes(1);
    expect(String(log.mock.calls[0][0])).toContain(SESSION);
  });
});

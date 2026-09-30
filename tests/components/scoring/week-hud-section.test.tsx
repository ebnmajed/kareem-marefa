// The member's week on the phone — `MemberWeekHud` as the SERVER draws it (wave 18, REQ-UIX-055,
// DEC-206 §4.47 – §4.49, DEC-207 §1). ★ Every figure is read; an absence is words; the month is the snapshot's.
import { screen, within } from "@testing-library/react";
import { createTranslator } from "next-intl";
import { beforeEach, describe, expect, it, vi } from "vitest";
import scoring from "@/messages/ar/scoring.json";
import type { MemberWeek } from "@/lib/dal/points";
import { memberWeek, renderIntl } from "./week-fixture";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => createTranslator({ locale: "ar", messages: scoring, namespace: namespace as never }),
}));
vi.mock("@/components/scoring/document-load", () => ({ isDocumentLoad: async () => false }));
vi.mock("@/components/scoring/week-actions", () => ({ acknowledgeWeekPoints: async () => {}, acknowledgeWeekRank: async () => {} }));
let current: MemberWeek;
vi.mock("@/lib/dal/points", () => ({ getMemberWeek: async () => current }));

const { MemberWeekHud } = await import("@/components/scoring/member-week-hud");

async function draw(over: Partial<MemberWeek> = {}) {
  current = memberWeek(over);
  return renderIntl(await MemberWeekHud({ locale: "ar" })).container;
}
const tile = (c: HTMLElement, slot: string) => c.querySelector(`[data-slot=${slot}]`) as HTMLElement | null;

beforeEach(() => {
  current = memberWeek();
});

describe("MemberWeekHud — the figures, read", () => {
  it("the rank is the monthly board's, labelled with the snapshot's month and heard with its total", async () => {
    const c = await draw();
    const rank = tile(c, "rank")!;
    expect(rank.textContent).toContain("ترتيب سبتمبر");
    expect(rank.querySelector("[data-slot=figure]")!.textContent).toBe("#4");
    expect(within(rank).getByText("المرتبة 4 من 212 في سبتمبر")).toHaveClass("sr-only");
    expect(rank).toHaveAttribute("href", expect.stringContaining("/app/leaderboards?board=month"));
  });

  it("the streak is in months, the points the balance, and the level line the next threshold's distance", async () => {
    const c = await draw();
    expect(tile(c, "streak")!.querySelector("[data-slot=figure]")!.textContent).toBe("×7");
    expect(within(tile(c, "streak")!).getByText("سلسلة 7 أشهر متتالية")).toHaveClass("sr-only");
    expect(tile(c, "points")!.querySelector("[data-slot=figure]")!.textContent).toBe("680");
    expect(screen.getByText((_, el) => el?.tagName === "SPAN" && el.textContent === "بقيت 20 نقطة لمستوى كريم معرفة")).toBeInTheDocument();
    expect(c.querySelector<HTMLElement>("[data-slot=level-bar] [data-slot=fill]")!.style.transform).toBe(`scaleX(${680 / 700})`);
  });

  it("★ no digit is Arabic-Indic, anywhere", async () => {
    const c = await draw();
    expect(c.textContent).not.toMatch(/[٠-٩]/);
  });

  it("the last month's final snapshot is named as that month — never today's", async () => {
    const c = await draw({ period: { start: "2026-08-01", end: "2026-09-01", isFinal: true, takenAt: "2026-09-01T00:06:00Z", daysLeft: null } });
    expect(tile(c, "rank")!.textContent).toContain("ترتيب أغسطس");
  });
});

describe("MemberWeekHud — ★ absences and the states nobody drew", () => {
  it("no points this month: «لا ترتيب بعد», still a link to the board, and no «#0»", async () => {
    const c = await draw({ rank: null, rankAbsence: "no_points" });
    const rank = tile(c, "rank")!;
    expect(within(rank).getByText("لا ترتيب بعد")).toBeVisible();
    expect(rank.textContent).not.toMatch(/#/);
    expect(rank.tagName).toBe("A");
  });

  it("no snapshot yet: «يُحسب الليلة», with no month named", async () => {
    const c = await draw({ period: null, rank: null, rankAbsence: "no_snapshot" });
    expect(within(tile(c, "rank")!).getByText("يُحسب الليلة")).toBeVisible();
    expect(tile(c, "rank")!.textContent).toContain("ترتيبك");
  });

  it("★ opted out: their own rank, and the words that it is hidden from everyone else (REQ-LDR-008)", async () => {
    const c = await draw({ optedOut: true });
    expect(tile(c, "rank")!.textContent).toContain("مخفيّ عن غيرك");
    expect(tile(c, "rank")!.querySelector("[data-slot=figure]")!.textContent).toBe("#4");
  });

  it("streaks off: no streak tile; streaks on and none running: words, never «×0»", async () => {
    expect(tile(await draw({ streak: null }), "streak")).toBeNull();
    const c = await draw({ streak: { months: 0, requiredPerMonth: 3 } });
    expect(within(tile(c, "streak")!).getByText("لم تبدأ بعد")).toBeVisible();
    expect(c.textContent).not.toContain("×0");
  });

  it("the top level: a full bar and «بلغت أعلى مستوى»; no level yet: the line alone", async () => {
    let c = await draw({ next: null, progress: { value: 1, max: 1 } });
    expect(screen.getByText("بلغت أعلى مستوى")).toBeInTheDocument();
    expect(c.querySelector<HTMLElement>("[data-slot=fill]")!.style.transform).toBe("scaleX(1)");
    c = await draw({ level: null, next: null, progress: null });
    expect(c.querySelector("[data-slot=level-bar]")).toBeNull();
    expect(screen.getAllByText("يُحدَّد مستواك في التقييم الليلي القادم.").length).toBeGreaterThan(0);
  });

  it("a balance of zero is drawn as the figure it is", async () => {
    const c = await draw({ points: 0 });
    expect(tile(c, "points")!.querySelector("[data-slot=figure]")!.textContent).toBe("0");
  });
});

describe("MemberWeekHud — the static states of moments 3 and 5", () => {
  it("moment 3's occurrence: «+N» beside the new balance, left to right, with its words", async () => {
    const c = await draw({ completion: { occurrenceId: "e2", from: 660, to: 680, delta: 20, fromProgress: 660 / 700 } });
    const delta = tile(c, "delta")!;
    expect(delta.querySelector("bdi[dir=ltr]")!.textContent).toBe("+20");
    expect(within(delta).getByText("20 نقطة جديدة منذ زيارتك الأخيرة")).toHaveClass("sr-only");
  });

  it("moment 5's rise: the arrow and its words, shown; a fall draws nothing", async () => {
    const risen = await draw({
      rankMoment: { occurrenceId: "monthly:2026-09-01:7-4", seenRank: 7, seenFraction: null, needsMark: true, mark: { board: "monthly", period: "2026-09-01", rank: 4, companyId: null, fraction: null } },
    });
    expect(within(tile(risen, "rise")!).getByText("تقدّمت 3 مراكز منذ زيارتك الأخيرة")).toHaveClass("sr-only");
    const fell = await draw();
    expect(tile(fell, "rise")).toBeNull();
  });
});

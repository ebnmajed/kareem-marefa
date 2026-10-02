// The hub's standing — contract 3 (wave 20, REQ-UIX-070, DEC-216 §5.10, DEC-218 §3.5, §3.7), as the SERVER draws it.
//
// ★ Every figure is read; an absence is words; a photograph only from our own copy.
// ★★ On `/app/me` both forms are in the document at every width: the copy that is not displayed plays nothing and
//    writes no mark; the displayed one plays moment 3 once and acknowledges once; mount, play, unmount, mount
//    again — silence.
// ★ The band's name is text, never a heading: the page's `h1` is the heading at every width (DEC-218 §3.5).
import { act, render, within } from "@testing-library/react";
import { createTranslator, NextIntlClientProvider } from "next-intl";
import type { ReactElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import scoring from "@/messages/ar/scoring.json";
import type { HubStanding as HubStandingData } from "@/lib/dal/points";
import { resetPaintedForTests } from "@/components/scoring/use-seen-moment";
import { isMomentClaimed, momentKey, resetMomentsForTests } from "@/lib/ui/moment";
import { fakeAnimate, removeFakeAnimate, setDurationTokens, setReducedMotion, type FakeAnimation } from "../lib-ui/motion-env";

vi.mock("@/lib/fonts", () => ({ balooBhaijaan: { variable: "font-baloo-variable" } }));
vi.mock("server-only", () => ({}));
vi.mock("next-intl/server", () => ({
  getTranslations: async (namespace?: string) => createTranslator({ locale: "ar", messages: scoring, namespace: namespace as never }),
}));
vi.mock("@/components/scoring/document-load", () => ({ isDocumentLoad: async () => false }));
const ackPoints = vi.fn(async () => {});
const ackRank = vi.fn(async () => {});
vi.mock("@/components/scoring/week-actions", () => ({
  acknowledgeWeekPoints: (...args: unknown[]) => ackPoints(...(args as [])),
  acknowledgeWeekRank: (...args: unknown[]) => ackRank(...(args as [])),
}));
let currentPath = "/ar/app/me";
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), usePathname: () => currentPath }));
let current: HubStandingData;
vi.mock("@/lib/dal/points", () => ({ getHubStanding: async () => current }));

const { HubStanding, HubStandingSkeleton } = await import("@/components/hub/standing");

function standing(over: Partial<HubStandingData> = {}): HubStandingData {
  return {
    member: {
      id: "00000000-0000-4000-8000-0000000000aa",
      displayName: "يمان",
      avatarUrl: null,
      jobTitle: "أمين السر التنفيذي",
      company: { name: "صنف", teamColor: "#ff9a2e" },
      memberSince: "2026-08-10T09:00:00Z",
    },
    points: 730,
    level: { name: "كريم معرفة", tier: 4 },
    next: { name: "سفير المعرفة", threshold: 2000, remaining: 1270 },
    progress: { value: 730, max: 2000 },
    week: {
      window: { start: "2026-09-26", end: "2026-10-02", daysLeft: 0, timeZone: "Asia/Riyadh" },
      rank: { rank: 4, points: 130, ranked: 38, above: null },
      absence: null,
      optedOut: false,
      moment: { occurrenceId: null, seenRank: null, seenFraction: null, needsMark: false, mark: { board: "weekly", period: "2026-09-26", rank: 4, companyId: null, fraction: null } },
    },
    streak: { months: 8 },
    badges: 6,
    completion: null,
    levelUpPending: false,
    pointsMark: { entryId: "e-730", total: 730, levelId: "l4" },
    pointsNeedsMark: false,
    ...over,
  };
}

function intl(ui: ReactElement) {
  return (
    <NextIntlClientProvider locale="ar" messages={{}}>
      {ui}
    </NextIntlClientProvider>
  );
}

async function draw(form: "card" | "band", over: Partial<HubStandingData> = {}) {
  current = standing(over);
  return render(intl(await HubStanding({ locale: "ar", form }))).container;
}

let made: FakeAnimation[];
let frames: FrameRequestCallback[];
let now: number;
async function finishAll() {
  const step = (ms: number) => {
    now += ms;
    const due = frames;
    frames = [];
    for (const f of due) f(now);
  };
  await act(async () => {
    step(0);
    step(2000);
    for (const a of made) a.finish();
    await Promise.resolve();
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  resetMomentsForTests();
  resetPaintedForTests();
  setReducedMotion(false);
  setDurationTokens({ fast: "120ms", base: "220ms", slow: "420ms", party: "900ms" });
  frames = [];
  now = 0;
  vi.stubGlobal("requestAnimationFrame", (f: FrameRequestCallback) => frames.push(f));
  vi.stubGlobal("cancelAnimationFrame", () => {});
  made = fakeAnimate();
  // jsdom lays nothing out: an element is «displayed» unless it sits inside `[data-hidden-copy]`.
  Object.defineProperty(HTMLElement.prototype, "offsetParent", {
    configurable: true,
    get(this: HTMLElement) {
      return this.closest("[data-hidden-copy]") ? null : document.body;
    },
  });
  ackPoints.mockClear();
  ackRank.mockClear();
  currentPath = "/ar/app/me";
});
afterEach(() => {
  vi.unstubAllGlobals();
  removeFakeAnimate();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (HTMLElement.prototype as any).offsetParent;
});

describe("the card — every figure read", () => {
  it("the member, the level and the way to the next, and the three figures", async () => {
    const c = await draw("card");
    const card = within(c.querySelector("[data-form=card]") as HTMLElement);
    expect(card.getByText("يمان").tagName).toBe("BDI");
    expect(card.getByText("كريم معرفة").tagName).toBe("BDI");
    expect(c.textContent).toContain("730");
    expect(c.textContent).toContain("«سفير المعرفة» بعد 1,270");
    expect(card.getByRole("link", { name: /هذا الأسبوع/ })).toHaveAttribute("href", expect.stringContaining("/app/leaderboards"));
    expect(c.querySelector("[data-slot=rank]")!.textContent).toBe("#4");
    expect(card.getByText("المرتبة 4 من 38 هذا الأسبوع")).toHaveClass("sr-only");
    expect(c.textContent).toContain("×8");
    expect(c.textContent).toContain("6");
    expect(card.getByRole("link", { name: "هكذا يراك زملاؤك" })).toHaveAttribute("href", expect.stringContaining("/app/members/00000000-0000-4000-8000-0000000000aa"));
    expect(c.textContent).not.toMatch(/[٠-٩]/);
  });

  it("★ an absence is words, never a zero: no rank this week, no streak running, no level yet", async () => {
    const c = await draw("card", {
      week: { ...standing().week, rank: null, absence: "no_points" },
      streak: { months: 0 },
      level: null,
      next: null,
      progress: null,
    });
    expect(c.textContent).toContain("لا ترتيب بعد");
    expect(c.textContent).toContain("لم تبدأ بعد");
    expect(c.textContent).toContain("يُحدَّد مستواك في التقييم الليلي القادم.");
    expect(c.querySelector("[data-slot=rank]")).toBeNull();
  });

  it("★ no level yet: the balance is still drawn, and moment 3's «+N» still has its place — in both forms", async () => {
    for (const form of ["card", "band"] as const) {
      const c = await draw(form, { level: null, next: null, progress: null, completion: { occurrenceId: "e-120", from: 0, to: 120, delta: 120, fromProgress: 0 }, points: 120 });
      expect(c.textContent).toContain("120");
      await act(async () => {
        await Promise.resolve();
      });
      expect(c.querySelector("[data-slot=delta] bdi")!.textContent).toBe("+120");
    }
  });

  it("★ «· company» never breaks after the dot: a no-break space glues the separator to the company", async () => {
    for (const form of ["card", "band"] as const) {
      const c = await draw(form);
      expect(c.textContent).toContain("أمين السر التنفيذي \u00B7\u00A0صنف");
    }
  });

  it("no streak rule: the tile is not drawn", async () => {
    const c = await draw("card", { streak: null });
    expect(c.textContent).not.toContain("السلسلة");
  });

  it("an opted-out member sees their own rank, labelled hidden from others (REQ-LDR-008)", async () => {
    const c = await draw("card", { week: { ...standing().week, optedOut: true } });
    expect(c.textContent).toContain("هذا الأسبوع · مخفيّ عن غيرك");
    expect(c.querySelector("[data-slot=rank]")!.textContent).toBe("#4");
  });

  it("★ initials unless our own copy exists — never another origin (DEC-099)", async () => {
    expect((await draw("card")).querySelector("img")).toBeNull();
  });
});

describe("the band", () => {
  it("★ draws the name as text, never a heading, and says since when", async () => {
    const c = await draw("band");
    expect(c.querySelector("h1, h2, h3")).toBeNull();
    expect(c.textContent).toContain("عضو منذ أغسطس 2026");
    expect(c.textContent).toContain("730 نقطة · «سفير المعرفة» بعد 1,270");
  });
});

describe("★★ moments 3 and 5 — the displayed copy alone", () => {
  const withCompletion = () => ({ completion: { occurrenceId: "e-730", from: 680, to: 730, delta: 50, fromProgress: 680 / 2000 }, pointsNeedsMark: true });

  it("both forms in the document: the hidden one claims nothing and writes nothing; the displayed one plays and acknowledges once", async () => {
    current = standing(withCompletion());
    const card = await HubStanding({ locale: "ar", form: "card" });
    const band = await HubStanding({ locale: "ar", form: "band" });
    render(
      intl(
        <>
          <div data-hidden-copy="">{card}</div>
          {band}
        </>,
      ),
    );
    expect(made.length).toBeGreaterThan(0);
    for (const a of made) expect(a.el.closest("[data-hidden-copy]")).toBeNull();
    await finishAll();
    expect(ackPoints).toHaveBeenCalledTimes(1);
    expect(ackRank).not.toHaveBeenCalled();
  });

  it("★ the hidden copy renders NO «+N» node at all — not a hidden one — and the displayed copy animates its own", async () => {
    current = standing(withCompletion());
    const card = await HubStanding({ locale: "ar", form: "card" });
    const band = await HubStanding({ locale: "ar", form: "band" });
    const { container } = render(
      intl(
        <>
          <div data-hidden-copy="">{card}</div>
          {band}
        </>,
      ),
    );
    await act(async () => {
      await Promise.resolve();
    });
    expect(container.querySelector("[data-hidden-copy] [data-slot=delta]")).toBeNull();
    expect(container.querySelectorAll("[data-slot=delta]")).toHaveLength(1);
    expect(made.some((a) => a.el.getAttribute("data-slot") === "delta")).toBe(true);
  });

  it("★★ on /app/me/points the band yields moment 3 to the page's own head: its static «+N», no claim, no acknowledgement", async () => {
    currentPath = "/ar/app/me/points";
    current = standing(withCompletion());
    const { container } = render(intl(await HubStanding({ locale: "ar", form: "band" })));
    await finishAll();
    expect(made.filter((a) => a.el.getAttribute("data-slot") === "delta")).toHaveLength(0);
    expect(ackPoints).not.toHaveBeenCalled();
    expect(container.querySelector("[data-slot=delta] bdi")!.textContent).toBe("+50");
    expect(isMomentClaimed(momentKey("completion", "e-730"))).toBe(false);
  });

  it("the hidden form alone plays nothing and writes nothing", async () => {
    current = standing(withCompletion());
    const card = await HubStanding({ locale: "ar", form: "card" });
    render(intl(<div data-hidden-copy="">{card}</div>));
    await finishAll();
    expect(made).toHaveLength(0);
    expect(ackPoints).not.toHaveBeenCalled();
  });

  it("★★ mount, play, unmount, mount again — silence", async () => {
    current = standing(withCompletion());
    const first = render(intl(await HubStanding({ locale: "ar", form: "card" })));
    expect(made.length).toBeGreaterThan(0);
    await finishAll();
    first.unmount();
    made.length = 0;
    render(intl(await HubStanding({ locale: "ar", form: "card" })));
    expect(made).toHaveLength(0);
  });

  it("with no rise on the week, the card writes no weekly mark", async () => {
    await draw("card");
    await finishAll();
    expect(ackRank).not.toHaveBeenCalled();
  });

  it("the delta of moment 3's static state is drawn, signed left to right", async () => {
    setReducedMotion(true);
    const c = await draw("card", withCompletion());
    const delta = c.querySelector("[data-slot=delta] bdi")!;
    expect(delta.getAttribute("dir")).toBe("ltr");
    expect(delta.textContent).toBe("+50");
    expect(made).toHaveLength(0);
  });
});

describe("the skeleton", () => {
  it.each(["card", "band"] as const)("%s: aria-hidden, no text", (form) => {
    const { container } = render(<HubStandingSkeleton form={form} />);
    expect(container.firstElementChild).toHaveAttribute("aria-hidden", "true");
    expect(container.textContent).toBe("");
  });
});

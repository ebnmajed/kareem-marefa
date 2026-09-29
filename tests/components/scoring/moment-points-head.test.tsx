// Moments 3 and 4 on the head of SCR-022 (wave 16, REQ-UIX-047, REQ-UIX-044, DEC-195 §2.7, DEC-197).
//
// ★★ Mount, play, unmount, mount again with the same occurrence — silence.
// ★★ Under reduced motion the static state is COMPLETE, and nothing animates.
// ★ No occurrence — a decrease, a gain with no completion row, a later visit — nothing moves.
// ★ Transform and opacity only, durations from the tokens, no `will-change` left, and the
//   server told what was seen only once the moment is done — or never, on a server paint.
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MomentPointsHead, type MomentPointsHeadProps } from "@/components/scoring/moment-points-head";
import { LevelCard } from "@/components/ui/level-card";
import { ProgressBar } from "@/components/ui/progress-bar";
import { isMomentClaimed, momentKey, resetMomentsForTests } from "@/lib/ui/moment";
import { paintedInDocument, resetPaintedForTests } from "@/components/scoring/use-seen-moment";
import { fakeAnimate, removeFakeAnimate, setDurationTokens, setReducedMotion, type FakeAnimation } from "../lib-ui/motion-env";

let frames: FrameRequestCallback[];
let now: number;
function step(ms: number) {
  now += ms;
  const due = frames;
  frames = [];
  for (const f of due) f(now);
}

const HELD = { tier: 3, name: "صاحب أثر", caption: "مستواك الحالي", unlocks: [] as string[] };
const REACHED = { tier: 4, name: "كريم معرفة", caption: "مستوى جديد", unlocks: [] as string[] };

function props(over: Partial<MomentPointsHeadProps> = {}): MomentPointsHeadProps {
  return {
    heading: "رصيدك ومستواك",
    balanceLabel: "رصيدك",
    total: 730,
    completion: { occurrenceId: "e-730", from: 680, fromProgress: 0.95 },
    delta: <>+50</>,
    deltaLabel: "50 نقطة جديدة منذ زيارتك الأخيرة",
    levelUp: null,
    streak: (
      <div>
        <span data-slot="flame">
          <span className="moment-flicker">
            <svg aria-hidden="true" />
          </span>
        </span>
        <p>سلسلة 7 أشهر متتالية</p>
      </div>
    ),
    bar: (
      <div data-slot="level-bar">
        <ProgressBar value={30} max={800} decorative />
        <p>730 من 1500 نقطة نحو سفير المعرفة</p>
      </div>
    ),
    card: <LevelCard level={{ ...REACHED, caption: "مستواك الحالي" }} unlocksLabel="يفتح لك" noUnlocksLabel="لا يفتح هذا المستوى امتيازًا بعد" />,
    needsMark: true,
    acknowledge: vi.fn(async () => {}),
    ...over,
  };
}

const withLevelUp = (over: Partial<MomentPointsHeadProps> = {}) =>
  props({
    levelUp: { occurrenceId: "lvl-4" },
    card: <LevelCard flip level={HELD} reached={REACHED} shown="reached" unlocksLabel="يفتح لك" noUnlocksLabel="لا يفتح هذا المستوى امتيازًا بعد" />,
    ...over,
  });

let made: FakeAnimation[];
const moment = () => document.querySelector("[data-moment]")!.getAttribute("data-moment");
const balance = () => screen.getByText((_, el) => el?.tagName === "STRONG").textContent;

async function finishAll() {
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
});
afterEach(() => {
  vi.unstubAllGlobals();
  removeFakeAnimate();
});

describe("moment 3 — انتهت الجلسة", () => {
  it("plays: the balance counts from the old figure, the delta fades in, the flame grows, the bar fills — in that order", () => {
    render(<MomentPointsHead {...props()} />);
    expect(moment()).toBe("playing");
    expect(balance()).toBe("680");
    const [delta, flame, bar] = made;
    expect(delta.el.getAttribute("data-slot")).toBe("delta");
    expect(delta.options).toMatchObject({ duration: 220, fill: "backwards" });
    expect(flame.el.getAttribute("data-slot")).toBe("flame");
    expect(flame.options).toMatchObject({ duration: 420, delay: 900, fill: "backwards" });
    expect(bar.el.getAttribute("data-slot")).toBe("fill");
    expect(bar.keyframes).toEqual([{ transform: "scaleX(0.95)" }, { transform: `scaleX(${30 / 800})` }]);
    expect(bar.options).toMatchObject({ duration: 900, delay: 1320, fill: "backwards" });
  });

  it("★ touches transform and opacity only, with token durations, and sets no will-change", () => {
    render(<MomentPointsHead {...withLevelUp()} />);
    for (const a of made) {
      for (const frame of a.keyframes) for (const prop of Object.keys(frame)) expect(["transform", "opacity", "offset", "easing"]).toContain(prop);
      expect([120, 220, 420, 900]).toContain(a.options.duration);
    }
    for (const el of document.querySelectorAll<HTMLElement>("*")) expect(el.style.willChange).toBe("");
  });

  it("★★ mount, play, unmount, mount again with the same occurrence — silence", async () => {
    const first = render(<MomentPointsHead {...props()} />);
    expect(moment()).toBe("playing");
    await finishAll();
    first.unmount();
    const before = made.length;
    render(<MomentPointsHead {...props()} />);
    expect(moment()).toBe("static");
    expect(made.length).toBe(before);
    expect(balance()).toBe("730");
    expect(frames).toHaveLength(0);
  });

  it("★ the server is told only when the moment is done, with nothing of the client's own", async () => {
    const acknowledge = vi.fn(async () => {});
    render(<MomentPointsHead {...props({ acknowledge })} />);
    expect(acknowledge).not.toHaveBeenCalled();
    await finishAll();
    expect(acknowledge).toHaveBeenCalledTimes(1);
    expect(acknowledge).toHaveBeenCalledWith();
    expect(moment()).toBe("static");
    expect(balance()).toBe("730");
  });

  it("★ no occurrence — a decrease, a gain with no completion row, a later visit — nothing moves, and the mark is recorded", () => {
    const acknowledge = vi.fn(async () => {});
    render(<MomentPointsHead {...props({ completion: null, delta: null, deltaLabel: null, acknowledge })} />);
    expect(moment()).toBe("static");
    expect(made).toHaveLength(0);
    expect(balance()).toBe("730");
    expect(screen.queryByText("+50")).toBeNull();
    expect(acknowledge).toHaveBeenCalledTimes(1);
  });

  it("with nothing to record, nothing is sent", () => {
    const acknowledge = vi.fn(async () => {});
    render(<MomentPointsHead {...props({ completion: null, delta: null, deltaLabel: null, needsMark: false, acknowledge })} />);
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it("★ a failed acknowledgement animates nothing and throws nothing", async () => {
    const acknowledge = vi.fn(async () => {
      throw new Error("offline");
    });
    render(<MomentPointsHead {...props({ acknowledge })} />);
    await finishAll();
    const after = made.length;
    await act(async () => {});
    expect(made.length).toBe(after);
    expect(moment()).toBe("static");
  });
});

describe("moment 3 — the static state under reduced motion", () => {
  it("★★ is complete: the new balance, the delta and its words, the flame, the bar at its truth, the card — and nothing animates", () => {
    setReducedMotion(true);
    const acknowledge = vi.fn(async () => {});
    render(<MomentPointsHead {...props({ acknowledge })} />);
    expect(moment()).toBe("static");
    expect(made).toHaveLength(0);
    expect(frames).toHaveLength(0);
    expect(balance()).toBe("730");
    expect(screen.getByText("+50")).toBeInTheDocument();
    expect(screen.getByText("50 نقطة جديدة منذ زيارتك الأخيرة")).toHaveClass("sr-only");
    // The flame is drawn; its flicker class is inert under reduced motion by the stylesheet (contract 2).
    expect(document.querySelector("[data-slot=flame] .moment-flicker svg")).not.toBeNull();
    expect((document.querySelector("[data-slot=fill]") as HTMLElement).style.transform).toBe(`scaleX(${30 / 800})`);
    expect(screen.getByText("730 من 1500 نقطة نحو سفير المعرفة")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "مستواك الحالي" })).toHaveTextContent("كريم معرفة");
    // Seen statically is seen: claimed, and the server told.
    expect(isMomentClaimed(momentKey("completion", "e-730"))).toBe(true);
    expect(acknowledge).toHaveBeenCalledTimes(1);
  });
});

describe("moment 4 — ترقية المستوى", () => {
  it("after moment 3, the card turns over and one shine sweeps its new face; the bar is held full until the turn ends", async () => {
    render(<MomentPointsHead {...withLevelUp()} />);
    const bar = made.find((a) => a.el.getAttribute("data-slot") === "fill")!;
    expect(bar.keyframes.at(-1)).toEqual({ transform: "scaleX(1)" });
    expect(bar.options.fill).toBe("both");
    const turn = made.find((a) => a.el.getAttribute("data-slot") === "flip-inner")!;
    expect(turn.keyframes).toEqual([{ transform: "rotateY(0deg)" }, { transform: "rotateY(180deg)" }]);
    expect(turn.options).toMatchObject({ duration: 900, delay: 900 + 420 + 900, fill: "backwards" });
    const shine = document.querySelector<HTMLElement>("[data-slot=shine]")!;
    expect(shine.className).toContain("moment-shine");
    expect(shine.style.animationDelay).toBe(`${2220 + 540}ms`);
    await finishAll();
    // The turn ended: the bar's hold is released, and the fill is the new level's true progress again.
    expect(bar.cancelled).toBe(true);
  });

  it("plays alone on the first visit after the nightly evaluation (D-29)", () => {
    render(<MomentPointsHead {...withLevelUp({ completion: null, delta: null, deltaLabel: null })} />);
    const turn = made.find((a) => a.el.getAttribute("data-slot") === "flip-inner")!;
    expect(turn.options.delay).toBe(0);
    expect(made.filter((a) => a.el.getAttribute("data-slot") !== "flip-inner")).toHaveLength(0);
  });

  it("★★ mount, play, unmount, mount again — silence", async () => {
    const first = render(<MomentPointsHead {...withLevelUp({ completion: null, delta: null, deltaLabel: null })} />);
    await finishAll();
    first.unmount();
    const before = made.length;
    render(<MomentPointsHead {...withLevelUp({ completion: null, delta: null, deltaLabel: null })} />);
    expect(made.length).toBe(before);
    expect(moment()).toBe("static");
    expect(document.querySelector("[data-slot=shine]")!.className).not.toContain("moment-shine");
  });

  it("★★ the static state under reduced motion: the new face shown, both faces readable, no shine", () => {
    setReducedMotion(true);
    render(<MomentPointsHead {...withLevelUp()} />);
    expect(made).toHaveLength(0);
    expect(document.querySelector("[data-slot=flip-inner]")).toHaveClass("rotate-y-180");
    expect(screen.getAllByRole("group")).toHaveLength(2);
    expect(screen.getByRole("group", { name: "مستوى جديد" })).toHaveTextContent("كريم معرفة");
    expect(document.querySelector("[data-slot=shine]")!.className).not.toContain("moment-shine");
  });
});

describe("a page the server painted (DEC-197 §5)", () => {
  it("★ stays static, leaves the occurrence unseen, and tells the server nothing", async () => {
    const { renderToString } = await import("react-dom/server");
    const { hydrateRoot } = await import("react-dom/client");
    const acknowledge = vi.fn(async () => {});
    const tree = <MomentPointsHead {...props({ acknowledge })} />;
    const host = document.createElement("div");
    host.innerHTML = renderToString(tree);
    document.body.appendChild(host);
    let root!: import("react-dom/client").Root;
    await act(async () => {
      root = hydrateRoot(host, tree);
    });
    expect(host.querySelector("[data-moment]")!.getAttribute("data-moment")).toBe("static");
    expect(host.querySelector("strong")!.textContent).toBe("730");
    expect(made).toHaveLength(0);
    expect(isMomentClaimed(momentKey("completion", "e-730"))).toBe(false);
    expect(acknowledge).not.toHaveBeenCalled();
    await act(async () => root.unmount());
    host.remove();
  });

  // ★ The gate at a9bd97df, desktop: `/app` streams behind `loading.tsx`, and when React throws a boundary's server
  // HTML away and renders it afresh, the fresh mount is a CLIENT mount over a truth already on screen.
  it("★ a client mount over the server's visible paint of the same occurrence stays static, unclaimed, untold", () => {
    const painted = document.createElement("div");
    painted.setAttribute("data-moment-keys", "completion:e-730");
    document.body.appendChild(painted);
    const acknowledge = vi.fn(async () => {});
    render(<MomentPointsHead {...props({ acknowledge })} />);
    painted.remove();
    expect(moment()).toBe("static");
    expect(made).toHaveLength(0);
    expect(frames).toHaveLength(0);
    expect(balance()).toBe("730");
    expect(isMomentClaimed(momentKey("completion", "e-730"))).toBe(false);
    expect(acknowledge).not.toHaveBeenCalled();
  });

  it("★ React may delete the server's DOM BEFORE the fresh render: what the page's first moment render saw still counts — until that instance leaves", () => {
    // The page's first moment render: the hydration attempt, with the server's DOM in the document.
    const server = document.createElement("div");
    server.setAttribute("data-moment-keys", "completion:e-730");
    document.body.appendChild(server);
    // (The attempt itself never commits, so it is its first-render read that is simulated here.)
    expect(paintedInDocument("completion:e-730")).toBe(true);
    const acknowledge = vi.fn(async () => {});
    // …then React discards the server's DOM, and the boundary renders afresh with nothing painted in the document.
    server.remove();
    const fresh = render(<MomentPointsHead {...props({ acknowledge })} />);
    expect(moment()).toBe("static");
    expect(made).toHaveLength(0);
    expect(isMomentClaimed(momentKey("completion", "e-730"))).toBe(false);
    expect(acknowledge).not.toHaveBeenCalled();
    // The member navigates away and comes back in the app: a first sight, and it plays.
    fresh.unmount();
    render(<MomentPointsHead {...props({ acknowledge })} />);
    expect(moment()).toBe("playing");
  });

  // ★★ The lead's cold-phone gate at 751618c5: on a slow hydration React can discard the boundary and render it
  // afresh without the page ever showing a moment render the server's DOM — no probe of the document is reliable.
  // So the SERVER says «this render was for the document» (`isDocumentLoad()`), and that is the rule.
  it("★★ rendered for the document — a hard load — it never plays on that page load, whatever path the mount took", () => {
    const acknowledge = vi.fn(async () => {});
    // An empty document: nothing for a probe to find. A client mount, not a hydration.
    const first = render(<MomentPointsHead {...withLevelUp({ acknowledge, documentLoad: true })} />);
    expect(moment()).toBe("static");
    expect(made).toHaveLength(0);
    expect(frames).toHaveLength(0);
    expect(balance()).toBe("730");
    expect(isMomentClaimed(momentKey("completion", "e-730"))).toBe(false);
    expect(isMomentClaimed(momentKey("level", "lvl-4"))).toBe(false);
    expect(acknowledge).not.toHaveBeenCalled();
    // The same page's props arriving again (a re-render) do not change what this mount decided.
    first.rerender(<MomentPointsHead {...withLevelUp({ acknowledge, documentLoad: false })} />);
    expect(made).toHaveLength(0);
    first.unmount();
    // The next arrival by the app's own navigation is rendered for the router, not the document: it plays.
    render(<MomentPointsHead {...withLevelUp({ acknowledge, documentLoad: false })} />);
    expect(moment()).toBe("playing");
  });

  it("a HIDDEN copy — the orphaned streaming segment (DEC-145) — is not a paint: the in-app arrival plays", () => {
    const orphan = document.createElement("div");
    orphan.hidden = true;
    orphan.innerHTML = '<div data-moment-keys="completion:e-730"></div>';
    document.body.appendChild(orphan);
    render(<MomentPointsHead {...props()} />);
    orphan.remove();
    expect(moment()).toBe("playing");
  });
});

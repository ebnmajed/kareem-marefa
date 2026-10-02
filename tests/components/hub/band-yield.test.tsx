// The band yields moment 3 to SCR-022's head — and the head then plays and WRITES the points mark (wave 20, PR B gate,
// desktop; DEC-195 «once per occurrence»). The gate's finding: on desktop the band, mounted on `/app/me` by a hard load,
// stays in the layout across the in-app step to `/app/me/points`, and its root still advertised the completion's key in
// `data-moment-keys` — so the head read the occurrence as «painted by the server» and neither played nor acknowledged,
// and a desktop member would see «+N» on every visit. ★ At lg on `/app/me/points`, exactly ONE acknowledgement of the
// points mark is sent, by the head.
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PointsHeadGate } from "@/components/scoring/points-head-gate";
import { WeekFigure } from "@/components/scoring/moment-week";
import { resetPaintedForTests } from "@/components/scoring/use-seen-moment";
import { resetMomentsForTests } from "@/lib/ui/moment";
import { fakeAnimate, removeFakeAnimate, setDurationTokens, setReducedMotion, type FakeAnimation } from "../lib-ui/motion-env";

let currentPath = "/ar/app/me";
vi.mock("next/navigation", async (importOriginal) => ({ ...(await importOriginal<typeof import("next/navigation")>()), usePathname: () => currentPath }));

const { BandMoments } = await import("@/components/hub/band-moments");

const OCC = "e-150";
let made: FakeAnimation[];
let frames: FrameRequestCallback[];
let now = 0;

async function finishAll() {
  const step = (ms: number) => {
    now += ms;
    const due = frames;
    frames = [];
    for (const f of due) f(now);
  };
  for (let i = 0; i < 3; i += 1) {
    await act(async () => {
      step(0);
      step(2000);
      for (const a of made) a.finish();
      await Promise.resolve();
    });
  }
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
  Object.defineProperty(HTMLElement.prototype, "offsetParent", { configurable: true, get: () => document.body });
  currentPath = "/ar/app/me";
});
afterEach(() => {
  vi.unstubAllGlobals();
  removeFakeAnimate();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (HTMLElement.prototype as any).offsetParent;
});

function band(ack: () => Promise<void>) {
  return (
    <BandMoments
      completion={{ occurrenceId: OCC, from: 120, to: 150, fromProgress: 0.4, moveBar: true }}
      rank={null}
      pointsNeedsMark
      rankNeedsMark={false}
      acknowledgePoints={ack}
      acknowledgeRank={null}
      documentLoad
    >
      <section data-form="band">
        <WeekFigure slot="points" text="150" />
        <span data-slot="delta">+30</span>
      </section>
    </BandMoments>
  );
}

function head(ack: () => Promise<void>) {
  return (
    <PointsHeadGate
      heading="رصيدك ومستواك"
      balanceLabel="رصيدك"
      total={150}
      completion={{ occurrenceId: OCC, from: 120, fromProgress: 0.4 }}
      delta="+30"
      deltaLabel="30 نقطة جديدة"
      levelUp={null}
      streak={null}
      bar={null}
      card={null}
      needsMark
      acknowledge={ack}
      documentLoad={false}
      layout="row"
    />
  );
}

describe("★★ desktop /app/me/points: the band yields, the head plays and acknowledges — once", () => {
  it("a hard load of /app/me, then the app's own step to /app/me/points: exactly one points acknowledgement, the head's", async () => {
    const bandAck = vi.fn(async () => {});
    const headAck = vi.fn(async () => {});
    // The hard load of /app/me: the band is the server's paint — static, unclaimed, untold.
    const view = render(<>{band(bandAck)}</>);
    await finishAll();
    expect(bandAck).not.toHaveBeenCalled();

    // The in-app step: the layout (and the band) persists; the page brings the head.
    currentPath = "/ar/app/me/points";
    view.rerender(
      <>
        {band(bandAck)}
        {head(headAck)}
      </>,
    );
    await finishAll();
    expect(headAck).toHaveBeenCalledTimes(1);
    expect(bandAck).not.toHaveBeenCalled();
    expect(made.filter((a) => a.el.getAttribute("data-slot") === "delta" && !a.el.closest("[data-form=band]")).length).toBeGreaterThan(0);
  });

  it("★ and back to /app/me in-app: the band neither replays the occurrence nor writes its older mark over the head's", async () => {
    const bandAck = vi.fn(async () => {});
    const headAck = vi.fn(async () => {});
    const view = render(<>{band(bandAck)}</>);
    await finishAll();
    currentPath = "/ar/app/me/points";
    view.rerender(
      <>
        {band(bandAck)}
        {head(headAck)}
      </>,
    );
    await finishAll();
    currentPath = "/ar/app/me";
    const before = made.length;
    view.rerender(<>{band(bandAck)}</>);
    await finishAll();
    expect(bandAck).not.toHaveBeenCalled();
    expect(made.slice(before).filter((a) => a.el.getAttribute("data-slot") === "delta")).toHaveLength(0);
  });
});

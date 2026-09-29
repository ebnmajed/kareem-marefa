import { readDuration, readEasing } from "./duration";
import { prefersReducedMotion } from "./reduced-motion";

// Confetti — moment 2's burst (03-motion.md §2, REQ-UIX-044, DEC-195 §2.3).
//
// `element.animate()` and nothing else: no motion library (REQ-UIX-018), and
// each particle touches transform and opacity only (REQ-UIX-020). The layer is
// decoration — `aria-hidden`, no pointer events — and every node is removed
// when its animation finishes, so a burst leaves nothing behind. No
// `will-change` is set: the Web Animations API promotes what it animates for
// as long as it runs, and a hint left on would outlive it.
//
// ★ Under reduced motion it returns at once and touches no DOM: the moment's
// static state — the coin at rest and its three lines — is the experience.
//
// ★ Colours: the member's team colour with lime and bone (03-motion.md), or
// lime and bone alone when the company has none. The neutral ring's grey is a
// company's absence, not a celebration (DEC-195 §6.22). The team colour is
// data, so it is checked as `#rrggbb` before it is written, as the avatar does.
//
// ★ THE LAYER DOES NOT CLIP (checkin's finding, DEC-197). Particles fly past
// the host's box on purpose, so the HOST must clip — `overflow: clip` on a
// positioned stage — or a burst at 390 px scrolls the page sideways. Never clip
// the scope itself (contract 3); clip the stage inside it.

const TEAM = /^#[0-9a-f]{6}$/;
const LIME = "var(--color-play-lime)";
const BONE = "var(--color-play-bone)";

export type ConfettiOptions = {
  /** The member's company colour, `#rrggbb`, or null when the company has none. */
  teamColor?: string | null;
  /** How many particles. The design's burst is 44. */
  count?: number;
  /** A source of randomness in [0, 1), for tests. */
  random?: () => number;
};

export type ConfettiBurst = {
  /** Settles when every particle has finished and the layer is gone. */
  finished: Promise<void>;
  /** Stops the burst and removes the layer now. */
  cancel: () => void;
};

const NOTHING: ConfettiBurst = { finished: Promise.resolve(), cancel: () => {} };

/** The colours a burst draws from, in the order it cycles through them. */
export function confettiColours(teamColor: string | null | undefined): string[] {
  const team = typeof teamColor === "string" && TEAM.test(teamColor) ? teamColor : null;
  return team ? [team, LIME, BONE, team, LIME, team] : [LIME, BONE, LIME, BONE, LIME, BONE];
}

/** Bursts confetti from the centre of `host`. `host` must be positioned; the layer fills it. */
export function burstConfetti(host: HTMLElement, options: ConfettiOptions = {}): ConfettiBurst {
  if (prefersReducedMotion()) return NOTHING;
  const party = readDuration("party", host);
  if (party === 0) return NOTHING;

  const layer = host.ownerDocument.createElement("div");
  layer.setAttribute("aria-hidden", "true");
  layer.dataset.confetti = "";
  Object.assign(layer.style, {
    position: "absolute",
    inset: "0",
    pointerEvents: "none",
    overflow: "visible",
  } satisfies Partial<CSSStyleDeclaration>);
  if (typeof layer.animate !== "function") return NOTHING;

  const random = options.random ?? Math.random;
  const colours = confettiColours(options.teamColor);
  const easing = readEasing("play", host);
  const count = options.count ?? 44;
  const animations: Animation[] = [];

  for (let i = 0; i < count; i++) {
    const p = host.ownerDocument.createElement("i");
    Object.assign(p.style, {
      position: "absolute",
      insetBlockStart: "50%",
      insetInlineStart: "50%",
      inlineSize: "8px",
      blockSize: "12px",
      borderRadius: "2px",
      background: colours[i % colours.length],
    } satisfies Partial<CSSStyleDeclaration>);
    layer.appendChild(p);

    // Rise, arc, fall — three keyframes of transform and opacity. The layout
    // is physical on purpose: a burst is symmetric, and `translate` has no
    // logical form (the one thing here that is geometry, not reading order).
    const angle = random() * Math.PI * 2;
    const distance = 120 + random() * 190;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance * 0.9;
    const turn = random() * 720 - 360;
    const animation = p.animate(
      [
        { transform: "translate(-50%, -50%) rotate(0deg) scale(.6)", opacity: 1 },
        { transform: `translate(calc(-50% + ${dx * 0.7}px), calc(-50% + ${dy * 0.55 - 60}px)) rotate(${turn * 0.5}deg) scale(1)`, opacity: 1, offset: 0.45 },
        { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + 120}px)) rotate(${turn}deg) scale(.9)`, opacity: 0 },
      ],
      // 0.78 – 1.33 of the party token: the design's 700 – 1200 ms around its 900.
      { duration: party * (0.78 + random() * 0.55), easing, fill: "forwards" },
    );
    animation.addEventListener("finish", () => p.remove());
    animations.push(animation);
  }

  host.appendChild(layer);

  let settled = false;
  const finished = Promise.allSettled(animations.map((a) => a.finished)).then(() => {
    settled = true;
    layer.remove();
  });

  return {
    finished,
    cancel: () => {
      if (settled) return;
      for (const a of animations) a.cancel();
      layer.remove();
    },
  };
}

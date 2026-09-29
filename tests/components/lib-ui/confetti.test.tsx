import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { burstConfetti, confettiColours } from "@/lib/ui/confetti";
import { fakeAnimate, removeFakeAnimate, setDurationTokens, setReducedMotion, type FakeAnimation } from "./motion-env";

let made: FakeAnimation[];
let host: HTMLElement;

beforeEach(() => {
  setReducedMotion(false);
  setDurationTokens({ party: "900ms" });
  made = fakeAnimate();
  host = document.createElement("div");
  host.style.position = "relative";
  document.body.appendChild(host);
});
afterEach(() => {
  vi.unstubAllGlobals();
  removeFakeAnimate();
  host.remove();
});

describe("burstConfetti", () => {
  it("draws 44 particles in an aria-hidden layer that takes no pointer events", () => {
    burstConfetti(host);
    const layer = host.querySelector<HTMLElement>("[data-confetti]");
    expect(layer).not.toBeNull();
    expect(layer!.getAttribute("aria-hidden")).toBe("true");
    expect(layer!.style.pointerEvents).toBe("none");
    expect(layer!.querySelectorAll("i")).toHaveLength(44);
    expect(made).toHaveLength(44);
  });

  it("★ touches transform and opacity only (REQ-UIX-020)", () => {
    burstConfetti(host, { count: 6 });
    for (const a of made) for (const k of a.keyframes) for (const prop of Object.keys(k)) expect(["transform", "opacity", "offset"]).toContain(prop);
  });

  it("★ sets no will-change on anything", () => {
    burstConfetti(host, { count: 6 });
    for (const el of host.querySelectorAll<HTMLElement>("*")) expect(el.style.willChange).toBe("");
  });

  it("★ leaves nothing behind: each particle and then the layer are removed when they finish", async () => {
    const burst = burstConfetti(host, { count: 5 });
    made.forEach((a) => a.finish());
    await burst.finished;
    expect(host.querySelector("[data-confetti]")).toBeNull();
    expect(host.children).toHaveLength(0);
  });

  it("takes its durations from the party token, 0.78 to 1.33 of it", () => {
    burstConfetti(host, { count: 20 });
    for (const a of made) {
      expect(a.options.duration as number).toBeGreaterThanOrEqual(900 * 0.78);
      expect(a.options.duration as number).toBeLessThanOrEqual(900 * 1.33);
    }
  });

  it("★ under reduced motion returns at once and touches no DOM", async () => {
    setReducedMotion(true);
    const burst = burstConfetti(host);
    await burst.finished;
    expect(host.children).toHaveLength(0);
    expect(made).toHaveLength(0);
  });

  it("does nothing when the token cannot be read — the static state, never a guessed duration", () => {
    document.documentElement.style.removeProperty("--duration-party");
    burstConfetti(host);
    expect(host.children).toHaveLength(0);
  });

  it("cancel removes the layer now", () => {
    const burst = burstConfetti(host, { count: 3 });
    burst.cancel();
    expect(host.children).toHaveLength(0);
    expect(made.every((a) => a.cancelled)).toBe(true);
  });
});

describe("confettiColours", () => {
  it("draws the team colour with lime and bone", () => {
    const c = confettiColours("#35d0ff");
    expect(c).toContain("#35d0ff");
    expect(c).toContain("var(--color-play-lime)");
    expect(c).toContain("var(--color-play-bone)");
  });

  it("★ with no team colour, lime and bone alone — never the neutral grey (DEC-195 §6.22)", () => {
    expect(new Set(confettiColours(null))).toEqual(new Set(["var(--color-play-lime)", "var(--color-play-bone)"]));
  });

  it("refuses a value that is not #rrggbb, as the avatar does", () => {
    for (const bad of ["#35D0FF", "red", "#fff", "url(x)", "#35d0ff;x"]) expect(confettiColours(bad)).not.toContain(bad);
  });
});

import { vi } from "vitest";

// jsdom has no `matchMedia` and no Web Animations API. These stand in for a
// browser that has both, so the mechanism can be driven from a test.

export function setReducedMotion(reduced: boolean): void {
  vi.stubGlobal(
    "matchMedia",
    vi.fn((query: string) => ({
      matches: query.includes("prefers-reduced-motion") ? reduced : false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

/** Sets the duration tokens on the root, as `globals.css` would. */
export function setDurationTokens(values: Partial<Record<"fast" | "base" | "slow" | "party", string>>): void {
  for (const [k, v] of Object.entries(values)) document.documentElement.style.setProperty(`--duration-${k}`, v);
}

export type FakeAnimation = { el: Element; keyframes: Keyframe[]; options: KeyframeAnimationOptions; finish: () => void; cancelled: boolean };

/** Replaces `Element.prototype.animate` with a recorder whose animations finish when told. */
export function fakeAnimate(): FakeAnimation[] {
  const made: FakeAnimation[] = [];
  const animate = function (this: Element, keyframes: Keyframe[], options: KeyframeAnimationOptions) {
    const target = new EventTarget();
    let resolve!: () => void;
    const finished = new Promise<void>((r) => (resolve = r));
    const record: FakeAnimation = {
      el: this,
      keyframes,
      options,
      cancelled: false,
      finish: () => {
        target.dispatchEvent(new Event("finish"));
        resolve();
      },
    };
    made.push(record);
    return Object.assign(target, {
      finished,
      cancel: () => {
        record.cancelled = true;
        resolve();
      },
    });
  };
  Object.defineProperty(Element.prototype, "animate", { value: animate, configurable: true, writable: true });
  return made;
}

export function removeFakeAnimate(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (Element.prototype as any).animate;
}

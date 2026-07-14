"use client";

import { useEffect, useRef } from "react";

/** Must match the sting-curtain animation-delay in globals.css. */
const CURTAIN_START = 2450;

/**
 * Production-logo opening sting (~3s, once per session, always skippable).
 * The pre-hydration gate script in the layout decides whether it plays by
 * setting html[data-sting="1"]; all choreography is pure CSS keyframes
 * (ignite → ripple → lines draw → wordmark light-sweep → curtain lift).
 * This component only owns the state machine and the skip.
 *
 * The curtain's own CSS animation is the clock — not a JS timer, which would
 * start at hydration and drift out of sync with what is actually on screen.
 * Once the curtain is lifting, skipping is refused: the page is already being
 * revealed, so a "skip" then would only mean dropping the overlay back onto it.
 */
export function IntroSting() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const html = document.documentElement;
    const el = ref.current;
    if (html.dataset.sting !== "1" || !el) return;

    sessionStorage.setItem("km-sting", "1"); // marked at start: a mid-sting reload skips

    const curtain = el
      .getAnimations()
      .find(
        (a): a is CSSAnimation =>
          (a as CSSAnimation).animationName === "sting-curtain",
      );

    let ended = false;
    let fade: ReturnType<typeof setTimeout>;

    const end = (skipped: boolean) => {
      if (ended) return;
      ended = true;
      stopListening();
      if (!skipped) {
        html.dataset.sting = "done";
        return;
      }
      // Fade the overlay out while its curtain keeps lifting underneath, then
      // retire it. "skipped" (not "done") is terminal here so the hero offset
      // stays at 0 — bouncing it back to 2650ms would re-hide the hero.
      html.dataset.sting = "skip";
      fade = setTimeout(() => {
        html.dataset.sting = "skipped";
      }, 240);
    };

    const skip = () => {
      if ((curtain?.currentTime ?? 0) >= CURTAIN_START) return;
      end(true);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "Enter" || e.key === " ") skip();
    };
    const stopListening = () => {
      window.removeEventListener("pointerdown", skip);
      window.removeEventListener("keydown", onKey);
    };
    window.addEventListener("pointerdown", skip);
    window.addEventListener("keydown", onKey);

    // finished also resolves immediately if hydration lands after the curtain.
    // It rejects when the animation is cancelled (a skip retiring the overlay).
    curtain?.finished.then(() => end(false)).catch(() => {});
    // The overlay must never be able to strand the page, animation or not.
    const safety = setTimeout(() => end(false), 6000);

    return () => {
      stopListening();
      clearTimeout(fade);
      clearTimeout(safety);
      // Leaving data-sting behind would keep --sting-offset on <html>, and a
      // client-side navigation back to the landing page would then hold the
      // hero at opacity 0 for 2.65s waiting on a sting that never plays again.
      delete html.dataset.sting;
    };
  }, []);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      className="sting theme-dark fixed inset-0 z-[60] flex-col items-center justify-center gap-10 !bg-navy-1000"
    >
      <svg width="360" height="240" viewBox="0 0 360 240" className="max-w-[80vw]">
        {/* ignition */}
        <circle className="sting-dot" cx="180" cy="120" r="4" fill="#FFFFFF" />
        <circle
          className="sting-ring"
          cx="180"
          cy="120"
          r="16"
          fill="none"
          stroke="#C9CED6"
          strokeWidth="1"
        />
        <circle
          className="sting-ring sting-ring-2"
          cx="180"
          cy="120"
          r="16"
          fill="none"
          stroke="#C9CED6"
          strokeWidth="0.8"
        />
        {/* the network draws itself outward */}
        <g stroke="#A8B3C4" strokeWidth="0.9" fill="none">
          <line className="sting-line" pathLength={1} x1="180" y1="120" x2="96" y2="70" style={{ animationDelay: "420ms" }} />
          <line className="sting-line" pathLength={1} x1="180" y1="120" x2="252" y2="52" style={{ animationDelay: "500ms" }} />
          <line className="sting-line" pathLength={1} x1="180" y1="120" x2="300" y2="140" style={{ animationDelay: "580ms" }} />
          <line className="sting-line" pathLength={1} x1="180" y1="120" x2="228" y2="196" style={{ animationDelay: "660ms" }} />
          <line className="sting-line" pathLength={1} x1="180" y1="120" x2="110" y2="182" style={{ animationDelay: "740ms" }} />
          <line className="sting-line" pathLength={1} x1="96" y1="70" x2="40" y2="108" style={{ animationDelay: "860ms" }} />
          <line className="sting-line" pathLength={1} x1="252" y1="52" x2="322" y2="76" style={{ animationDelay: "900ms" }} />
        </g>
        <g fill="#C9CED6">
          <circle className="sting-node" cx="96" cy="70" r="3" style={{ animationDelay: "920ms" }} />
          <circle className="sting-node" cx="252" cy="52" r="2.6" style={{ animationDelay: "1000ms" }} />
          <circle className="sting-node" cx="300" cy="140" r="3.2" style={{ animationDelay: "1080ms" }} />
          <circle className="sting-node" cx="228" cy="196" r="2.4" style={{ animationDelay: "1160ms" }} />
          <circle className="sting-node" cx="110" cy="182" r="2.8" style={{ animationDelay: "1240ms" }} />
          <circle className="sting-node" cx="40" cy="108" r="2" style={{ animationDelay: "1300ms" }} />
          <circle className="sting-node" cx="322" cy="76" r="2" style={{ animationDelay: "1340ms" }} />
        </g>
      </svg>

      <div className="sting-wordmark relative overflow-hidden px-6 text-center">
        <span lang="ar" dir="rtl" className="block text-[2.75rem] font-semibold leading-tight text-white">
          كريم معرفة
        </span>
        <span
          lang="en"
          dir="ltr"
          className="mt-3 block text-[0.8125rem] font-medium uppercase tracking-[0.2em] text-silver-400"
        >
          Knowledge Kareem
        </span>
        {/* light sweep across the lockup */}
        <span
          aria-hidden="true"
          className="sting-sweep pointer-events-none absolute inset-y-0 start-0 w-1/4 bg-gradient-to-r from-transparent via-white/45 to-transparent mix-blend-screen"
        />
      </div>
    </div>
  );
}

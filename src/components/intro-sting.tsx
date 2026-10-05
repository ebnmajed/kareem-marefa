"use client";

import { useEffect, useRef } from "react";
import { Logo } from "@/components/brand/logo";

/** Must match the sting-curtain animation-delay in globals.css. */
const CURTAIN_START = 2450;

/**
 * The landing's cold start — the mark's reveal (REQ-UIX-119, DEC-247), once per session, always skippable.
 *
 * ★ Wave 26 changed what is DRAWN here and nothing about when or whether: the four arcs draw in and settle
 * where a constellation used to. The gate is the same pre-hydration script in the locale layout —
 * `html[data-sting="1"]` on the first landing view of a session, JS on, motion allowed — and the state machine
 * below is the one `qa:contract` §7 and `qa:appearance` have always read: it never plays under reduced motion,
 * a click or a key skips it, a reload within the session does not replay it, and it can never strand the page.
 *
 * The curtain's own CSS animation is the clock — not a JS timer, which would start at hydration and drift out
 * of sync with what is actually on screen. Once the curtain is lifting, skipping is refused: the page is
 * already being revealed, so a "skip" then would only mean dropping the overlay back onto it.
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
      .find((a): a is CSSAnimation => (a as CSSAnimation).animationName === "sting-curtain");

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
      // Fade the overlay out while its curtain keeps lifting underneath, then retire it. "skipped" (not
      // "done") is terminal here, as it always was.
      html.dataset.sting = "skip";
      fade = setTimeout(() => {
        html.dataset.sting = "skipped";
      }, 240);
    };

    const skip = () => {
      // currentTime is CSSNumberish; for a time-driven animation it is a plain millisecond number, but it
      // must be coerced to compare.
      if (Number(curtain?.currentTime ?? 0) >= CURTAIN_START) return;
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

    // finished also resolves immediately if hydration lands after the curtain. It rejects when the animation
    // is cancelled (a skip retiring the overlay).
    curtain?.finished.then(() => end(false)).catch(() => {});
    // The overlay must never be able to strand the page, animation or not.
    const safety = setTimeout(() => end(false), 6000);

    return () => {
      stopListening();
      clearTimeout(fade);
      clearTimeout(safety);
      delete html.dataset.sting;
    };
  }, []);

  return (
    <div ref={ref} aria-hidden="true" className="sting fixed inset-0 z-[60] items-center justify-center bg-canvas">
      <Logo height={168} label={null} motion="reveal" />
    </div>
  );
}

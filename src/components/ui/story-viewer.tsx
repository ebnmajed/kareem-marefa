"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { Dialog as RadixDialog, Direction } from "radix-ui";
import type { StoryViewerFrame, StoryViewerProps } from "@/components/ui";
import { teamColorOrNull } from "@/components/ui/avatar";
import { ChevronIcon, CloseIcon, MoreIcon, PauseIcon, PlayIcon, PlusIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Menu } from "@/components/ui/menu";
import { ReactionBar } from "@/components/ui/reaction-bar";
import { usePlayPortal } from "@/components/ui/scope-portal";
import { zoomOpen, zoomShut } from "@/lib/ui/story-zoom";

// content's file — REQ-STO-007, REQ-STO-009, REQ-STO-005, DEC-093 (its seventh place), DEC-248 §7.7, DEC-251 §4.7.
// A session's story, and the next ring's after it. A dialog over the whole viewport, on the ink ground; from `lg` the
// same viewer centred at phone width with NOTHING added (REQ-STO-009). It renders every state from props and reads
// nothing: no DAL, no session, no catalogue — the frame's body arrives as a slot, the strings as `labels`.
//
// ★★ IT BEHAVES AS INSTAGRAM'S AND SNAPCHAT'S DO (DEC-278, the owner's ruling, amending DEC-251 §4.7's visible discs):
// the whole frame is the control, and nothing is drawn over it that a member already knows how to do.
//   tap the start third → previous, elsewhere → next   · ← → Home End
//   hold (≥ 220 ms) → pause, the chrome steps away     · Space
//   swipe sideways (> 60 px) → the next or previous story
//   swipe down (> 80 px) → close                        the close button stays — the one way out a member looks for · Escape
// ★ A TAP IS A SINGLE POINTER, never a path-based gesture, so SC 2.5.7 is met by the tap itself; the swipes are
// enhancements over taps and keys. Previous, next and pause remain REAL buttons for a keyboard and a screen reader —
// visually hidden until focused, never drawn over the frame.
// The arrows follow the READING direction: in RTL «next» lies to the left, so ← is next (the lightbox's rule).
//
// ★ THE CLOCK. A photo or text frame runs its `durationMs`; a video frame passes its element as `media` and the clock
// reads the element instead — its `ended` advances, `waiting` holds. Paused by the button, a hold, Space or a hidden
// tab. The segment is information, so ★ under `prefers-reduced-motion` IT STILL FILLS — in whole-second steps — and a
// frame changes WITHOUT the slide. The slide is the lead's `story-frame-in` keyframe (`globals.css`), never a moment.
//
// ★ Focus opens on the content so the keys work at once, is held by Radix's FocusScope, and returns on close to
// `returnFocusTo` (the ring) — the lightbox's pattern, since nothing here is a Radix trigger.

const HOLD_MS = 220;
const SWIPE_DOWN_PX = 80;
const SWIPE_SIDE_PX = 60;
/** A press that moved less than this is a tap, wherever it lifted. */
const TAP_SLOP_PX = 12;
const RESTART_AFTER_MS = 1500;

/** One frame's clock and the segments row. Remounted per frame (and per restart) by its key, so it never carries a
 *  previous frame's time. */
function Clock({
  frames,
  index,
  durationMs,
  media,
  running,
  reduced,
  elapsedRef,
  onDone,
}: {
  frames: StoryViewerFrame[];
  index: number;
  durationMs: number;
  media?: RefObject<HTMLVideoElement | null>;
  running: boolean;
  reduced: boolean;
  elapsedRef: { current: number };
  onDone: () => void;
}) {
  const [ratio, setRatio] = useState(0);
  const done = useRef(onDone);
  useEffect(() => {
    done.current = onDone;
  }, [onDone]);

  // A video is driven by its element: play and pause follow `running`, the end advances. ★ A browser that refuses to
  // play (a power-saving mode, an autoplay policy) hands the frame to the clock, so the story never stalls on it.
  const stalled = useRef(false);
  useEffect(() => {
    const el = media?.current;
    if (!el) return;
    if (running) {
      stalled.current = false;
      void el.play().catch(() => {
        stalled.current = true;
      });
    } else el.pause();
  }, [media, running]);
  useEffect(() => {
    const el = media?.current;
    if (!el) return;
    const ended = () => done.current();
    el.addEventListener("ended", ended);
    return () => el.removeEventListener("ended", ended);
  }, [media]);

  useEffect(() => {
    if (!running) return;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const el = stalled.current ? null : media?.current;
      if (el) {
        const total = Number.isFinite(el.duration) && el.duration > 0 ? el.duration : durationMs / 1000;
        elapsedRef.current = el.currentTime * 1000;
        const r = Math.min(1, el.currentTime / total);
        setRatio(reduced ? Math.floor(el.currentTime) / total : r);
      } else {
        elapsedRef.current += now - last;
        const r = Math.min(1, elapsedRef.current / durationMs);
        setRatio(reduced ? Math.min(1, Math.floor(elapsedRef.current / 1000) / (durationMs / 1000)) : r);
        if (elapsedRef.current >= durationMs) {
          done.current();
          return;
        }
      }
      last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame((now) => {
      last = now;
      tick(now);
    });
    return () => cancelAnimationFrame(raf);
  }, [running, durationMs, media, reduced, elapsedRef]);

  return (
    <div aria-hidden className="flex gap-1">
      {frames.map((f, i) => (
        // The boards' segment: a bone fill on a bone track at 35 % — read on any ground under the top scrim. `progress-bar`'s
        // raised track is a dark band on a team colour, so the segment is drawn here, grown by `scaleX` from the inline
        // start as that primitive's fill is (REQ-UIX-036), never by width.
        <span key={f.id} className="h-[3px] flex-1 overflow-hidden rounded-pill bg-fg-heading/35">
          <span
            data-slot="segment-fill"
            className="block h-full w-full bg-fg-heading ltr:origin-left rtl:origin-right"
            style={{ transform: `scaleX(${i < index ? 1 : i > index ? 0 : Math.min(1, Math.max(0, ratio))})` }}
          />
        </span>
      ))}
    </div>
  );
}

const REDUCED = "(prefers-reduced-motion: reduce)";
function subscribeReduced(change: () => void): () => void {
  if (typeof window.matchMedia !== "function") return () => {};
  const mq = window.matchMedia(REDUCED);
  mq.addEventListener("change", change);
  return () => mq.removeEventListener("change", change);
}
function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => typeof window.matchMedia === "function" && window.matchMedia(REDUCED).matches,
    () => false,
  );
}

const CONTROL = "inline-flex size-11 shrink-0 items-center justify-center rounded-pill bg-chrome text-fg-heading hover:bg-hover";
/** A control the keyboard and a screen reader reach, drawn only while it holds focus (DEC-278). Its 44 px disc is
 *  focus-only too: a `size-11` beside `sr-only` out-weighed it and left the disc drawn. */
const FOCUS_CONTROL =
  "sr-only focus-visible:not-sr-only focus-visible:inline-flex focus-visible:size-11 focus-visible:shrink-0 focus-visible:items-center focus-visible:justify-center focus-visible:rounded-pill focus-visible:bg-chrome focus-visible:text-fg-heading focus-visible:pointer-events-auto";

export function StoryViewer({ open, stories, storyIndex, onClose: closeNow, onFrameShown, returnFocusTo, paused: heldOutside = false, labels }: StoryViewerProps) {
  const rtl = Direction.useDirection() === "rtl";
  const reduced = usePrefersReducedMotion();
  const landing = usePlayPortal();

  // ★ Wave 29 (DEC-280 §5, REQ-UIX-123): the viewer grows out of the ring it was opened from (`returnFocusTo`) and
  // every close — «إغلاق», Escape, swipe-down, the end of the last story — shrinks it back into that ring before the
  // dialog closes. Nothing moves under reduced motion or without a ring: `onClose` then closes at once.
  const viewerRef = useRef<HTMLDivElement | null>(null);
  const shutting = useRef(false);
  // A callback ref, not an effect on `open`: Radix mounts the content through its portal a commit AFTER `open` turns
  // true, so an effect would find no element (measured). It zooms ONCE per opening — `zoomed` resets when the viewer
  // closes, never when the ref is re-attached on a render.
  const zoomed = useRef(false);
  useEffect(() => {
    if (!open) zoomed.current = false;
  }, [open]);
  function attach(el: HTMLDivElement | null) {
    viewerRef.current = el;
    if (el && !zoomed.current) {
      zoomed.current = true;
      zoomOpen(el, returnFocusTo?.current);
    }
  }
  function onClose() {
    if (shutting.current) return;
    const shrink = zoomShut(viewerRef.current, returnFocusTo?.current);
    if (!shrink) return closeNow();
    shutting.current = true;
    void shrink.finished.catch(() => undefined).then(() => {
      shutting.current = false;
      closeNow();
    });
  }

  const startOf = (s: number) => Math.min(Math.max(0, stories[s]?.startIndex ?? 0), Math.max(0, (stories[s]?.frames.length ?? 1) - 1));
  const [pos, setPos] = useState({ s: storyIndex, f: startOf(storyIndex) });
  const [opened, setOpened] = useState(open);
  // Re-opened, or opened on another ring: start where that ring's story starts (React's «adjust state during render»).
  if (open !== opened) {
    setOpened(open);
    if (open) setPos({ s: storyIndex, f: startOf(storyIndex) });
  }

  const [paused, setPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [restart, setRestart] = useState(0);
  const elapsedRef = useRef(0);
  const pointer = useRef<{ x: number; y: number; at: number; timer: number } | null>(null);
  const shown = useRef(new Set<string>());

  const story = stories[pos.s];
  const frame = story?.frames[pos.f];

  // Focus returns to the ring when the caller closes the viewer — whichever way it closed (a control, a key, a swipe,
  // the run's end). Radix's own return needs a trigger, and a ring is not one.
  const wasOpen = useRef(open);
  useEffect(() => {
    if (wasOpen.current && !open && returnFocusTo?.current?.isConnected) returnFocusTo.current.focus();
    wasOpen.current = open;
  }, [open, returnFocusTo]);

  useEffect(() => {
    const change = () => setHidden(document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => document.removeEventListener("visibilitychange", change);
  }, []);

  // Each frame is reported shown once per opening — the caller writes the view (REQ-STO-010).
  useEffect(() => {
    if (!open) {
      shown.current.clear();
      return;
    }
    if (story && frame && !shown.current.has(frame.id)) {
      shown.current.add(frame.id);
      onFrameShown?.(story.id, frame.id);
    }
  }, [open, story, frame, onFrameShown]);

  const goTo = useCallback((s: number, f: number) => {
    elapsedRef.current = 0;
    setPos({ s, f });
    setRestart((n) => n + 1);
  }, []);

  const next = useCallback(() => {
    if (!story) return;
    if (pos.f < story.frames.length - 1) goTo(pos.s, pos.f + 1);
    else if (pos.s < stories.length - 1) goTo(pos.s + 1, startOf(pos.s + 1));
    else onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startOf reads `stories`, already a dependency
  }, [story, stories, pos, goTo, onClose]);

  const previous = useCallback(() => {
    if (elapsedRef.current > RESTART_AFTER_MS) goTo(pos.s, pos.f);
    else if (pos.f > 0) goTo(pos.s, pos.f - 1);
    // At a story's first frame, a tap back opens the previous story where it starts — Instagram's rule.
    else if (pos.s > 0) goTo(pos.s - 1, startOf(pos.s - 1));
    else goTo(pos.s, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startOf reads `stories`
  }, [pos, goTo, stories]);

  const nextStory = useCallback(() => {
    if (pos.s < stories.length - 1) goTo(pos.s + 1, startOf(pos.s + 1));
    else onClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startOf reads `stories`
  }, [pos, stories, goTo, onClose]);

  const previousStory = useCallback(() => {
    if (pos.s > 0) goTo(pos.s - 1, startOf(pos.s - 1));
    else goTo(pos.s, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- startOf reads `stories`
  }, [pos, stories, goTo]);

  if (!story || !frame) return null;
  // `paused` from outside: a sheet the caller opened over the viewer (a report) holds the clock without pressing pause.
  const running = open && !paused && !held && !hidden && !heldOutside;
  const total = story.frames.length;
  const teamColour = teamColorOrNull(story.teamColor);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const target = event.target as HTMLElement;
    const interactive = target.closest("button, a, input, textarea, select, [role='menuitem']");
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      if (rtl) next();
      else previous();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      if (rtl) previous();
      else next();
    } else if (event.key === "Home") {
      event.preventDefault();
      goTo(pos.s, 0);
    } else if (event.key === "End") {
      event.preventDefault();
      goTo(pos.s, total - 1);
    } else if (event.key === " " && !interactive) {
      event.preventDefault();
      setPaused((p) => !p);
    }
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    // Captured, so a finger that slides off the layer mid-swipe still lifts here — the old `pointerleave` cancel lost
    // those swipes, and a tap that grazed an edge did nothing («finicky», the owner's word).
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const timer = window.setTimeout(() => setHeld(true), HOLD_MS);
    pointer.current = { x: event.clientX, y: event.clientY, at: performance.now(), timer };
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = pointer.current;
    pointer.current = null;
    if (!start) return;
    window.clearTimeout(start.timer);
    if (held) {
      setHeld(false);
      return;
    }
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (dy > SWIPE_DOWN_PX && Math.abs(dy) > Math.abs(dx)) {
      onClose();
      return;
    }
    if (Math.abs(dx) > SWIPE_SIDE_PX && Math.abs(dx) > Math.abs(dy)) {
      // The content follows the finger: in RTL the next story comes in from the left, so a swipe to the right.
      if (dx > 0 === rtl) nextStory();
      else previousStory();
      return;
    }
    if (Math.hypot(dx, dy) > TAP_SLOP_PX) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const fromStart = rtl ? rect.right - event.clientX : event.clientX - rect.left;
    if (fromStart < rect.width / 3) previous();
    else next();
  }

  function onPointerCancel() {
    if (pointer.current) window.clearTimeout(pointer.current.timer);
    pointer.current = null;
    setHeld(false);
  }

  const pauseOn = paused || held;
  // The meta line: the story's «presenter · company», then this frame's age — the age is the FRAME's, so it changes as
  // the run moves (`StoryLive`: «سارة القحطاني · مواهب · قبل 12 دقيقة»).
  const meta = [story.meta, frame.age].filter(Boolean).join(" · ");

  return (
    <RadixDialog.Root open={open} onOpenChange={(o) => (o ? null : onClose())}>
      <RadixDialog.Portal container={landing}>
        <RadixDialog.Content
          aria-describedby={undefined}
          onKeyDown={onKeyDown}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            (event.currentTarget as HTMLElement | null)?.focus();
          }}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (returnFocusTo?.current?.isConnected) returnFocusTo.current.focus();
          }}
          ref={attach}
          tabIndex={-1}
          data-story-viewer=""
          className="fixed inset-0 z-50 flex justify-center bg-canvas text-fg-heading outline-none"
        >
          <RadixDialog.Title className="sr-only">{labels.dialog}</RadixDialog.Title>
          <div
            data-frame-id={frame.id}
            data-paused={pauseOn || undefined}
            style={teamColour ? ({ "--team": teamColour } as CSSProperties) : undefined}
            className="relative flex h-full w-full flex-col overflow-hidden bg-void max-w-[calc(100dvh*0.625)] pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            {/* The frame, under everything. Keyed so a change of frame remounts it — and slides it in, motion allowed. */}
            <div key={`${frame.id}:${restart}`} className="absolute inset-0 motion-safe:animate-[story-frame-in_var(--dur-base)_var(--ease-out)]">
              {frame.content}
            </div>

            {/* The two scrims every board draws, so the bone chrome reads on any ground — the team's colour, a photograph:
                ink at 55 % fading down from the top, 60 % fading up from the bottom. */}
            <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-void/55 to-transparent" />
            <div aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-52 bg-gradient-to-t from-void/60 to-transparent" />

            {/* The gestures' layer: above the frame, below every control, and nothing to assistive technology — the
                controls are the conformance path, this is the enhancement. */}
            <div
              aria-hidden
              data-story-taps=""
              className="absolute inset-0 touch-none select-none"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onContextMenu={(e) => e.preventDefault()}
            />

            <div className="relative z-10 flex flex-col gap-3 px-3">
              <Clock
                key={`${frame.id}:${restart}`}
                frames={story.frames}
                index={pos.f}
                durationMs={frame.durationMs}
                media={frame.media}
                running={running}
                reduced={reduced}
                elapsedRef={elapsedRef}
                onDone={next}
              />
              {/* The header: the session's avatar ringed in bone, the title and the meta line, then «المزيد» (an attendee's
                  frame: «أزلني» · «بلّغ»), «أضف» and close at the inline-end — one row, so the frame keeps the screen
                  (DEC-278). It steps away while the frame is held, as Instagram's does. ★ The title is one line in a
                  MARK-SAFE box: the clip is on the text's own block, which carries padding-block and the body line-height. */}
              <div className={`flex items-center gap-2 ${held ? "opacity-0" : ""}`}>
                <span
                  aria-hidden
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-pill border-[3px] border-fg-heading bg-surface font-display text-body font-extrabold"
                >
                  <bdi>{story.glyph}</bdi>
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <bdi className="block truncate py-1 text-body-sm font-bold leading-[1.7]">{story.title}</bdi>
                  {meta ? <bdi className="block truncate text-caption text-fg-muted">{meta}</bdi> : null}
                </span>
                {frame.moderation ? (
                  <Menu
                    align="end"
                    trigger={
                      <button type="button" aria-label={frame.moderation.menuLabel} className={CONTROL}>
                        <MoreIcon aria-hidden />
                      </button>
                    }
                    items={frame.moderation.items.map((item) => ({ label: item.label, onSelect: item.onSelect }))}
                  />
                ) : null}
                {story.onAdd ? (
                  <button type="button" onClick={story.onAdd} aria-label={labels.add} className={CONTROL}>
                    <PlusIcon aria-hidden />
                  </button>
                ) : null}
                <RadixDialog.Close aria-label={labels.close} className={CONTROL}>
                  <CloseIcon aria-hidden />
                </RadixDialog.Close>
              </div>
            </div>

            {/* Previous, pause and next for a keyboard and a screen reader: real buttons, drawn only while focused, so
                nothing covers the frame for the touch a member already knows (DEC-278). */}
            {/* ★ `pointer-events-none`: this row spans the frame's middle, and without it every tap there landed on the row
                instead of the gestures' layer beneath. Only a focused button takes a pointer. */}
            <div className="pointer-events-none relative z-10 flex flex-1 items-center justify-between px-2">
              <button type="button" aria-label={labels.previous} onClick={previous} className={FOCUS_CONTROL}>
                <ChevronIcon direction="back" aria-hidden />
              </button>
              <button
                type="button"
                aria-pressed={pauseOn}
                aria-label={pauseOn ? labels.resume : labels.pause}
                onClick={() => setPaused((p) => !p)}
                className={FOCUS_CONTROL}
              >
                {pauseOn ? <PlayIcon aria-hidden /> : <PauseIcon aria-hidden />}
              </button>
              <p aria-live="polite" className="sr-only">
                {pauseOn ? labels.paused : labels.position(pos.f + 1, total)}
              </p>
              <button type="button" aria-label={labels.next} onClick={next} className={FOCUS_CONTROL}>
                <ChevronIcon direction="forward" aria-hidden />
              </button>
            </div>

            <div className={`relative z-10 flex items-center gap-2 px-4 ${held ? "opacity-0" : ""}`}>
              {frame.reactions ? (
                <ReactionBar label={frame.reactions.label} items={frame.reactions.items} onToggle={frame.reactions.onToggle} pending={frame.reactions.pending} className="flex-nowrap! gap-1.5!" />
              ) : null}
              <span className="flex-1" />
              {frame.action ? (
                <Link href={frame.action.href} onClick={closeNow} className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-pill bg-fg-heading px-4 font-display text-body font-extrabold text-canvas">
                  {frame.action.label}
                </Link>
              ) : null}
            </div>
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

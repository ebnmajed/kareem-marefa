"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type PointerEvent, type RefObject } from "react";
import { Dialog as RadixDialog, Direction } from "radix-ui";
import type { StoryViewerFrame, StoryViewerProps } from "@/components/ui";
import { teamColorOrNull } from "@/components/ui/avatar";
import { ChevronIcon, CloseIcon, MoreIcon, PauseIcon, PlayIcon, PlusIcon } from "@/components/ui/icons";
import { Link } from "@/components/ui/link";
import { Menu } from "@/components/ui/menu";
import { ProgressBar } from "@/components/ui/progress-bar";
import { ReactionBar } from "@/components/ui/reaction-bar";
import { usePlayPortal } from "@/components/ui/scope-portal";

// content's file — REQ-STO-007, REQ-STO-009, REQ-STO-005, DEC-093 (its seventh place), DEC-248 §7.7, DEC-251 §4.7.
// A session's story, and the next ring's after it. A dialog over the whole viewport, on the ink ground; from `lg` the
// same viewer centred at phone width with NOTHING added (REQ-STO-009). It renders every state from props and reads
// nothing: no DAL, no session, no catalogue — the frame's body arrives as a slot, the strings as `labels`.
//
// ★★ EVERY GESTURE HAS A PLAIN ALTERNATIVE AND A KEY (DEC-093, SC 2.5.7 — which is NOT SC 2.1.1, and which axe never
// catches). The gestures are enhancements laid over a layer the controls sit above:
//   tap the start third → previous, elsewhere → next   «الإطار السابق» / «الإطار التالي», always visible, 44 px · ← → Home End
//   hold (≥ 220 ms) → pause, release → resume          the pause button, `aria-pressed`, 44 px                 · Space
//   swipe down (> 80 px) → close                        the close button, 44 px                                 · Escape
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

  // A video is driven by its element: play and pause follow `running`, the end advances.
  useEffect(() => {
    const el = media?.current;
    if (!el) return;
    if (running) void el.play().catch(() => undefined);
    else el.pause();
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
      const el = media?.current;
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
        <ProgressBar key={f.id} decorative size="sm" fill="text" value={i < index ? 1 : i > index ? 0 : ratio} max={1} className="flex-1" />
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

export function StoryViewer({ open, stories, storyIndex, onClose, onFrameShown, returnFocusTo, paused: heldOutside = false, labels }: StoryViewerProps) {
  const rtl = Direction.useDirection() === "rtl";
  const reduced = usePrefersReducedMotion();
  const landing = usePlayPortal();

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
    if (elapsedRef.current > RESTART_AFTER_MS || pos.f === 0) goTo(pos.s, pos.f);
    else goTo(pos.s, pos.f - 1);
  }, [pos, goTo]);

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
          tabIndex={-1}
          data-story-viewer=""
          className="fixed inset-0 z-50 flex justify-center bg-canvas text-fg-heading outline-none"
        >
          <RadixDialog.Title className="sr-only">{labels.dialog}</RadixDialog.Title>
          <div
            data-frame-id={frame.id}
            data-paused={pauseOn || undefined}
            style={teamColour ? ({ "--team": teamColour } as CSSProperties) : undefined}
            className="relative flex h-full w-full max-w-[24.375rem] flex-col overflow-hidden bg-void pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            {/* The frame, under everything. Keyed so a change of frame remounts it — and slides it in, motion allowed. */}
            <div key={`${frame.id}:${restart}`} className="absolute inset-0 motion-safe:animate-[story-frame-in_var(--dur-base)_var(--ease-out)]">
              {frame.content}
            </div>

            {/* The gestures' layer: above the frame, below every control, and nothing to assistive technology — the
                controls are the conformance path, this is the enhancement. */}
            <div
              aria-hidden
              data-story-taps=""
              className="absolute inset-0 touch-none select-none"
              onPointerDown={onPointerDown}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerCancel}
              onPointerLeave={onPointerCancel}
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
              <div className="flex items-center gap-2.5">
                <span
                  aria-hidden
                  className={`inline-flex size-9 shrink-0 items-center justify-center rounded-pill border-[3px] bg-surface font-display text-body font-extrabold ${teamColour ? "border-team" : "border-team-neutral"}`}
                >
                  <bdi>{story.glyph}</bdi>
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <bdi className="truncate py-0.5 text-body-sm font-bold">{story.title}</bdi>
                  <bdi className="text-caption text-fg-muted">{story.meta}</bdi>
                </span>
                {story.onAdd ? (
                  <button type="button" onClick={story.onAdd} className={`${CONTROL} w-auto gap-1.5 px-3 text-label font-bold`}>
                    <PlusIcon aria-hidden />
                    {labels.add}
                  </button>
                ) : null}
                <button type="button" aria-pressed={pauseOn} aria-label={pauseOn ? labels.resume : labels.pause} onClick={() => setPaused((p) => !p)} className={CONTROL}>
                  {pauseOn ? <PlayIcon aria-hidden /> : <PauseIcon aria-hidden />}
                </button>
                <RadixDialog.Close aria-label={labels.close} className={CONTROL}>
                  <CloseIcon aria-hidden />
                </RadixDialog.Close>
              </div>
              {pauseOn ? (
                <span className="self-center rounded-pill bg-chrome px-3 py-1 text-caption font-bold">{labels.paused}</span>
              ) : null}
            </div>

            {/* Previous and next: ALWAYS visible tap targets at the two edges, mid-height (DEC-093). */}
            <div className="pointer-events-none relative z-10 flex flex-1 items-center justify-between px-2">
              <button type="button" aria-label={labels.previous} onClick={previous} className={`${CONTROL} pointer-events-auto`}>
                <ChevronIcon direction="back" aria-hidden />
              </button>
              <p aria-live="polite" className="sr-only">
                {labels.position(pos.f + 1, total)}
              </p>
              <button type="button" aria-label={labels.next} onClick={next} className={`${CONTROL} pointer-events-auto`}>
                <ChevronIcon direction="forward" aria-hidden />
              </button>
            </div>

            <div className="relative z-10 flex items-center gap-2 px-4">
              {frame.reactions ? (
                <ReactionBar label={frame.reactions.label} items={frame.reactions.items} onToggle={frame.reactions.onToggle} pending={frame.reactions.pending} className="flex-nowrap" />
              ) : null}
              <span className="flex-1" />
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
              {frame.action ? (
                <Link href={frame.action.href} onClick={onClose} className="inline-flex min-h-11 items-center rounded-pill bg-fg-heading px-4 font-display text-body font-extrabold text-canvas">
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

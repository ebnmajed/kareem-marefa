import { useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { prefersReducedMotion } from "./reduced-motion";

// ★★ ONCE PER OCCURRENCE, NEVER ON A RE-RENDER (REQ-UIX-044, DEC-195 §2).
//
// This is a state problem, not an animation problem. A moment keyed to a
// render fires again on every navigation back to the screen, and that is the
// defect this kind of work ships with. So a moment is keyed to its
// OCCURRENCE — a reservation, a check-in, a ledger row, a level, a rank — and
// the first mount to see that occurrence CLAIMS it. Every later mount, in this
// page's life or after a reload in the same tab, sees it claimed and renders
// the static state.
//
// What decides that an occurrence is new is not this module's job:
//   · moments 1 and 2 pass the key from the ACTION'S OWN RESULT, in the client
//     that performed it — a reload or another phone has no result, so no key;
//   · moments 3 to 5 are passed a key only for an occurrence the server says
//     the member has not seen (DEC-195 §2.6).
// This module is the second line: it makes a key play at most once even when
// the component mounts twice — React's strict mode, a remount, a back
// navigation that restores the same props.

export type MomentKind = "reservation" | "check-in" | "completion" | "level" | "rank";

export type MomentPhase = "static" | "playing";

const claimed = new Set<string>();
const STORAGE_KEY = "km-moments";

function storedKeys(): string[] {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

function store(key: string): void {
  try {
    // Bounded: a tab that reserves a hundred sessions keeps the last fifty.
    const keys = [...storedKeys().filter((k) => k !== key), key].slice(-50);
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Storage refused (a private window, a blocked origin): the in-memory set
    // still holds for this page's life, which is the re-render case.
  }
}

export function momentKey(kind: MomentKind, occurrenceId: string): string {
  return `${kind}:${occurrenceId}`;
}

/** True the first time a key is claimed; false for ever after. Records the claim. */
export function claimMoment(key: string): boolean {
  // Never on the server: module state there outlives the request, and would
  // claim a member's moment for everyone after them.
  if (typeof window === "undefined") return false;
  if (claimed.has(key)) return false;
  claimed.add(key);
  if (storedKeys().includes(key)) return false;
  store(key);
  return true;
}

/** True when a key has been claimed, without claiming it. */
export function isMomentClaimed(key: string): boolean {
  if (claimed.has(key)) return true;
  return typeof window !== "undefined" && storedKeys().includes(key);
}

/** Tests only: forget every claim. */
export function resetMomentsForTests(): void {
  claimed.clear();
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // nothing to forget
  }
}

// ★ A PAGE THE SERVER PAINTED NEVER JUMPS BACK (scoring's finding, DEC-197).
// `useLayoutEffect` decides before the first CLIENT paint — but on a hard load
// the server's HTML is already on screen, showing the truth: the new balance,
// the new level, the new order. Playing then would snap back to the old
// picture and animate forward: a flash of a figure that is no longer true.
// So the occurrence a component was HYDRATED with renders its static state and
// is NOT claimed: the occurrence stays unseen, and plays the
// next time the member arrives by the app's own navigation. Moments 1 and 2
// are never affected — their key comes from an action's result, which a
// server render never has.
const noSubscribe = () => () => {};
/** True during the render that hydrates server HTML; false for a mount the client made. */
function useIsHydrating(): boolean {
  return useSyncExternalStore(
    noSubscribe,
    () => false,
    () => true,
  );
}

// `useLayoutEffect` decides before the first paint, so a moment that will play
// never flashes its static state first. It is inert on the server, which
// renders the static state.
const useIsomorphicLayoutEffect = typeof window === "undefined" ? () => {} : useLayoutEffect;

/**
 * The moment's phase for an occurrence. `null` means there is no occurrence to
 * celebrate — a later visit, a reload, another device — and the phase is
 * `static` for good. Call `done()` when the sequence has finished.
 */
export function useMoment(kind: MomentKind, occurrenceId: string | null): { phase: MomentPhase; done: () => void } {
  const [phase, setPhase] = useState<MomentPhase>("static");
  // The key THIS instance claimed. React's strict mode runs an effect twice on
  // one instance, keeping its refs; the second run must not read the first
  // run's claim as someone else's. A real remount is a new instance, with a
  // fresh ref, and finds the key claimed — which is the silence we want.
  const mine = useRef<string | null>(null);
  // Read on the first render only: the occurrence this instance was born with, if it was born from server HTML.
  // ★ Per OCCURRENCE, not per instance (sessions' finding, DEC-197): the server painted the truth for the key it
  // rendered, so THAT key must not snap back — but a key that arrives later, from an action's result, was never
  // painted by anyone, and plays.
  const hydrating = useIsHydrating();
  const paintedByServer = useRef<string | null>(hydrating && occurrenceId !== null ? momentKey(kind, occurrenceId) : null);

  useIsomorphicLayoutEffect(() => {
    if (occurrenceId === null) {
      setPhase("static");
      return;
    }
    const key = momentKey(kind, occurrenceId);
    // The server painted this occurrence's truth: stay static, and leave it
    // unclaimed so a later client arrival plays it.
    if (paintedByServer.current === key) {
      setPhase("static");
      return;
    }
    if (mine.current === key) return;
    // Claimed even under reduced motion: the member has seen it, statically.
    const first = claimMoment(key);
    if (first) mine.current = key;
    setPhase(first && !prefersReducedMotion() ? "playing" : "static");
  }, [kind, occurrenceId]);

  return { phase, done: () => setPhase("static") };
}

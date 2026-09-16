"use client";

import { useEffect, useState } from "react";

// ★★ A WORKAROUND FOR A REACT 19.2 BUG, NOT A FEATURE — `DEC-135`. Delete this
// file, and every call to it, when the bundled React stops losing the ping.
//
// What wave 6 measured on a production build (the event page, a quiet
// machine): after «احجز مقعدك» the seat is in the database, the action's whole
// RSC response has arrived, the main thread is idle — and in about one press
// in three the page never commits. The button stays busy for 80 s and more,
// until ANY later React update anywhere commits it instantly.
//
// Why, read out of an instrumented `react-dom` in the verification worktree:
// the transition's render suspends on a Flight chunk that is still `pending`;
// the render yields; the chunk's row is parsed and it becomes `resolved_model`;
// React resumes, still counts it unresolved, unwinds, and calls
// `attachPingListener` — and Flight's `then()` initialises the chunk and pings
// SYNCHRONOUSLY, inside the render. The root is already marked
// "suspended with delay", so `pingSuspendedRoot` records nothing on the
// in-progress render, and `markRootSuspended` clears the root's pinged lane
// when the render ends. Nothing is scheduled. `markRootUpdated` clears
// `suspendedLanes` on any update, which is why typing one character "fixes" it.
// The event page exposed it in `ae7624e`: its async server components became
// ~95 lazy rows in every action or refresh payload (bisected; 8 of 8 clean
// before it).
//
// So while something is pending, this hook makes a cheap state update in its
// own component on an interval. Each update un-suspends the root and the lost
// retry runs; measured, 16 of 16 presses committed, the would-be hangs at the
// first tick. A transition that commits normally, inside `intervalMs`, never
// sees a tick.
//
// Use it wherever a member waits on a transition that re-renders server
// content: a form's pending state (`ui/submit-button`), a link navigation
// (`ui/route-progress`), a `router.refresh()` tracked in a transition.

/** While `pending`, re-render this component every `intervalMs` so a transition whose retry React lost still commits. */
export function usePendingNudge(pending: boolean, intervalMs = 300): void {
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!pending) return;
    const id = window.setInterval(() => setTick((tick) => tick + 1), intervalMs);
    return () => window.clearInterval(id);
  }, [pending, intervalMs]);
}

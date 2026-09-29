"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { isMomentClaimed, momentKey, useMoment, type MomentKind, type MomentPhase } from "@/lib/ui/moment";
import { prefersReducedMotion } from "@/lib/ui/reduced-motion";

// scoring's bridge between the lead's once-per-occurrence keying (`src/lib/ui/moment.ts`,
// contract 1) and the SEEN record (`member_seen_marks`, 0162, contract 5) — wave 16,
// REQ-UIX-047, REQ-UIX-048, DEC-195 §2.6, DEC-197 §5.
//
// `useMoment` answers «play or not». A surface of moments 3 to 5 must also know
// whether to tell the server the member has SEEN it, and that has three answers:
//
//   · `plays`     — this mount claimed the occurrence and is animating it: tell
//                   the server when the moment is DONE, with what it showed;
//   · `seen`      — shown statically (reduced motion, a remount after a claim,
//                   or no occurrence at all): tell the server now;
//   · `hydrating` — the page was painted by the server, so `useMoment` left the
//                   occurrence UNCLAIMED on purpose (DEC-197 §5): it must play at
//                   the next in-app arrival, so the server is told NOTHING.
//
// The verdict is read around `useMoment`'s own layout effect: whether the key was
// claimed BEFORE it ran, and whether it is claimed AFTER. Layout effects run in
// declaration order within a component, so both reads bracket the claim. The
// «before» read is kept in a ref and taken once, so React's strict mode, which
// runs an effect twice on one instance, does not read this mount's own claim as
// an earlier one.

export type SeenVerdict = "pending" | "plays" | "seen" | "hydrating";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? () => {} : useLayoutEffect;

export function useSeenMoment(kind: MomentKind, occurrenceId: string | null): { phase: MomentPhase; done: () => void; verdict: SeenVerdict } {
  const before = useRef<{ id: string | null; claimed: boolean } | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (before.current !== null && before.current.id === occurrenceId) return;
    before.current = { id: occurrenceId, claimed: occurrenceId !== null && isMomentClaimed(momentKey(kind, occurrenceId)) };
  }, [kind, occurrenceId]);

  const { phase, done } = useMoment(kind, occurrenceId);
  const [verdict, setVerdict] = useState<SeenVerdict>("pending");

  useIsomorphicLayoutEffect(() => {
    if (occurrenceId === null) {
      setVerdict("seen");
      return;
    }
    if (!isMomentClaimed(momentKey(kind, occurrenceId))) {
      setVerdict("hydrating");
      return;
    }
    setVerdict(before.current?.claimed || prefersReducedMotion() ? "seen" : "plays");
  }, [kind, occurrenceId]);

  return { phase, done, verdict };
}

/** Whether a surface's moments have settled enough to tell the server what was seen:
 *  none still deciding, none left unclaimed by a server paint, none still playing. */
export function readyToAcknowledge(parts: Array<{ verdict: SeenVerdict; finished: boolean }>): boolean {
  return parts.every((p) => p.verdict === "seen" || (p.verdict === "plays" && p.finished));
}

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
//   · `hydrating` — the page was painted by the server, so the occurrence is left
//                   UNCLAIMED on purpose (DEC-197 §5): it must play at the next
//                   in-app arrival, so the server is told NOTHING.
//
// ★ «Painted by the server» is read from the DOCUMENT as well as from React's
// hydration (the gate at a9bd97df, desktop). `/app` streams behind a
// `loading.tsx` (DEC-145): the page arrives in a hidden segment that an inline
// script swaps into `#main`, and when anything above it updates before that
// boundary finishes hydrating, React throws the server's HTML away and renders
// the boundary AFRESH — a client mount, which `useMoment`'s hydration guard
// cannot see, over a truth that was already on screen. So each surface writes
// its occurrences into `data-moment-keys`, and on its first render this looks
// for a VISIBLE element already carrying the key: if the server painted it, the
// occurrence is left unseen exactly as a hydration would leave it. A hidden
// copy (the orphaned streaming segment DEC-145 records) does not count, and an
// in-app arrival finds none — the previous screen is what is in the document.
//
// The verdict is read around `useMoment`'s own layout effect: whether the key was
// claimed BEFORE it ran, and whether it is claimed AFTER. Layout effects run in
// declaration order within a component, so both reads bracket the claim. The
// «before» read is kept in a ref and taken once, so React's strict mode, which
// runs an effect twice on one instance, does not read this mount's own claim as
// an earlier one.

export type SeenVerdict = "pending" | "plays" | "seen" | "hydrating";

const useIsomorphicLayoutEffect = typeof window === "undefined" ? () => {} : useLayoutEffect;

/** Whether a visible element in the document already shows this occurrence — the server's paint. Exported for its test. */
export function paintedInDocument(key: string): boolean {
  if (typeof document === "undefined") return false;
  for (const el of document.querySelectorAll("[data-moment-keys]")) {
    if (!(el.getAttribute("data-moment-keys") ?? "").split(" ").includes(key)) continue;
    if (!el.closest("[hidden]")) return true;
  }
  return false;
}

export function useSeenMoment(kind: MomentKind, id: string | null): { phase: MomentPhase; done: () => void; verdict: SeenVerdict } {
  // Read once, on the first render — before this mount's own DOM exists.
  const [painted] = useState(() => id !== null && paintedInDocument(momentKey(kind, id)));
  const occurrenceId = painted ? null : id;
  const before = useRef<{ id: string | null; claimed: boolean } | null>(null);

  useIsomorphicLayoutEffect(() => {
    if (before.current !== null && before.current.id === occurrenceId) return;
    before.current = { id: occurrenceId, claimed: occurrenceId !== null && isMomentClaimed(momentKey(kind, occurrenceId)) };
  }, [kind, occurrenceId]);

  const { phase, done } = useMoment(kind, occurrenceId);
  const [verdict, setVerdict] = useState<SeenVerdict>("pending");

  useIsomorphicLayoutEffect(() => {
    if (painted) {
      setVerdict("hydrating");
      return;
    }
    if (occurrenceId === null) {
      setVerdict("seen");
      return;
    }
    if (!isMomentClaimed(momentKey(kind, occurrenceId))) {
      setVerdict("hydrating");
      return;
    }
    setVerdict(before.current?.claimed || prefersReducedMotion() ? "seen" : "plays");
  }, [kind, occurrenceId, painted]);

  return { phase, done, verdict };
}

/** Whether a surface's moments have settled enough to tell the server what was seen:
 *  none still deciding, none left unclaimed by a server paint, none still playing. */
export function readyToAcknowledge(parts: Array<{ verdict: SeenVerdict; finished: boolean }>): boolean {
  return parts.every((p) => p.verdict === "seen" || (p.verdict === "plays" && p.finished));
}

/** The `data-moment-keys` a surface writes: its occurrences' keys, space-separated, or nothing. */
export function momentKeys(entries: Array<[MomentKind, string | null | undefined]>): string | undefined {
  const keys = entries.filter((e): e is [MomentKind, string] => Boolean(e[1])).map(([kind, id]) => momentKey(kind, id));
  return keys.length > 0 ? keys.join(" ") : undefined;
}

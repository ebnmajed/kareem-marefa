import type { ReactNode } from "react";
import { MomentPart } from "@/components/sessions/moment-reserve";

// The phone's bottom ACTION bar — `16` §6.1 note 2, §3 principle 9,
// REQ-SES-013, REQ-UIX-017.
//
// On the event page the tab bar is absent and this takes its place: the one
// primary action, plus bookmark and share, reachable at every scroll position —
// which is a better answer to REQ-SES-013's «reachable without scrolling» than
// any in-flow card, because a member who scrolls past a card has no way back
// to «احجز مقعدك».
//
// ★ RENDERED INSIDE THE ACTION CARD'S `<section>`, positioned fixed. The card
// is the region «الحضور», and on the phone the primary lives HERE, not in the
// card, so the region holds exactly one primary at every width — and so do the
// specs that look for it there.
//
// ★ `data-action-bar` is the contract with the shell: `globals.css` sets
// `--tabbar-h` to this bar's height below `md` while it is on the page, and the
// layout pads `<main>` and the scroll padding from that token, so nothing at the
// end of the page — and no focused control — sits behind the bar.
//
// ★ Wave 16 — moment 1 (REQ-UIX-045, DEC-195 §1.3). Below `md` the reservation
// happens HERE, so the row is the ticket's anchor and the element that thuds.
// The fixed bar itself is never transformed: a transform on it, or on anything
// above it, would change what `fixed` is fixed to. The primary is held back and
// revealed as the ticket leaves; outside the moment both parts are plain `<div>`s.

export function ActionBar({ primary, secondary }: { primary: ReactNode; secondary: ReactNode }) {
  if (!primary && !secondary) return null;
  return (
    <div
      data-action-bar=""
      className="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-canvas md:hidden"
      style={{ paddingBlockEnd: "calc(0.625rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <MomentPart thud="bar" anchor="bar" className="mx-auto flex max-w-xl items-center gap-2 px-3.5 pt-2.5">
        <MomentPart reveal="bar" className="min-w-0 flex-1">
          {primary}
        </MomentPart>
        {secondary}
      </MomentPart>
    </div>
  );
}

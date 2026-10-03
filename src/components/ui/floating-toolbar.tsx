"use client";

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from "react";
import type { FloatingToolbarProps } from "@/components/ui";

// The bar above the selection — REQ-UIX-107, DEC-235 §4 (`DEC-NEXT-36`), DEC-237. The lead's; both editors compose it.
//
// From `AdminCertDesigner.dc.html` and `AdminEmails.dc.html`: the five things touched most, on the selection; the
// rest is in the panel. It draws nothing of the document and computes no geometry — the caller hands it the box.
//
// ★★ PHYSICAL `left`/`top`, AND THAT IS `DEC-096`'s EXEMPTION, NOT AN OVERSIGHT. The anchor is a box in DOCUMENT
// geometry already turned physical by the caller (`toPhysical()` in the designer's overlay): an `inset-inline-start`
// here would resolve against the CONSOLE's direction and land on the wrong side when the two differ. Do not tidy it.
//
// ★ ONE TAB STOP, ARROWS ON THE VISUAL AXIS. `role="toolbar"` with a roving tabindex over its controls; ←/→ move to the
// control the eye sees on that side (in RTL ← is the next in DOM order), Home/End jump, Tab leaves. It never takes focus
// on its own when the selection changes.
//
// No motion (`REQ-UIX-053`): it appears where the selection is, without a transition.

const FOCUSABLE = "button:not([disabled]), a[href], input:not([disabled]), select:not([disabled])";
/** Room the bar needs above its target before it flips below — its own height and the gap. */
const FLIP_AT = 52;
const GAP = 8;

export function FloatingToolbar({ label, anchor, placement, offset = GAP, children, className = "" }: FloatingToolbarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const active = useRef(0);

  const controls = () => (ref.current ? Array.from(ref.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.closest("[data-slot=floating-toolbar]") === ref.current) : []);

  // The roving tabindex: one control in the tab order, the one last used.
  useEffect(() => {
    const all = controls();
    if (active.current >= all.length) active.current = 0;
    all.forEach((el, i) => el.setAttribute("tabindex", i === active.current ? "0" : "-1"));
  });

  function move(event: KeyboardEvent<HTMLDivElement>) {
    const all = controls();
    const index = all.indexOf(document.activeElement as HTMLElement);
    if (index < 0 || all.length === 0) return;
    const rtl = getComputedStyle(ref.current!).direction === "rtl";
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const back = rtl ? "ArrowRight" : "ArrowLeft";
    const last = all.length - 1;
    const next =
      event.key === forward ? (index === last ? 0 : index + 1)
      : event.key === back ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    all[index].setAttribute("tabindex", "-1");
    all[next].setAttribute("tabindex", "0");
    active.current = next;
    all[next].focus();
  }

  // ★ KEPT INSIDE ITS ANCESTOR. Centred on a small layer near the stage's edge, the bar would run past the ancestor and
  // under whatever sits beside it (the editor's panel covered its start — wave 23, slice 3a's capture). After layout,
  // the bar's measured width clamps its centre to [half, ancestor − half]; until measured it is centred as before.
  const [shift, setShift] = useState(0);
  const centre = anchor.left + anchor.width / 2;
  useLayoutEffect(() => {
    const bar = ref.current;
    const host = bar?.offsetParent as HTMLElement | null;
    if (!bar || !host) return;
    const half = bar.offsetWidth / 2;
    const room = host.clientWidth;
    const clamped = half * 2 >= room ? room / 2 : Math.min(Math.max(centre, half), room - half);
    setShift(clamped - centre);
  }, [centre, anchor.width]);

  const below = placement === "below" || (placement === undefined && anchor.top < FLIP_AT + offset - GAP);
  const top = below ? anchor.top + anchor.height + offset : anchor.top - offset;

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label={label}
      aria-orientation="horizontal"
      data-slot="floating-toolbar"
      data-placement={below ? "below" : "above"}
      onKeyDown={move}
      onFocus={(event) => {
        const i = controls().indexOf(event.target as HTMLElement);
        if (i >= 0) active.current = i;
      }}
      className={`absolute z-10 flex items-center gap-1 rounded-field border border-edge bg-raised p-1 text-label text-fg-heading ${className}`}
      style={{
        left: centre + shift,
        top,
        translate: below ? "-50% 0" : "-50% -100%",
      }}
    >
      {children}
    </div>
  );
}

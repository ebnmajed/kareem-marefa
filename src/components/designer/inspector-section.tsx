"use client";

import { useId, useState, type ReactNode } from "react";
import { ChevronIcon } from "@/components/ui/icons";

// One section of SCR-057's inspector — `16` §10.2's accordion.
//
// A disclosure, not a primitive: a button with `aria-expanded` over a region
// it controls, which is the whole of the pattern. The house has no accordion
// and one screen does not justify one. The trigger is a real `<button>`,
// never a `<summary>` — wave 3's capture found that Chromium exposes a
// `<summary>` as a disclosure triangle rather than a button, and a spec
// looking for the control by role waits thirty seconds for nothing.
//
// ★ «الموضع والحجم» is the one section closed by default (DEC-093): demoted,
// never removed. The numbers are the non-dragging path SC 2.5.7 requires.

export function InspectorSection({ title, defaultOpen = true, children }: { title: string; defaultOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  const regionId = useId();

  return (
    <section className="border-b border-edge last:border-b-0">
      <h3>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={regionId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-11 w-full items-center justify-between gap-2 py-2 text-start text-label text-fg-heading"
        >
          <span>{title}</span>
          <ChevronIcon direction={open ? "up" : "down"} className="text-fg-muted" />
        </button>
      </h3>
      <div id={regionId} hidden={!open} className="flex flex-col gap-4 pb-5">
        {children}
      </div>
    </section>
  );
}

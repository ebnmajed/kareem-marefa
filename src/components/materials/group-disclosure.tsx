"use client";

import { useEffect, useRef, type ReactNode } from "react";

// REQ-SES-018/DEC-121 — the lead's finding against the real build: mounting every group's add
// form OPEN made a three-day presenter page 9,000 CSS px tall (four upload forms, all on screen
// at once), and a ten-day workshop (allowed) would be worse. The form now sits BEHIND its own
// group's header control, closed by default.
//
// A native `<details>`/`<summary>` — no client state machine of any kind, works before hydration,
// and each group's disclosure is independent (opening one never closes another; DEC-121's own
// "no scope picker, no modal" spirit extends to "no coordinating state between groups" too). The
// ONLY thing native HTML cannot do on its own is move focus into the newly-revealed form — this
// component's `toggle` listener (a DOM event `<details>` already fires natively) does that one
// job and nothing else; it is not a second source of truth for open/closed, which stays the
// browser's own `open` attribute throughout.
//
// `open:basis-full` (Tailwind's built-in `[open]` variant) is what keeps the trigger sitting
// inline in the header row while closed (taking only its own text's width) and drops it onto its
// own full-width line, below the heading, the moment it opens — pure CSS, no JS, no separate
// "am I open" flag to keep in sync with the DOM's own.

interface GroupDisclosureProps {
  summary: ReactNode;
  summaryAriaLabel: string;
  children: ReactNode;
}

export function GroupDisclosure({ summary, summaryAriaLabel, children }: GroupDisclosureProps) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const details = detailsRef.current;
    if (!details) return;
    function onToggle() {
      if (!details!.open) return;
      contentRef.current?.querySelector<HTMLElement>("input, select, textarea, button")?.focus();
    }
    details.addEventListener("toggle", onToggle);
    return () => details.removeEventListener("toggle", onToggle);
  }, []);

  return (
    <details ref={detailsRef} className="shrink-0 open:basis-full">
      <summary aria-label={summaryAriaLabel} className="cursor-pointer list-none text-body-sm text-fg-body marker:content-none hover:text-fg-heading">
        {summary}
      </summary>
      <div ref={contentRef} className="mt-3 scroll-mt-4">
        {children}
      </div>
    </details>
  );
}

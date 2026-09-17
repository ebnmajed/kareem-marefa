"use client";

import { useEffect, useRef, type ReactNode } from "react";

// REQ-SES-018/DEC-121 — the twin of `materials/group-disclosure.tsx`; see its own header for the
// full reasoning (the lead's finding against the real build: every group's form mounted OPEN made
// a three-day presenter page 9,000 CSS px tall). A native `<details>`/`<summary>`, no client state
// machine; the `toggle` listener only moves focus into the newly-revealed form.

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

"use client";

import { useEffect, useRef, type MouseEvent } from "react";
import type { FormSummaryProps } from "@/components/ui";
import { AlertCircleIcon } from "@/components/ui/icons";

// ★ THE LITERAL ANSWER TO ASK 5 — «ليس هناك ما يوضّح الحقول التي فاتتني».
// `16` §8.2 item 4, REQ-UIX-010, DEC-091.
//
// Above the form on failure, focused programmatically, `role="alert"`, and
// EVERY failed field is a link that jumps to AND FOCUSES its control. The
// proposal form has had a summary since M2 and it lists messages that are not
// links — a member with six problems reads six sentences and then goes looking
// for six boxes. No other form in the product has a summary at all.
//
// ── three things that are not obvious ────────────────────────────────────
//
// ★ IT FOCUSES ITSELF ON MOUNT, and the caller keys it: `key={state.attempt}`.
// The effect has an empty dependency list, so React remounting on a new
// attempt is what moves focus — exactly once per failed round trip, INCLUDING
// two consecutive failures carrying identical errors, where an effect watching
// the error list would not fire. `attempt` exists for this (`lib/form-state`).
//
// ★ THE LINK DOES NOT TRUST THE FRAGMENT JUMP. A bare `#id` moves the
// browser's sequential-focus starting point but does not reliably FOCUS the
// target, and it never focuses a `<fieldset>`. So the click focuses the
// control itself, and where the id names a group it focuses the first control
// inside it — «الفئة: اختر تصنيفًا» must land on the select, not near it. The
// `href` stays for middle-click, for «copy link», and for the case where
// script has not run.
//
// ★★ AND THE HAZARD THIS FEATURE CREATES FOR ITSELF. An anchor jump under a
// sticky header lands the focused control BEHIND it — the accessibility
// feature defeating itself (`16` §3.1, SC 2.4.11). `element.focus()` scrolls
// with the CSS scroll-padding/scroll-margin applied, so REQ-UIX-017's tokens
// in `globals.css` are what stop it. That is an assumption about a file this
// component does not own, so it is ASSERTED — in
// `tests/components/ui/form-summary.test.tsx` against the stylesheet source,
// and geometrically in `tests/e2e/forms-propose.spec.ts` where there is a real
// renderer.

// Not `[tabindex]` in general: a `tabindex="-1"` element is programmatically
// focusable but is not where a member expects to land from a summary link.
const FOCUSABLE = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href], [tabindex]:not([tabindex^="-"])';

function controlFor(fieldId: string): HTMLElement | null {
  const el = document.getElementById(fieldId);
  if (!el) return null;
  return el.matches(FOCUSABLE) ? el : el.querySelector<HTMLElement>(FOCUSABLE);
}

export function FormSummary({ errors, title, className = "" }: FormSummaryProps) {
  const region = useRef<HTMLDivElement>(null);

  useEffect(() => {
    region.current?.focus();
  }, []);

  if (errors.length === 0) return null;

  const jump = (event: MouseEvent<HTMLAnchorElement>, fieldId: string) => {
    const control = controlFor(fieldId);
    if (!control) return; // nothing to focus — let the anchor do what it can
    event.preventDefault();
    // `focus()` scrolls the control into view honouring scroll-margin, which is
    // what keeps it out from under the sticky header. See the note above.
    control.focus();
  };

  return (
    <div
      ref={region}
      role="alert"
      tabIndex={-1}
      className={`rounded-field border border-error-border bg-error-bg p-4 focus-visible:outline-2 focus-visible:outline-offset-2 ${className}`}
    >
      <h2 className="flex items-start gap-2 text-label text-error">
        <AlertCircleIcon className="mt-[0.2em]" />
        <span>{title}</span>
      </h2>
      <ul className="mt-2 space-y-1">
        {errors.map((e) => (
          <li key={e.fieldId}>
            <a
              href={`#${e.fieldId}`}
              onClick={(event) => jump(event, e.fieldId)}
              // ★ `inline-block`, NOT `inline-flex`. Flex makes the `<bdi>`,
              // the colon and the message three FLEX ITEMS, so a message that
              // wraps at 390 px breaks between them and the field name is left
              // stranded on its own line. Found in the phone capture, not in
              // jsdom — the accessible name is identical either way.
              // `py-2.5` on a 24 px line box is the 44 px target (REQ-NFR-007).
              className="inline-block py-2.5 text-caption text-error underline underline-offset-4"
            >
              {/* The field's own name is an interpolated value, so it is
                  bidi-isolated; the message is a whole sentence in the
                  interface language and is not. */}
              <bdi>{e.label}</bdi>
              {": "}
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

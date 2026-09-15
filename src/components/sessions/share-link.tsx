"use client";

import { useRef, useState } from "react";

// «شارك الرابط» — the event page's share affordance (the owner's decision of
// 2026-09-15).
//
// ★ IT COPIES THE PUBLIC CARD'S URL, NOT THIS PAGE'S. The event page is a
// member's page: pasted into a group chat it previews as the sign-in screen,
// and opened by a non-member it stays the sign-in screen. `/{locale}/s/{id}`
// is the link that was built to be shared — the same session, six public
// fields, a preview image. The hint line says what the recipient will see, so
// the person sharing is not surprised by it later.
//
// The URL is rendered as TEXT as well as copied. `navigator.clipboard` needs
// a secure context and a permission that a phone browser can refuse, and a
// button that silently does nothing is worse than no button; the text is
// always selectable.

export function ShareLink({ url, label, copiedLabel, hint }: { url: string; label: string; copiedLabel: string; hint: string }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 4000);
    } catch {
      // The text below is the fallback: it is already on the page.
      setCopied(false);
    }
  }

  return (
    <div className="mt-6 border-t border-edge pt-6">
      <button
        type="button"
        onClick={copy}
        className="inline-flex min-h-11 items-center justify-center rounded-field border border-edge-strong px-5 py-2 text-label text-fg-heading"
      >
        {label}
      </button>
      <p role="status" className="mt-2 text-body-sm text-fg-muted">
        {copied ? copiedLabel : hint}
      </p>
      {/* Selectable, wrapping, and bidi-isolated: a Latin URL inside an
          Arabic paragraph reorders its slashes without this. It WRAPS rather
          than being clipped or ellipsised — a truncated URL is a wrong URL,
          and a clipped line loses tashkeel in the Arabic around it. */}
      <p className="mt-2 break-all text-body-sm text-fg-muted">
        <bdi dir="ltr">{url}</bdi>
      </p>
    </div>
  );
}

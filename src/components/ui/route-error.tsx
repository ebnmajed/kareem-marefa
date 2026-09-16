"use client";

import type { RouteErrorProps } from "@/components/ui";
import { AlertTriangleIcon } from "@/components/ui/icons";

// The shared body of every `error.tsx` — `16` §7.4, REQ-UIX-016, DEC-091.
//
// ★ AN ORDERING CONSEQUENCE, not a preference: `error.tsx` is a CLIENT
// component by Next's contract, so this is the one place in the app shell that
// cannot read the DAL. Everything it needs — the copy, the locale, the way
// back — comes from props or the route. A boundary that tried to fetch the
// member's name to apologise personally would fail inside the failure.
//
// What it says and does not say:
//   · WHAT HAPPENED, in one sentence, in the member's language;
//   · a RETRY wired to `reset()`, because most of these are transient — a
//     Supabase timeout, a signed URL that expired while the tab was open —
//     and no retry at all where there is nothing to retry (a not-found page);
//   · a way back to somewhere that works.
//   · NEVER a stack trace. NEVER an error code as the headline — the digest is
//     small, last, and for a support conversation.
//
// The shell is still around it: this renders inside `<main>`, so the member
// keeps the header, the tab bar and every route out of here. That is the whole
// difference between a route boundary and the global one.

export function RouteError({ title, description, retryLabel, backLabel, backHref, reset, digest }: RouteErrorProps) {
  return (
    <div role="alert" className="mx-auto max-w-prose py-8">
      <p className="mb-3 text-error">
        <AlertTriangleIcon aria-hidden className="text-[1.75rem]" />
      </p>
      <h1 className="text-h2 text-fg-heading">{title}</h1>
      <p className="mt-3 text-body text-fg-body">{description}</p>
      <p className="mt-6 flex flex-wrap gap-3">
        {retryLabel && reset ? (
          <button
            type="button"
            onClick={reset}
            className="inline-flex h-12 items-center rounded-field bg-navy-950 px-7 text-label text-white hover:bg-navy-900"
          >
            {retryLabel}
          </button>
        ) : null}
        <a
          href={backHref}
          className="inline-flex h-12 items-center rounded-field border border-edge-strong px-7 text-label text-fg-heading hover:bg-silver-100"
        >
          {backLabel}
        </a>
      </p>
      {digest ? (
        <p className="mt-8 text-body-sm text-fg-muted">
          {/* `<bdi>` because a digest is a Latin-and-digits run inside an
              Arabic sentence, and bidi would otherwise reorder it. */}
          <bdi>{digest}</bdi>
        </p>
      ) : null}
    </div>
  );
}

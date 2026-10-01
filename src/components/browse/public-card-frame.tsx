import type { ReactNode } from "react";
import { PlayWordmark } from "@/components/brand/wordmark";
import { Link } from "@/i18n/navigation";

// The public card's frame — SCR-007's brand row and legal footer
// (`PublicCard.dc.html`, REQ-UIX-059), shared by the card and its 404 so both
// read as the same page. No hook and no catalogue: the strings arrive as props,
// so the client `not-found.tsx` can use it as the server page does.
//
// The column is the artboard's phone width at every width — no 1280 artboard
// exists (DEC-206 §4.36) — and it fills the viewport, so the footer sits at the
// bottom of a short card. The layout (`s/layout.tsx`, the lead's) is the scope.

export function PublicCardFrame({ children }: { children: ReactNode }) {
  return <div className="mx-auto flex min-h-dvh w-full max-w-[26rem] flex-col">{children}</div>;
}

/** The wordmark at the start, leading to the public site (REQ-UIX-027); `aside` at the end. */
export function PublicCardHeader({ homeLabel, aside }: { homeLabel: string; aside?: ReactNode }) {
  return (
    <header className="flex items-center justify-between gap-3 px-4 pt-[18px] pb-2.5">
      <Link
        href="/"
        aria-label={homeLabel}
        className="inline-flex text-accent focus-visible:outline-[length:var(--focus-width)] focus-visible:outline-offset-4 focus-visible:outline-[var(--ring)]"
      >
        <PlayWordmark height={24} label={null} />
      </Link>
      {aside ? <p className="text-caption text-fg-muted">{aside}</p> : null}
    </header>
  );
}

/** The legal footer, ruled above it and pinned to the bottom of a short page. */
export function PublicCardFooter({ privacy, terms }: { privacy: string; terms: string }) {
  const link = "inline-flex min-h-11 items-center underline-offset-4 hover:text-fg-heading hover:underline";
  return (
    <footer className="mt-auto flex flex-wrap items-center justify-center gap-x-[18px] border-t border-edge px-4 pt-2 pb-4 text-caption text-fg-muted">
      <Link href="/legal/privacy" className={link}>
        {privacy}
      </Link>
      <Link href="/legal/terms" className={link}>
        {terms}
      </Link>
    </footer>
  );
}

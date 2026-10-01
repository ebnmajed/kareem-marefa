import type { ReactNode } from "react";

// ★ THE ONE SLOT (contract 1 of wave 18, REQ-UIX-054). The layout draws the top
// bar, the tab bar and the navigation rail; a page that has a GAME RAIL wraps its
// content in this and passes the rail. From `lg` it is the artboard's grid — the
// content at 600 px and the rail at 340 px, 24 px apart
// (`docs/design/screens/m10a/HomeDesktop.dc.html`) — and below `lg` the rail is
// not rendered as a column at all: a page shows on the phone what it needs of it,
// in its own flow (`SCR-010` shows the week as the HUD).
//
// A server component with no hook in it, so a page passes server components as
// `rail` and as `children`.
//
// The rail is sticky under the top bar and is a named region; nothing here is
// transformed, filtered or clipped.
export interface PageFrameProps {
  /** The game rail. Omit it and the content takes the whole column. */
  rail?: ReactNode;
  /** The rail's accessible name — required with `rail`. */
  railLabel?: string;
  children: ReactNode;
}

export function PageFrame({ rail, railLabel, children }: PageFrameProps) {
  if (!rail) return <>{children}</>;
  return (
    <div className="lg:grid lg:grid-cols-[minmax(0,600px)_340px] lg:items-start lg:gap-6">
      <div className="min-w-0">{children}</div>
      <aside aria-label={railLabel} className="sticky top-[88px] hidden flex-col gap-3 lg:flex">
        {rail}
      </aside>
    </div>
  );
}

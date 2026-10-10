/// <reference types="react/canary" />
import * as React from "react";
import type { ReactNode } from "react";

// The poster's shared name — wave 29 (DEC-280 §5, REQ-UIX-122, TRN-02).
//
// The card's poster (the feed, browse) and the event's hero carry the same name, `poster-<sessionId>`, so the
// browser flies one object from one to the other. `share="poster"` is the class the CSS times the flight by;
// `default="none"` keeps a named poster from crossfading on every unrelated transition. Not a client component —
// `<ViewTransition>` renders nothing of its own.
//
// ★ One name per page: a session drawn twice on one screen must name only one of its posters, or the browser
// refuses the whole transition. The callers below are the feed's post, browse's card and row, and the event's hero.
// ★ Where React has no `ViewTransition` — the plain 19.2 build the component tests run on — the name is simply absent
// and nothing moves, which is the design's own fallback.
const ViewTransition = (React as { ViewTransition?: typeof React.ViewTransition }).ViewTransition;

export function PosterName({ sessionId, children }: { sessionId: string; children: ReactNode }) {
  if (!ViewTransition) return <>{children}</>;
  return (
    <ViewTransition name={`poster-${sessionId}`} share="poster" default="none">
      {children}
    </ViewTransition>
  );
}

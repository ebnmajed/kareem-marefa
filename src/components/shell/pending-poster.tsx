"use client";

import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { handedPoster, takeHandedPoster } from "@/lib/ui/nav-motion";
import { flyFrom } from "@/lib/ui/poster-flight";

// The event skeleton's poster — wave 29 (DEC-280 §5, REQ-UIX-122, REQ-UIX-127).
//
// When the press that led here was a jump from this session's card, the skeleton draws THAT poster and flies it
// from the card's place (`poster-flight.ts`), so the jump lands the moment the skeleton commits; the hero then
// arrives in the same place. Otherwise — a hard load, a link from anywhere else, a card with no rendered poster —
// it draws the skeleton's own box (`fallback`) and nothing jumps.
//
// ★ Read once, at mount: the handoff is the press's, and a re-render must not change what the skeleton shows; it is
// taken once, so a later visit by any other path draws the box.
export function PendingPoster({ fallback }: { fallback: ReactNode }) {
  const params = useParams<{ id?: string }>();
  // ★ PEEKED in render, TAKEN in the effect: a concurrent render may be thrown away, and one that consumed the handoff
  // would leave the render React keeps with nothing (measured — the flight never played).
  const [poster] = useState(() => (params?.id ? handedPoster(params.id) : null));
  const box = useRef<HTMLDivElement>(null);
  // Before paint, inside the page's transition: the poster flies from the card into this slot (`poster-flight.ts`).
  useLayoutEffect(() => {
    if (!poster || !params?.id || !takeHandedPoster(params.id)) return;
    if (poster.from) flyFrom(box.current, poster.from, true);
  }, [poster, params?.id]);
  if (!poster) return <>{fallback}</>;
  return (
    <div ref={box} className="overflow-hidden rounded-tile" style={{ aspectRatio: String(poster.ratio) }}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the card's own decoded image, drawn at once; next/image would re-request it. */}
      <img src={poster.src} alt="" className="h-full w-full object-contain" />
    </div>
  );
}

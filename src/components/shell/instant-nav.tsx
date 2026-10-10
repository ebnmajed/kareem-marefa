"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NAV } from "@/components/shell/nav-items";
import { installIntentPrefetch, warmWhenIdle } from "@/lib/ui/intent-prefetch";

// The next screen, fetched before the tap lands (DEC-284, `src/lib/ui/intent-prefetch.ts`). Renders nothing.
//
// ★ `router.prefetch` fetches the FULL page (Next 16: the `static` freshness window, `next.config.ts`), not the
// skeleton a dynamic `<Link>` stops at. Intent anywhere in the shell prefetches the link pressed or hovered; when the
// browser is idle, the member's tabs — not the one they are on — are warmed.
// ★ `kind: "full"`: Next 16's router accepts it at runtime (`app-router-instance.js` maps it to the FULL fetch strategy)
// though its published type lists only `onInvalidate`. Without it a dynamic page is prefetched only to its
// `loading.tsx` skeleton, and the tap still waits for the server — measured (`perf-instant-nav.spec.ts`). If a later
// Next drops the kind, the router falls back to its default: the partial prefetch, never an error.
type FullPrefetch = (href: string, options: { kind: "full" }) => void;

export function InstantNav({ locale }: { locale: string }) {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    const full = (href: string) => (router.prefetch as unknown as FullPrefetch)(href, { kind: "full" });
    return installIntentPrefetch(full);
  }, [router]);

  useEffect(() => {
    const full = (href: string) => (router.prefetch as unknown as FullPrefetch)(href, { kind: "full" });
    const tabs = NAV.filter((n) => n.key !== "propose").map((n) => `/${locale}${n.href}`).filter((p) => p !== pathname);
    return warmWhenIdle(tabs, full);
  }, [locale, pathname, router]);

  return null;
}

"use client";

import { useLocale } from "next-intl";
import { RouteBoundary } from "@/components/shell/route-boundary";

// sessions's file — `16` §7.4, REQ-UIX-016, DEC-091, DEC-101.
//
// SCR-012 is the product's most important page and it composes four slots, any
// of which can fail on its own. This boundary is here rather than only at
// `/app/sessions` so that a failure on ONE session does not replace the
// catalogue as well: a member who followed a link to a broken event page can
// still get back to a list that works.
export default function SessionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useLocale();
  return <RouteBoundary error={error} reset={reset} backHref={`/${locale}/app`} />;
}

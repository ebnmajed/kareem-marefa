"use client";

import { useLocale } from "next-intl";
import { RouteBoundary } from "@/components/shell/route-boundary";

// SCR-012's error boundary — `16` §7.4, REQ-UIX-016, DEC-091. The page composes several slots, any of which
// can fail; a failure on one session must not take the catalogue with it, so the way back is the list.
export default function SessionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useLocale();
  return <RouteBoundary error={error} reset={reset} backHref={`/${locale}/app/sessions`} />;
}

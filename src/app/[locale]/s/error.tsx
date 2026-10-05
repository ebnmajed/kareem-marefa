"use client";

import { useLocale } from "next-intl";
import { RouteBoundary } from "@/components/shell/route-boundary";

// The public session card's error boundary — `16` §7.4, REQ-UIX-016, DEC-091.
export default function PublicSessionError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useLocale();
  return <RouteBoundary error={error} reset={reset} backHref={`/${locale}/app`} />;
}

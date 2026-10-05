"use client";

import { useLocale } from "next-intl";
import { RouteBoundary } from "@/components/shell/route-boundary";

// The verification page's error boundary: a public visitor is never left on a bare stack — `16` §7.4, REQ-UIX-016, DEC-091.
export default function VerifyError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useLocale();
  return <RouteBoundary error={error} reset={reset} backHref={`/${locale}/app`} />;
}

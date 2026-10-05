"use client";

import { useLocale } from "next-intl";
import { RouteBoundary } from "@/components/shell/route-boundary";

// The door's error boundary: a failure signing in keeps the locale layout; the way back is the platform, which sends a stranger to sign-in — `16` §7.4, REQ-UIX-016, DEC-091.
export default function AuthError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useLocale();
  return <RouteBoundary error={error} reset={reset} backHref={`/${locale}/app`} />;
}

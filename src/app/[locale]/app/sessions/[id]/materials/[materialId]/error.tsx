"use client";

import { useParams } from "next/navigation";
import { useLocale } from "next-intl";
import { RouteBoundary } from "@/components/shell/route-boundary";

// SCR-013's error boundary (REQ-UIX-016, DEC-091) — a segment with its own skeleton has its own boundary. It
// inherited the event page's, whose way back was the list; a viewer that failed goes back to its session.
export default function ViewerError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const locale = useLocale();
  const { id } = useParams<{ id: string }>();
  return <RouteBoundary error={error} reset={reset} backHref={`/${locale}/app/sessions/${id}`} />;
}

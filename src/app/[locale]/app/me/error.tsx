"use client";

// The route error boundary for the /app/me hub and its six tabs — REQ-UIX-016, DEC-091.
//
// It is a CLIENT component by Next's contract, so it cannot read the DAL.
// Everything it shows comes from `RouteBoundary`, which renders the shared
// `<RouteError>`: one sentence, a retry wired to `reset()`, a way back — never
// a stack trace and never an error code as the headline.
import { RouteBoundary } from "@/components/shell/route-boundary";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <RouteBoundary error={error} reset={reset} />;
}
